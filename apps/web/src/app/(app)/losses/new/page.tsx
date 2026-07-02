'use client';

/**
 * /losses/new — moysklad-parity «Списание» (write-off) editor.
 *
 * Internal stock-OUT: no counterparty, no VAT, no discount. A single «Склад», a
 * required «Статья расходов» (P&L expense item) + «Валюта документа», a per-line
 * «Причина списания» / «Ячейка», and read-only «Цена»/«Сумма» showing the store's
 * weighted-average себестоимость (the value the write-off books at post). Mirrors
 * the document-editor shell the gold-standard purchase-order/enter editors use —
 * the «Владелец» owner-access popover, the inline «Добавить позицию» typeahead, the
 * «Сумма ⚙» column customizer — so the editor is 1:1 with the live moysklad #loss
 * create page (docs/audits/losses-new-2026-06-25). The metadata grid sits ABOVE
 * the «Главная»/«Связанные документы» tabs (moysklad b-operation-form-top).
 *
 * COST: «Цена»/«Сумма» are READ-ONLY previews of the себестоимость. The form never
 * enters a per-line cost. себестоимость is a PRODUCT property, NOT tied to «Остаток»:
 * with stock it is the store weighted-average (GET /stocks, costBalanceMinor ÷ qty);
 * with 0 / negative stock it falls back to the product cost (buyPrice) so «Цена» is
 * never empty. LossService.post books the same basis (avg when stocked, else buyPrice
 * — 066d55fb valuation parity: a 0/negative-stock write-off still removes value).
 */

import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PriceRateDialog } from '@/components/products/price-rate-dialog';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { scaleMinorByQty } from '@moysklad/money';
import {
  Button,
  CatalogPicker,
  CatalogPickerField,
  type DocPositionRow,
  DocumentDisclosurePanel,
  DocumentEditor,
  DocumentMetaField,
  DocumentMetaRow,
  DocumentTabs,
  Icons,
  Input,
  NativeSelect,
  type PickerItem,
  type PositionColumnKey,
  PositionInlineAdd,
  PositionNameCell,
  PositionTable,
  type PositionTableColumnConfig,
  Textarea,
  formatMoney,
} from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

interface RefItem {
  id: string;
  name: string;
  legalTitle?: string | null;
  code?: string | null;
}
// Account currency (Настройки → Валюты). `isoCode` = UZS/USD…; `default` = base;
// `rateValue` (×1e8) / `rate` = value vs the base currency.
interface CurrencyItem {
  id: string;
  isoCode: string;
  name: string;
  default: boolean;
  rateValue: string;
  rate: string;
}
interface ProductItem {
  id: string;
  name: string;
  code: string | null;
  uom: string | null;
  mainImageId?: string | null;
  // «Себестоимость» reference — the product's cost, shown as «Цена» when the store
  // has NO stock (the себестоимость is a product property, NOT derived from the
  // current «Остаток»: a 0 / negative stock still has a cost). (NB: `buyPrice`,
  // not buyPriceMinor — the field probed live.)
  buyPrice: string | null;
}
interface StockItem {
  assortmentId: string;
  qty: string;
  costBalanceMinor: string;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// moysklad #loss «⚙» customizer — the optional position columns. The grounded
// default grid (docs/audits/losses-new-2026-06-25/10-editor-full.png) shows:
// Наименование · Кол-во · Ячейка · Остаток · Цена · Сумма · Причина списания.
// «Цена»/«Сумма» (себестоимость) are always-on; these toggle the rest.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'cell', labelKey: 'cell', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'reason', labelKey: 'write_off_reason', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewLossPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.losses');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.loss');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad loss FSM = draft / posted / cancelled. Status pill reads «Статус»
  // (none picked) on a new doc — the built-in FSM is decorative here.
  const STATUS_OPTIONS = [
    { value: 'draft', label: tStates('draft'), color: '#e8eef5' },
    { value: 'posted', label: tStates('posted'), color: '#cfe8d3' },
    { value: 'cancelled', label: tStates('cancelled'), color: '#f4d4d4' },
  ];

  const { data: orgsData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations'),
  });
  const { data: storesData } = useQuery<{ items: RefItem[] }>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores'),
  });

  // «Валюта документа» — option list + rates from the account's REAL currencies
  // (GET /currencies). Loss is carried in the base currency (UZS), but the field
  // is shown 1:1 with the editor.
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);
  const [currency, setCurrency] = useState<string>('UZS');
  const baseAppliedRef = useRef(false);
  useEffect(() => {
    if (baseAppliedRef.current || currencies.length === 0) return;
    baseAppliedRef.current = true;
    const base = currencies.find((c) => c.default) ?? currencies[0];
    if (base) setCurrency(base.isoCode);
  }, [currencies]);
  const selectedCurrency = currencies.find((c) => c.isoCode === currency);
  const isBaseCurrency = selectedCurrency?.default ?? currency === 'UZS';
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  // moysklad «1 USD = 12 200 UZS ✎» — the ✎ opens the «Курс валюты документа» modal
  // (PriceRateDialog) to override the rate PER-DOCUMENT. The override (major units)
  // defaults to the account rate and resets when the currency changes.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const globalRate = selectedCurrency?.rate ?? '1';
  const effectiveRate = rateOverride ?? globalRate;
  const overrideRateValue =
    rateOverride && Number(rateOverride) > 0
      ? String(BigInt(Math.round(Number(rateOverride) * 1e8)))
      : null;
  const effectiveRateValue = isBaseCurrency
    ? '100000000'
    : (overrideRateValue ?? selectedCurrency?.rateValue ?? '100000000');

  // «Статья расходов» — the account's expense items (GET /expense-items). moysklad
  // defaults the write-off to «Списания»; the stored value is the item NAME.
  const { data: expenseItemsData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['expense-items'],
    queryFn: () => api.get('/expense-items'),
    staleTime: 60_000,
  });
  const [expenseItemId, setExpenseItemId] = useState<string | null>(null);
  const [expenseItemLabel, setExpenseItemLabel] = useState<string>('Списания');
  const expenseDefaultRef = useRef(false);
  useEffect(() => {
    if (expenseDefaultRef.current || !expenseItemsData) return;
    expenseDefaultRef.current = true;
    const spis = expenseItemsData.items.find((e) => e.name.toLowerCase() === 'списания');
    if (spis) {
      setExpenseItemId(spis.id);
      setExpenseItemLabel(spis.name);
    }
  }, [expenseItemsData]);

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [status, setStatus] = useState<string>('');
  // moysklad «Проведено» is CHECKED by default — the write-off is created posted
  // (we create the draft then post it; see createMut).
  const [applicable, setApplicable] = useState(true);

  // Meta state
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationLabel, setOrganizationLabel] = useState<string>('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState<string>('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [externalCodeVisible, setExternalCodeVisible] = useState(false);
  const [description, setDescription] = useState('');

  // «Владелец» (owner/access) — defaults to the current user; department + «Общий
  // доступ» editable via the header popover. Sent on create.
  const [ownerAccess, setOwnerAccess] = useState<OwnerAccessValue>(() => ({
    ownerId: user?.id ?? null,
    ownerLabel: user?.name ?? '',
    groupId: null,
    groupLabel: '',
    shared: false,
  }));

  // Positions
  const [positions, setPositions] = useState<NewPositionRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // moysklad «Наименование ▾ → ☐ С учётом групп» — group lines by product folder first.
  const [withGroups, setWithGroups] = useState(false);
  // «Цена» clickable header — toggle sort the lines by себестоимость (asc/desc).
  const [priceSortDir, setPriceSortDir] = useState<'asc' | 'desc' | null>(null);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    null | 'org' | 'store' | 'project' | 'expense' | { kind: 'product'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the user's «Значения по умолчанию» once references settle.
  const userDefaults = useUserDefaults();
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!orgsData || !storesData) return;
    if (userDefaults.isLoading) return;
    defaultsAppliedRef.current = true;
    const us = userDefaults.data;
    if (!organizationId) {
      const org = us?.defaultCompany ?? orgsData.items[0];
      if (org) {
        setOrganizationId(org.id);
        setOrganizationLabel(org.name);
      }
    }
    if (!storeId) {
      const store = us?.defaultStore ?? storesData.items[0];
      if (store) {
        setStoreId(store.id);
        setStoreLabel(store.name);
      }
    }
    if (!projectId && us?.defaultProject) {
      setProjectId(us.defaultProject.id);
      setProjectLabel(us.defaultProject.name);
    }
  }, [
    orgsData,
    storesData,
    userDefaults.data,
    userDefaults.isLoading,
    organizationId,
    storeId,
    projectId,
  ]);

  // Store stock + weighted-average cost preview — drives «Остаток» (qty) and the
  // read-only «Цена»/«Сумма» (себестоимость) columns.
  const assortmentIds = useMemo(
    () => positions.map((p) => p.assortmentId).filter((id): id is string => !!id),
    [positions],
  );
  const { data: stockData } = useQuery<{ items: StockItem[] }>({
    queryKey: ['stocks', storeId, assortmentIds.join(',')],
    queryFn: () =>
      api.get(
        `/stocks?storeId=${storeId}&assortmentIds=${encodeURIComponent(assortmentIds.join(','))}`,
      ),
    enabled: !!storeId && assortmentIds.length > 0,
  });
  const stockMap = useMemo(() => {
    const m = new Map<string, StockItem>();
    for (const r of stockData?.items ?? []) m.set(r.assortmentId, r);
    return m;
  }, [stockData]);
  // Sync the live «Остаток» (qty) + «Цена» (себестоимость) onto each row when the
  // stock query settles. «Цена» is the store weighted-average cost ONLY when there
  // IS stock (q>0); with 0/negative stock the average is undefined, so «Цена» KEEPS
  // the product cost (buyPrice, set on add) — стоимость is a product property, NOT
  // tied to «Остаток». Only patches changed rows (no loop).
  useEffect(() => {
    if (stockMap.size === 0) return;
    setPositions((ps) => {
      let changed = false;
      const next = ps.map((p) => {
        if (!p.assortmentId) return p;
        const s = stockMap.get(p.assortmentId);
        if (!s) return p;
        const q = Number(s.qty);
        const nextPrice = q > 0 ? String(Math.round(Number(s.costBalanceMinor) / q)) : p.priceMinor;
        if (p.stock === s.qty && p.priceMinor === nextPrice) return p;
        changed = true;
        return { ...p, stock: s.qty, priceMinor: nextPrice };
      });
      return changed ? next : ps;
    });
  }, [stockMap]);

  // «Итого» — read-only себестоимость total (Σ avg-unit-cost × Кол-во). Matches
  // each row's «Сумма» exactly (single BigInt source).
  const totals = useMemo(
    () =>
      positions.reduce((acc, p) => {
        const cost = BigInt(p.priceMinor || '0');
        return acc + scaleMinorByQty(cost, p.quantity || '0');
      }, 0n),
    [positions],
  );
  const totalQty = useMemo(
    () => positions.reduce((acc, p) => acc + (Number(p.quantity) || 0), 0),
    [positions],
  );

  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };
  const addEmptyPosition = () => {
    setPositions((ps) => [
      ...ps,
      {
        id: uid(),
        assortmentId: null,
        productLabel: '',
        productUom: null,
        quantity: '1',
        priceMinor: '0',
        discount: '0',
        vat: '0',
        vatEnabled: false,
      },
    ]);
  };

  // moysklad #loss position columns. Order (live grounding): Наименование · Кол-во ·
  // Ячейка · Остаток · Цена · Сумма · Причина списания. «Цена»/«Сумма» are
  // read-only себестоимость (costPerUnit/costTotal fed by priceMinor).
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.cell)
      cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    // «Цена» = EDITABLE себестоимость input (moysklad parity — the user can type
    // the write-off cost; default = the product buyPrice). «Сумма» = Цена × Кол-во
    // (computed). The brand-blue «Цена ▾» header button toggles sorting by cost.
    cols.push({
      key: 'price',
      label: (
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
          onClick={() => {
            const dir = priceSortDir === 'asc' ? 'desc' : 'asc';
            setPriceSortDir(dir);
            setPositions((ps) =>
              [...ps].sort((a, b) => {
                const av = Number(a.priceMinor || '0');
                const bv = Number(b.priceMinor || '0');
                return dir === 'asc' ? av - bv : bv - av;
              }),
            );
          }}
          data-test-id="position-price-sort"
        >
          {tCols('price')}
          <Icons.down
            className={`h-3 w-3 transition-transform ${priceSortDir === 'asc' ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      ),
    });
    cols.push({ key: 'amount', label: tCols('amount') });
    if (colVisible.reason) cols.push({ key: 'reason', label: tCols('write_off_reason') });
    cols.push({
      key: 'menu',
      label: (
        <PositionColumnCustomizer
          options={OPTIONAL_POSITION_COLUMNS.map((c) => ({
            key: c.key,
            label: tCols(c.labelKey),
          }))}
          visible={colVisible}
          onToggle={(key, next) => setColVisible((v) => ({ ...v, [key]: next }))}
          ariaLabel={tCols('configure')}
        />
      ),
    });
    return cols;
  }, [colVisible, tCols, tPos, priceSortDir]);

  // moysklad creates the write-off POSTED (Проведено checked). We create the draft
  // then post it via the transition. createdIdRef guards retries from making a
  // duplicate draft when posting fails (e.g. insufficient stock) — a retry posts
  // the EXISTING draft instead of re-creating.
  const createdIdRef = useRef<string | null>(null);
  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      if (positions.length === 0) throw new Error(tErrors('at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
      }
      let id = createdIdRef.current;
      if (!id) {
        const payload = {
          organizationId,
          storeId,
          ...(projectId ? { projectId } : {}),
          expenseItem: expenseItemLabel || undefined,
          ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
          ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
          ...(ownerAccess.shared ? { shared: true } : {}),
          ...(externalCode ? { externalCode } : {}),
          description: description || undefined,
          ...(docNumber ? { name: docNumber } : {}),
          moment: docDate ? new Date(docDate).toISOString() : undefined,
          currency,
          rateValue: effectiveRateValue,
          positions: positions.map((p) => ({
            assortmentKind: 'product',
            // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above
            assortmentId: p.assortmentId!,
            quantity: p.quantity,
            // «Цена» — the entered себестоимость the write-off books at.
            ...(p.priceMinor && p.priceMinor !== '0' ? { costMinor: p.priceMinor } : {}),
            ...(p.reason ? { reason: p.reason } : {}),
            ...(p.cell ? { cell: p.cell } : {}),
          })),
        };
        const created = await api.post<{ id: string }>('/losses', payload);
        id = created.id;
        createdIdRef.current = id;
      }
      // moysklad «Проведено» — post the freshly-created write-off (decrements stock).
      if (applicable) await api.post(`/losses/${id}/transitions/post`, {});
      return { id };
    },
    onSuccess: ({ id }) => {
      createdIdRef.current = null;
      router.push(`/losses/${id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const orgFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/organizations?search=${encodeURIComponent(s)}`);
    return d.items.map((o) => ({
      id: o.id,
      primary: o.name,
      secondary: o.legalTitle ?? undefined,
    }));
  };
  const storeFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: RefItem[] }>(`/stores?search=${encodeURIComponent(s)}`);
    return d.items.map((st) => ({ id: st.id, primary: st.name, secondary: st.code ?? undefined }));
  };
  const projectFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/projects?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const expenseFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/expense-items?search=${encodeURIComponent(s)}`,
    );
    return d.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  const productFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: ProductItem[] }>(
      `/products?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((p) => ({
      id: p.id,
      primary: p.name,
      secondary: p.code ?? undefined,
      meta: p.uom ?? undefined,
      raw: p,
    }));
  };

  const applyProductToRow = (rowUid: string, item: PickerItem) => {
    const raw = (item as PickerItem & { raw?: ProductItem }).raw;
    updatePosition(rowUid, {
      assortmentId: item.id,
      productLabel: String(item.primary),
      productCode: raw?.code ?? undefined,
      productUom: raw?.uom ?? null,
      // «Цена» = the product cost (себестоимость) by default — shown immediately,
      // independent of «Остаток»; replaced by the store avg only when stock>0.
      priceMinor: raw?.buyPrice ?? '0',
      imageUrl: raw?.mainImageId ? `/api/v1/images/${raw.mainImageId}/raw` : undefined,
    });
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        testId={`pos-${p.id}-name`}
      />
    );
  };

  // moysklad b-operation-form-top — the metadata grid sits ABOVE the tabs and
  // stays visible across tab switches. Row pairing (grounded): Организация↔Склад ·
  // Проект↔Статья расходов · Валюта документа.
  const metaPanel = (
    <div className="max-w-[860px] space-y-2 bg-[var(--ms-bg-surface)] px-4 py-3">
      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('organization')} required>
          <CatalogPickerField
            value={organizationId ? { id: organizationId, label: organizationLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('org')}
            inlineFetcher={orgFetcher}
            onInlineSelect={(item) => {
              setOrganizationId(item.id);
              setOrganizationLabel(String(item.primary));
            }}
            onClear={() => {
              setOrganizationId(null);
              setOrganizationLabel('');
            }}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('store')} required>
          <CatalogPickerField
            value={storeId ? { id: storeId, label: storeLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('store')}
            inlineFetcher={storeFetcher}
            onInlineSelect={(item) => {
              setStoreId(item.id);
              setStoreLabel(String(item.primary));
            }}
            onClear={() => {
              setStoreId(null);
              setStoreLabel('');
            }}
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      <DocumentMetaRow fixedWidth>
        <DocumentMetaField label={tFields('project')}>
          <CatalogPickerField
            value={projectId ? { id: projectId, label: projectLabel } : null}
            placeholder=""
            onPick={() => setOpenPicker('project')}
            inlineFetcher={projectFetcher}
            onInlineSelect={(item) => {
              setProjectId(item.id);
              setProjectLabel(String(item.primary));
            }}
            onClear={() => {
              setProjectId(null);
              setProjectLabel('');
            }}
            onCreate={() => router.push('/projects/new')}
            createLabel={tForm('create_new_project')}
          />
        </DocumentMetaField>
        <DocumentMetaField label={tFields('expense_item')} required>
          <CatalogPickerField
            value={
              expenseItemLabel ? { id: expenseItemId ?? 'spis', label: expenseItemLabel } : null
            }
            placeholder=""
            onPick={() => setOpenPicker('expense')}
            inlineFetcher={expenseFetcher}
            onInlineSelect={(item) => {
              setExpenseItemId(item.id);
              setExpenseItemLabel(String(item.primary));
            }}
            onClear={() => {
              setExpenseItemId(null);
              setExpenseItemLabel('');
            }}
            testId="field-expense-item"
          />
        </DocumentMetaField>
      </DocumentMetaRow>

      {/* «Валюта документа» — compact select + inline «1 USD = N UZS». Base
          currency (UZS) shows no rate. */}
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('currency_document')} required fullWidth>
          <div className="flex items-center gap-2">
            <div className="w-[180px] shrink-0">
              <NativeSelect
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  // a new currency resets the per-doc rate back to that currency's rate.
                  setRateOverride(null);
                  setRateDialogOpen(false);
                }}
                data-test-id="field-currency"
              >
                {currencies.length === 0 && <option value={currency}>{currency}</option>}
                {currencies.map((c) => (
                  <option key={c.id} value={c.isoCode}>
                    {c.name} ({c.isoCode})
                  </option>
                ))}
              </NativeSelect>
            </div>
            {!isBaseCurrency && selectedCurrency && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--ms-text-muted)] text-xs tabular-nums">
                1 {currency} = {Number(effectiveRate).toLocaleString('ru-RU')} {baseCode}
                {/* moysklad ✎ — opens «Курс валюты документа» to override the rate. */}
                <button
                  type="button"
                  onClick={() => setRateDialogOpen(true)}
                  className="text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]"
                  aria-label={tCommon('edit')}
                  data-test-id="currency-rate-edit"
                >
                  ✎
                </button>
              </span>
            )}
          </div>
        </DocumentMetaField>
      </DocumentMetaRow>
    </div>
  );

  const tabs = [
    {
      key: 'main',
      label: tDetailTabs('main'),
      content: (
        <div className="space-y-4">
          <PositionTable
            columns={positionColumns}
            emptyText=""
            rows={positions}
            onUpdate={(id, patch) => updatePosition(id, patch as Partial<NewPositionRow>)}
            onRemove={removePosition}
            onDuplicate={(id) => {
              const source = positions.find((p) => p.id === id);
              if (!source) return;
              setPositions((ps) => [...ps, { ...source, id: uid() }]);
            }}
            // moysklad «Наименование ▾» — sort the document's lines by name / code,
            // grouping by product folder first when «С учётом групп» is checked.
            onSortPositions={(by) =>
              setPositions((ps) => {
                const key = (p: NewPositionRow) =>
                  by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                return [...ps].sort((a, b) => key(a).localeCompare(key(b), 'ru'));
              })
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            withGroups={withGroups}
            onWithGroupsChange={setWithGroups}
            withGroupsLabel={tPos('sort_with_groups')}
            onReorder={(from, to) => {
              setPositions((ps) => {
                const next = ps.slice();
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              });
            }}
            renderNameCell={renderPositionNameCell}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            footerToolbar={
              <PositionInlineAdd
                placeholder={tPos('addPositionPlaceholder')}
                addFromCatalogLabel={tPos('addFromCatalog')}
                onSearch={async (q) => {
                  const r = await api.get<{ items: ProductItem[]; total: number }>(
                    `/products?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return {
                    items: r.items.map((p) => ({
                      id: p.id,
                      primary: p.name,
                      code: p.code ?? undefined,
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                onCreateProduct={() => router.push('/products/new')}
                onPick={(item) => {
                  const raw = item.raw as ProductItem | undefined;
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: uid(),
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productCode: raw?.code ?? undefined,
                      productUom: raw?.uom ?? null,
                      quantity: '1',
                      // «Цена» = product cost (себестоимость) by default — independent
                      // of «Остаток»; the store avg overrides it only when stock>0.
                      priceMinor: raw?.buyPrice ?? '0',
                      discount: '0',
                      vat: '0',
                      vatEnabled: false,
                      imageUrl: raw?.mainImageId
                        ? `/api/v1/images/${raw.mainImageId}/raw`
                        : undefined,
                    },
                  ]);
                }}
                onAddFromCatalog={addEmptyPosition}
              />
            }
          />

          {/* Bottom — moysklad: «Комментарий» (left, ~600px) + «Итого» / «Кол-во»
              (right). LEFT-aligned, content-sized — no edge-to-edge stretch. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
            <div className="space-y-2 lg:w-[600px]">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tFields('description')}
                rows={3}
                data-test-id="field-description"
              />
              {externalCodeVisible ? (
                <div className="flex items-center gap-2">
                  <label htmlFor="external-code" className="text-[var(--ms-text-muted)] text-sm">
                    {tDetailForm('external_code')}:
                  </label>
                  <Input
                    id="external-code"
                    type="text"
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    className="flex-1"
                    data-test-id="field-external-code"
                  />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setExternalCodeVisible(true)}
                  className="h-auto px-0 text-xs"
                  data-test-id="show-external-code"
                >
                  {tDetailForm('external_code')}
                </Button>
              )}
            </div>
            <div className="min-w-[260px] space-y-2">
              <div className="flex justify-between gap-8 font-semibold text-base">
                <dt>{tFields('sum_total')}:</dt>
                <dd className="tabular-nums" data-test-id="loss-total">
                  {formatMoney(String(totals), 'UZS', { displayAs: 'none' })}
                </dd>
              </div>
              <div className="flex justify-between gap-8 text-[var(--ms-text-muted)] text-sm">
                <dt>{tPos('quantity')}:</dt>
                <dd className="tabular-nums" data-test-id="loss-total-qty">
                  {totalQty.toLocaleString('ru-RU')}
                </dd>
              </div>
            </div>
          </div>

          <DocumentDisclosurePanel
            title={tForm('tasks_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_task')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('tasks_after_save_hint')}</p>
          </DocumentDisclosurePanel>

          <DocumentDisclosurePanel
            title={tForm('files_section')}
            headerAction={
              <Button type="button" variant="secondary" disabled>
                <Icons.create className="h-4 w-4" />
                {tForm('add_file')}
              </Button>
            }
            defaultOpen={false}
          >
            <p className="text-[var(--ms-text-muted)] text-sm">{tForm('files_after_save_hint')}</p>
          </DocumentDisclosurePanel>
        </div>
      ),
    },
    {
      key: 'related',
      label: tDetailTabs('related'),
      content: (
        <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
          <RelatedDocsTab
            current={{
              id: 'new',
              name: docNumber,
              moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
              sumMinor: String(totals),
              kind: 'loss',
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <DocumentEditor
        {...docEditorLabels}
        testId="loss-new-page"
        documentTypeLabel={tDetailTitles('loss')}
        number={docNumber}
        onNumberChange={setDocNumber}
        date={docDate}
        onDateChange={setDocDate}
        status={status}
        statusOptions={STATUS_OPTIONS}
        onStatusChange={setStatus}
        applicable={applicable}
        onApplicableChange={setApplicable}
        applicableHelp={t('applicable_help')}
        onSave={() => {
          setError(null);
          createMut.mutate();
        }}
        saving={createMut.isPending}
        onClose={() => router.push('/losses')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        rightSlot={<OwnerAccessPopover value={ownerAccess} onChange={setOwnerAccess} />}
        error={error}
        onErrorRetry={() => {
          setError(null);
          createMut.mutate();
        }}
      >
        {metaPanel}
        <DocumentTabs tabs={tabs} defaultActiveKey="main" />
      </DocumentEditor>

      <CatalogPicker
        open={openPicker === 'org'}
        onClose={() => setOpenPicker(null)}
        title={tForm('organization_picker_title')}
        fetcher={orgFetcher}
        onSelect={(item) => {
          setOrganizationId(item.id);
          setOrganizationLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'store'}
        onClose={() => setOpenPicker(null)}
        title={tForm('store_picker_title')}
        fetcher={storeFetcher}
        onSelect={(item) => {
          setStoreId(item.id);
          setStoreLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'project'}
        onClose={() => setOpenPicker(null)}
        title={tForm('project_picker_title')}
        fetcher={projectFetcher}
        onSelect={(item) => {
          setProjectId(item.id);
          setProjectLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={openPicker === 'expense'}
        onClose={() => setOpenPicker(null)}
        title={tFields('expense_item')}
        fetcher={expenseFetcher}
        onSelect={(item) => {
          setExpenseItemId(item.id);
          setExpenseItemLabel(String(item.primary));
        }}
      />
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'product'
        }
        onClose={() => setOpenPicker(null)}
        title={tForm('product_picker_title')}
        fetcher={productFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          applyProductToRow(openPicker.rowUid, item);
        }}
      />

      {/* «Курс валюты документа» — moysklad rate-override modal (the currency ✎). */}
      <PriceRateDialog
        open={rateDialogOpen}
        onClose={() => setRateDialogOpen(false)}
        currencyCode={currency}
        baseCode={baseCode}
        referenceRate={globalRate}
        customRate={rateOverride}
        onApply={setRateOverride}
      />
    </>
  );
}
