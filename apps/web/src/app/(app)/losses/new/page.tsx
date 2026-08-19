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
import { CurrencyRateModal } from '@/components/document-detail/currency-rate-modal';
import { CellPickerField } from '@/components/documents/cell-picker-field';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionAgreementButton } from '@/components/documents/position-agreement-modal';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { ReceiptPrintPortal } from '@/components/pick-list/receipt-print-portal';
import { usePrintTemplatesManager } from '@/components/print/print-templates-provider';
import { useDocumentEditorLabels } from '@/hooks/use-document-editor-labels';
import { usePickSheet } from '@/hooks/use-pick-sheet';
import { defaultDocStore, useUserDefaults } from '@/hooks/use-user-defaults';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { DEFAULT_LOSS_EXPENSE_ITEM_NAME } from '@/lib/expense-items';
import { imageRawUrl } from '@/lib/image-url';
import { distributeAgreementDelta } from '@/lib/position-agreement';
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
  const tBulk = useTranslations('bulk_actions');
  const tPrint = useTranslations('print_menu');
  const tPrintLoss = useTranslations('print_menu_loss');
  const docEditorLabels = useDocumentEditorLabels();
  const { openTemplates } = usePrintTemplatesManager();

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
  // (CurrencyRateModal) to override the rate PER-DOCUMENT. The override (major units)
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
  const [expenseItemLabel, setExpenseItemLabel] = useState<string>(DEFAULT_LOSS_EXPENSE_ITEM_NAME);
  const expenseDefaultRef = useRef(false);
  useEffect(() => {
    if (expenseDefaultRef.current || !expenseItemsData) return;
    expenseDefaultRef.current = true;
    const spis = expenseItemsData.items.find(
      (e) => e.name.toLowerCase() === DEFAULT_LOSS_EXPENSE_ITEM_NAME.toLowerCase(),
    );
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
  // Omborchi varag'i — saqlashsiz, JONLI forma holatidan chiqadi
  // (customer-orders/new dagi o'rnatilgan namuna; varaq yuridik hujjat
  //  emas — ish qog'ozi, shuning uchun hujjat raqami hali bo'lmasa ham).
  const tSheet = useTranslations('pages.pickLists');
  const { sheet, openSheet, closeSheet } = usePickSheet();
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
      const store = defaultDocStore(us, storesData.items);
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
  // «Kelishuv» — spread the negotiated delta across the lines (owner 2026-07-17).
  // No VAT on a write-off, so the delta is distributed VAT-free.
  const applyAgreement = (deltaMinor: bigint) => {
    setPositions((ps) => {
      const patch = distributeAgreementDelta(ps, deltaMinor, false);
      if (patch.size === 0) return ps;
      return ps.map((p) => {
        const next = patch.get(p.id);
        return next != null ? { ...p, priceMinor: next } : p;
      });
    });
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

  // «Печать»/«Отправить» also list the account's own uploaded print forms for
  // Списание (moysklad shows the user-created forms — e.g. «Climart Приход» —
  // between МБ-8 and Комплект…). Same source as the list-page print dropdown.
  // Doc-scoped endpoint (/losses/print-forms) — gated on the DOC view permission, not
  // settings, so a cashier sees the pinned check buttons too (the shared
  // /print-templates listing is admin-only). Bare array, PO/new shape.
  const { data: printTemplatesData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['losses/print-forms'],
    queryFn: () => api.get('/losses/print-forms'),
    staleTime: 60_000,
  });
  const accountTemplates = printTemplatesData ?? [];

  // moysklad «Печать» on a NEW write-off: silently save, then open the print
  // form in a NEW TAB — the intent lives on a ref so `createMut.onSuccess`
  // knows whether the save came from «Печать» (mirrors enters/supplies/new).
  // 'print' opens /print/loss/:id; {templateId} renders an account form PDF.
  const afterSaveRef = useRef<'view' | 'print' | { templateId: string }>('view');

  // moysklad creates the write-off POSTED (Проведено checked). We create the draft
  // then post it via the transition. createdIdRef guards retries from making a
  // duplicate draft when posting fails (e.g. insufficient stock) — a retry posts
  // the EXISTING draft instead of re-creating.
  const createdIdRef = useRef<string | null>(null);
  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      // Owner 2026-07-08: «Проведено» has NO position precondition — an empty document may be saved/posted (BE allows it: 0 positions ⇒ 0 stock delta).
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
            ...(p.cellId ? { cellId: p.cellId } : {}),
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
      const intent = afterSaveRef.current;
      afterSaveRef.current = 'view';
      if (intent === 'print') {
        // Open the print form in a NEW TAB (user presses «Печать» there — no
        // auto-print), then land on the saved write-off's detail page.
        window.open(`/print/loss/${id}`, '_blank');
      } else if (typeof intent === 'object') {
        // Account print form — render through bulk-print and open the PDF.
        void api.postOpenInBrowser('/losses/bulk-print', {
          ids: [id],
          templateId: intent.templateId,
        });
      }
      router.push(`/losses/${id}`);
    },
    onError: (err: Error) => {
      afterSaveRef.current = 'view';
      setError(err.message);
    },
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
      imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
    });
  };

  // «Ячейка» — address-storage cell picker. Closure has storeId (page state) + the
  // row's product (assortmentId), so the picker can show «Все ячейки» and «С этим
  // товаром». Stores cellId (drives per-cell stock) + the «Зона / Ячейка» label in `cell`.
  const renderPositionCellCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    return (
      <CellPickerField
        storeId={storeId}
        assortmentId={p.assortmentId}
        label={p.cell}
        onSelect={(cellId, label) => updatePosition(row.id, { cellId, cell: label })}
        onClear={() => updatePosition(row.id, { cellId: null, cell: '' })}
      />
    );
  };

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    // A picked product's name is a blue LINK to its product card (the «Аналоги»
    // tab lives there); falls back to the picker button when nothing is picked.
    const href = p.assortmentId ? `/products/${p.assortmentId}` : undefined;
    return (
      <PositionNameCell
        imageUrl={p.imageUrl}
        code={p.productCode}
        label={p.productLabel}
        placeholder={tForm('select_product')}
        onPick={() => setOpenPicker({ kind: 'product', rowUid: p.id })}
        productHref={href}
        onNavigate={href ? () => router.push(href) : undefined}
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
            onCreate={() => router.push('/settings/projects/new')}
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
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-[var(--ms-text-muted)] text-[12px] tabular-nums">
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
          {/* Owner 2026-07-23: «Договорная цена» — blue, at the table's OUTER
              top-right corner (same spot in every section). */}
          <div className="-mb-2.5 flex justify-end">
            <PositionAgreementButton
              totalMinor={totals}
              currency={currency}
              labels={{
                button: tPos('agreement_button'),
                total: tPos('agreement_total'),
                amount: tPos('agreement_amount'),
                add: tPos('agreement_add'),
                subtract: tPos('agreement_subtract'),
                save: tPos('pick_modal_save'),
                cancel: tPos('pick_modal_cancel'),
              }}
              onApply={applyAgreement}
            />
          </div>
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
            renderCellCell={renderPositionCellCell}
            onReplace={(id) => setOpenPicker({ kind: 'product', rowUid: id })}
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
                      // Pick modal (owner 2026-07-18): reference «Цена» = the same
                      // default the row would get (product cost / себестоимость here).
                      priceMinor: p.buyPrice ?? '0',
                      uomLabel: p.uom ?? undefined,
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                moreItemsLabel={(n) => tPos('moreItems', { count: n })}
                createProductLabel={(qq) => tPos('createProductNamed', { query: qq })}
                onCreateProduct={() => router.push('/products/new')}
                // owner 2026-07-18: qty/price modal on EVERY product-add search
                // (was sales-only). No price-scope checkboxes here — writing a
                // permanent SALE price from a write-off cost would be wrong.
                pickModal={{
                  currency,
                  permanentPriceOption: false,
                  labels: {
                    stock: tPos('pick_modal_stock'),
                    price: tPos('pick_modal_price'),
                    quantity: tPos('pick_modal_quantity'),
                    salePrice: tPos('pick_modal_sale_price'),
                    priceThisSale: tPos('pick_modal_price_this_sale'),
                    pricePermanent: tPos('pick_modal_price_permanent'),
                    save: tPos('pick_modal_save'),
                    cancel: tPos('pick_modal_cancel'),
                  },
                }}
                onPick={(item, entry) => {
                  const raw = item.raw as ProductItem | undefined;
                  const newId = uid();
                  setPositions((ps) => [
                    ...ps,
                    {
                      id: newId,
                      assortmentId: item.id,
                      productLabel: item.primary,
                      productCode: raw?.code ?? undefined,
                      productUom: raw?.uom ?? null,
                      quantity: entry?.quantity ?? '1',
                      // «Цена» = product cost (себестоимость) by default — independent
                      // of «Остаток»; the store avg overrides it only when stock>0.
                      priceMinor: entry?.priceMinor ?? raw?.buyPrice ?? '0',
                      discount: '0',
                      vat: '0',
                      vatEnabled: false,
                      imageUrl: raw?.mainImageId ? imageRawUrl(raw.mainImageId) : undefined,
                    },
                  ]);
                  // owner 2026-07-18: returning the id hands focus to the new
                  // row's «Кол-во» (modal → table entry chain).
                  return newId;
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
        // moysklad-parity: on a NEW «Списание» the toolbar dropdowns OPEN and list
        // their items (were disabled/empty). A new doc has nothing to act on yet,
        // so every actionable item SAVES the write-off first, then lands on the
        // detail page. Item sets ground-truthed live on #loss/edit?new (user
        // screenshots, 2026-07-14): «Изменить» = Копировать only (no Удалить).
        modifyMenu={[
          {
            label: tBulk('copy'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // moysklad has NO «Создать документ» on a Списание (internal stock-out,
        // no downstream docs) — hide the slot entirely.
        hideCreateDoc
        // «Печать» — moysklad: ТОРГ-16 · МБ-8 · [account forms] ⎯ Комплект… ⎯
        // Настроить… · «Запросить форму» promo footer (header + subtitle +
        // «Как запросить»). Both built-in forms open our loss print form.
        printMenu={[
          ...[tPrintLoss('torg16'), tPrintLoss('mb8')].map((label) => ({
            label,
            onClick: () => {
              setError(null);
              afterSaveRef.current = 'print';
              createMut.mutate();
            },
          })),
          ...accountTemplates.map((tpl) => ({
            label: tpl.name,
            onClick: () => {
              setError(null);
              afterSaveRef.current = { templateId: tpl.id };
              createMut.mutate();
            },
          })),
          {
            // «Yig'ish varag'i» — omborchi tovarni javondan olib, chiqim uchun
            // yig'adi. Saqlash shart emas (joriy forma pozitsiyalaridan).
            // Chiqimda kontragent yo'q — «Xaridor» qatori bo'sh qoladi.
            label: tSheet('spiska_form'),
            onClick: () =>
              void openSheet({
                title: tSheet('sheet_title_pick'),
                number: docNumber || '—',
                moment: docDate,
                ownerName: user?.name ?? null,
                description: description || null,
                rows: positions,
              }),
          },
          { divider: true },
          {
            label: tPrint('set'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
          { divider: true },
          {
            // «Настроить…» — open the print-template manager slide-over (no save).
            label: tPrint('configure'),
            onClick: () => openTemplates('loss'),
          },
          {
            // «Запросить форму» — moysklad's non-interactive promo footer.
            testId: 'print-request-form',
            content: (
              <div className="mt-1 border-[var(--ms-border-default)] border-t px-2 pt-2 pb-1">
                <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
                  {tPrint('request_form')}
                </div>
                <p className="mt-0.5 max-w-[230px] text-[11px] text-[var(--ms-text-muted)] leading-snug">
                  {tPrint('request_form_description')}
                </p>
                <button
                  type="button"
                  onClick={() => window.open('/help/losses', '_blank')}
                  className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
                  data-test-id="print-request-form-btn"
                >
                  {tPrint('request_form_cta')}
                </button>
              </div>
            ),
          },
        ]}
        // «Отправить» — moysklad: ТОРГ-16 · МБ-8 · [account forms] ⎯ Комплект…
        sendMenu={[
          ...[
            tPrintLoss('torg16'),
            tPrintLoss('mb8'),
            ...accountTemplates.map((tpl) => tpl.name),
          ].map((label) => ({
            label,
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          })),
          { divider: true },
          {
            label: tPrint('set'),
            onClick: () => {
              setError(null);
              createMut.mutate();
            },
          },
        ]}
        // moysklad pins each configured print form as its OWN button right after
        // «Отправить». Each saves the write-off first, then renders that form's PDF.
        trailingSlot={accountTemplates.map((f) => (
          <Button
            key={f.id}
            type="button"
            variant="secondary"
            size="sm"
            // «Past ko'k» — check-print type buttons stand out in a soft blue
            // (brand-100 fill · brand-600 text · brand-300 border), matching
            // purchase-orders/new. Owner request 2026-07-15/16.
            className="border-[var(--ms-brand-300)] bg-[var(--ms-brand-100)] text-[var(--ms-brand-600)] hover:bg-[var(--ms-brand-200)] hover:text-[var(--ms-brand-700)]"
            onClick={() => {
              setError(null);
              afterSaveRef.current = { templateId: f.id };
              createMut.mutate();
            }}
            data-test-id={`toolbar-print-form-${f.id}`}
          >
            <Icons.print className="h-4 w-4" />
            {f.name}
          </Button>
        ))}
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
      <CurrencyRateModal
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        currency={currency}
        referenceRate={globalRate}
        currentOverride={rateOverride}
        onApply={setRateOverride}
      />
      {sheet && <ReceiptPrintPortal data={sheet} onClose={closeSheet} />}
    </>
  );
}
