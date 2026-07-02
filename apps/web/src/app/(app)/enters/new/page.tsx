'use client';

/**
 * /enters/new — moysklad-parity «Оприходование» editor.
 *
 * Internal stock-in: no counterparty, no VAT, no discount. A single «Склад»,
 * the base currency locked to «сум (UZS)», a per-position «Причина
 * оприходования» column and a bottom «Накладные расходы» distribution.
 *
 * Mirrors the document-editor shell the gold-standard purchase-order/new uses
 * — the «Владелец» owner-access popover, the rich inline «Добавить позицию»
 * typeahead bar, the «Наименование ▾» sort menu, the «Цена ▾» reprice menu and
 * the «Сумма ⚙» column customizer — so the editor is 1:1 with the live moysklad
 * #enter create page (docs/audits/enters-live-2026-06-21). The metadata grid
 * sits ABOVE the «Главная»/«Связанные документы» tabs and stays visible across
 * tab switches (moysklad b-operation-form-top).
 */

import { RelatedDocsTab } from '@/components/customer-orders/related-docs-tab';
import {
  OwnerAccessPopover,
  type OwnerAccessValue,
} from '@/components/documents/owner-access-popover';
import { PositionColumnCustomizer } from '@/components/documents/position-column-customizer';
import { PositionPriceMenu } from '@/components/documents/position-price-menu';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  // /products returns `buyPrice` (minor string) — the enter line cost basis.
  // (NB: it is `buyPrice`, NOT `buyPriceMinor`; the field was probed live.)
  buyPrice: string | null;
  // Sale-price list, carried so the «Цена ▾» → «Расценить» menu can re-price a line.
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  // moysklad position grid shows the product's live stock cluster (Остаток /
  // Доступно) per row; /products returns it, we carry it onto the position.
  stock?: { onHand: string; reserved: string; inTransit: string; available: string } | null;
  // Product folder (denormalised pathName) — drives «Наименование ▾ → С учётом групп».
  productFolder?: { id: string; name: string; pathName: string } | null;
  // moysklad «Вес» / «Объём» read-only columns (grams / millilitres on the product).
  weightG?: number | null;
  volumeML?: number | null;
  // Main image id → «Наименование» cell thumbnail (GET /images/:id/raw).
  mainImageId?: string | null;
}

interface NewPositionRow extends DocPositionRow {
  assortmentId: string | null;
  salePrices?: Array<{ priceTypeId: string; value: string }> | null;
  folderPath?: string;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

// moysklad #enter «⚙» customizer — the FULL live-capture option list (the user's
// ⚙ dropdown + grid, docs/audits/enters-live-2026-06-21): Изображение · Единица
// измерения · Ячейка · Остаток · Вес · Объём · Причина оприходования · Себест.
// единицы · Себестоимость · ГТД · РНПТ · Страна. Always-on frame: Наименование ·
// Кол-во · Цена · Сумма. «Вес»/«Объём» read-only (product weightG/volumeML);
// «Себест. единицы»/«Себестоимость» read-only (= Цена/Сумма on an enter); «Ячейка»
// + «РНПТ» free-text; «ГТД» + «Страна» persist (mirror SupplyPosition §41). All
// persisted on create + round-tripped. Defaults match the visible moysklad grid.
const OPTIONAL_POSITION_COLUMNS: { key: PositionColumnKey; labelKey: string; on: boolean }[] = [
  // moysklad enter grid shows NO «Изображение» column by default (real capture
  // enters-live-2026-06-21/21-create-full: checkbox → «Наименование»); ⚙-toggle, default OFF.
  { key: 'image', labelKey: 'image', on: false },
  { key: 'unit', labelKey: 'unit', on: true },
  { key: 'cell', labelKey: 'cell', on: true },
  { key: 'stock', labelKey: 'stock', on: true },
  { key: 'weight', labelKey: 'weight', on: false },
  { key: 'volume', labelKey: 'volume', on: false },
  { key: 'reason', labelKey: 'reason', on: true },
  { key: 'costPerUnit', labelKey: 'costPerUnit', on: false },
  { key: 'costTotal', labelKey: 'costTotal', on: false },
  { key: 'gtdNumber', labelKey: 'gtd', on: true },
  { key: 'rnpt', labelKey: 'rnpt', on: true },
  { key: 'country', labelKey: 'country', on: true },
];
const DEFAULT_COL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  OPTIONAL_POSITION_COLUMNS.map((c) => [c.key, c.on]),
);

export default function NewEnterPage() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations('pages.enters');
  const tErrors = useTranslations('errors');
  const tFields = useTranslations('fields');
  const tForm = useTranslations('form');
  const tDetailForm = useTranslations('detail_form');
  const tDetailTabs = useTranslations('detail_tabs');
  const tDetailTitles = useTranslations('detail_titles');
  const tStates = useTranslations('states.enter');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('position_editor');
  const tCols = useTranslations('position_cols');
  const docEditorLabels = useDocumentEditorLabels();

  // moysklad enter FSM = draft / posted / cancelled (mirrors enters/[id]).
  // Status is decorative on /new (not sent on create — the API always creates a
  // draft); default to none so the header pill reads «Статус» (moysklad parity).
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
  // Price types for the «Цена ▾» → «Расценить» (re-price by type) menu.
  const { data: priceTypesData } = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['price-types'],
    queryFn: () => api.get('/price-types'),
    staleTime: 60_000,
  });

  // «Валюта документа» — the option list + rates come from the account's REAL
  // currencies (GET /currencies, managed in Настройки → Валюты), NEVER a hardcoded
  // list. Each row carries `isoCode` (UZS/USD…), `name` («сум»/«доллар»), `default`
  // (the base) and `rateValue`/`rate` (vs base). The cost columns are entered in the
  // chosen currency; the BE converts the FIFO stock lot to base at post (UZS ⇒ no-op).
  const { data: currenciesData } = useQuery<{ items: CurrencyItem[] }>({
    queryKey: ['currencies'],
    queryFn: () => api.get('/currencies'),
    staleTime: 60_000,
  });
  const currencies = useMemo(() => currenciesData?.items ?? [], [currenciesData]);
  const [currency, setCurrency] = useState<string>('UZS');
  // Default to the account's base currency once the list loads (don't assume UZS).
  const baseAppliedRef = useRef(false);
  useEffect(() => {
    if (baseAppliedRef.current || currencies.length === 0) return;
    baseAppliedRef.current = true;
    const base = currencies.find((c) => c.default) ?? currencies[0];
    if (base) setCurrency(base.isoCode);
  }, [currencies]);
  const selectedCurrency = currencies.find((c) => c.isoCode === currency);
  const isBaseCurrency = selectedCurrency?.default ?? currency === 'UZS';
  // moysklad «1 USD = 12 200 UZS ✎» — the ✎ opens the «Курс валюты документа» modal
  // (PriceRateDialog) to override the rate PER-DOCUMENT. The override (major units,
  // e.g. «12200») defaults to the account rate and resets when the currency changes;
  // the document stores rateValue = rate × 1e8.
  const [rateOverride, setRateOverride] = useState<string | null>(null);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const baseCode = currencies.find((c) => c.default)?.isoCode ?? 'UZS';
  const globalRate = selectedCurrency?.rate ?? '1';
  const effectiveRate = rateOverride ?? globalRate;
  const overrideRateValue =
    rateOverride && Number(rateOverride) > 0
      ? String(BigInt(Math.round(Number(rateOverride) * 1e8)))
      : null;
  const effectiveRateValue = isBaseCurrency
    ? '100000000'
    : (overrideRateValue ?? selectedCurrency?.rateValue ?? '100000000');

  // Header state
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  // moysklad shows «Статус» (no status picked) on a new doc — the built-in
  // draft/posted/cancelled FSM is decorative here, so default to none.
  const [status, setStatus] = useState<string>('');
  // moysklad «Проведено» is CHECKED by default — the document is created posted
  // (the BE posts atomically on create when applicable=true).
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
  // «Накладные расходы» — extra cost distributed across entered positions
  // at post time (raises FIFO cost basis). Major units; sent as tiyin.
  const [overheadMajor, setOverheadMajor] = useState('');
  // moysklad enter overhead «Распределить» = по цене / по весу / по объёму
  // (no «по количеству» — that was our invention). Default «по цене».
  const [overheadDistribution, setOverheadDistribution] = useState<'WEIGHT' | 'PRICE' | 'VOLUME'>(
    'PRICE',
  );
  const [description, setDescription] = useState('');

  // moysklad «Владелец» (owner/access) — a new doc defaults to the current user
  // as owner; department (groupId) + «Общий доступ» (shared) are editable via the
  // header owner popover. Sent on create (ownerId/groupId/shared), tenant-validated BE.
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
  // moysklad «Сумма ⚙» column customizer — toggles the optional position columns.
  const [colVisible, setColVisible] = useState<Record<string, boolean>>(DEFAULT_COL_VISIBLE);
  // moysklad «Наименование ▾ → ☐ С учётом групп» — when on, the name/code sort
  // groups lines by product folder first.
  const [withGroups, setWithGroups] = useState(false);

  // Pickers + error
  const [openPicker, setOpenPicker] = useState<
    | null
    | 'org'
    | 'store'
    | 'project'
    | { kind: 'product'; rowUid: string }
    | { kind: 'country'; rowUid: string }
  >(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the user's «Значения по умолчанию» once the reference lists +
  // settings settle (moysklad applies the user defaults to EVERY new document).
  // Stock doc — no counterparty; Организация/Склад fall back to the first list
  // item, Проект only from an explicit default.
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

  // Enter line cost = «Цена» (priceMinor) — no VAT, no discount. Single BigInt
  // source so the «Итого» footer agrees with each row's «Сумма» exactly.
  const totals = useMemo(
    () =>
      positions.reduce((acc, p) => {
        const cost = BigInt(p.priceMinor || '0');
        return acc + scaleMinorByQty(cost, p.quantity || '0');
      }, 0n),
    [positions],
  );

  const addPosition = () => {
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
  const updatePosition = (id: string, patch: Partial<NewPositionRow>) => {
    setPositions((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const removePosition = (id: string) => {
    setPositions((ps) => ps.filter((p) => p.id !== id));
  };

  // «Цена ▾» → «Расценить» — re-price every row from the chosen price type (the
  // product's carried salePrices). moysklad lets you reprice enter lines from a type.
  const repricePositions = useCallback((priceTypeId: string) => {
    setPositions((ps) =>
      ps.map((p) => {
        const sp = p.salePrices?.find((x) => x.priceTypeId === priceTypeId);
        return sp ? { ...p, priceMinor: sp.value } : p;
      }),
    );
  }, []);
  // «Цена ▾» → «Сохранить цены» — push each line's price back onto its product. On
  // an enter the line price IS the buy/cost basis, so save to Product.buyPrice.
  const saveProductPrices = useCallback(async () => {
    const seen = new Set<string>();
    for (const p of positions) {
      if (!p.assortmentId || seen.has(p.assortmentId)) continue;
      seen.add(p.assortmentId);
      try {
        const prod = await api.get<{ version: number }>(`/products/${p.assortmentId}`);
        await api.patch(`/products/${p.assortmentId}`, {
          version: prod.version,
          buyPrice: p.priceMinor,
        });
      } catch {
        // skip products that can't be updated (e.g. concurrent edit); others proceed
      }
    }
  }, [positions]);

  // moysklad #enter position columns, built dynamically from the ⚙ customizer.
  // Grid order (live capture image): Изобр · Наименование ▾ · Кол-во(+unit inline) ·
  // Ячейка · Остаток · Цена ▾ · Сумма ⚙ · Причина · ГТД · РНПТ · Страна. The two
  // cost columns («Себест. единицы»/«Себестоимость») flank Цена/Сумма when on. No «#».
  const positionColumns = useMemo<PositionTableColumnConfig[]>(() => {
    const cols: PositionTableColumnConfig[] = [
      { key: 'dragarea' },
      { key: 'select' },
      // moysklad numbers each line «1,2,3…» (empty header) — mirror /[id] + CO.
      { key: 'index', label: '' },
    ];
    if (colVisible.image) cols.push({ key: 'image' });
    cols.push({ key: 'name', label: tCols('name') });
    // `unit` present ⇒ the unit renders INLINE in «Кол-во» («1 шт»), no separate column.
    cols.push({ key: 'quantity', label: tPos('quantity') });
    if (colVisible.unit) cols.push({ key: 'unit', label: tCols('unit') });
    if (colVisible.cell)
      cols.push({ key: 'cell', label: tCols('cell'), placeholder: tCols('cell_unset') });
    if (colVisible.stock) cols.push({ key: 'stock', label: tCols('stock') });
    if (colVisible.weight) cols.push({ key: 'weight', label: tCols('weight') });
    if (colVisible.volume) cols.push({ key: 'volume', label: tCols('volume') });
    cols.push({
      key: 'price',
      label: (
        <PositionPriceMenu
          label={tCols('price')}
          repriceLabel={tCols('reprice')}
          saveLabel={tCols('savePrices')}
          priceTypes={priceTypesData?.items ?? []}
          onReprice={repricePositions}
          onSavePrices={saveProductPrices}
        />
      ),
    });
    // «Себест. единицы» — read-only unit cost (= Цена on an enter), next to «Цена».
    if (colVisible.costPerUnit) cols.push({ key: 'costPerUnit', label: tCols('costPerUnit') });
    cols.push({ key: 'amount', label: tCols('amount') });
    // «Себестоимость» — read-only total cost (= Сумма on an enter), next to «Сумма».
    if (colVisible.costTotal) cols.push({ key: 'costTotal', label: tCols('costTotal') });
    // moysklad order after «Сумма»: Причина · ГТД · РНПТ · Страна. All ⚙-toggleable.
    if (colVisible.reason) cols.push({ key: 'reason', label: tCols('reason') });
    if (colVisible.gtdNumber) cols.push({ key: 'gtdNumber', label: tCols('gtd') });
    if (colVisible.rnpt) cols.push({ key: 'rnpt', label: tCols('rnpt') });
    if (colVisible.country) cols.push({ key: 'country', label: tCols('country') });
    // moysklad places the «⚙» column-customizer in its OWN trailing column at the
    // FAR RIGHT (after «Страна»), NOT on the «Сумма» header — render it as the
    // last header cell (the per-row «⋯» actions live in the cells below).
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
  }, [colVisible, tCols, tPos, priceTypesData, repricePositions, saveProductPrices]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error(tErrors('select_organization'));
      if (!storeId) throw new Error(tErrors('select_store'));
      if (positions.length === 0) throw new Error(tErrors('at_least_one_position'));
      for (const [i, p] of positions.entries()) {
        if (!p.assortmentId) throw new Error(tErrors('position_select_product', { n: i + 1 }));
        if (Number(p.quantity) <= 0)
          throw new Error(tErrors('position_quantity_positive', { n: i + 1 }));
        // moysklad allows a 0-cost Оприходование (found/gift items) — no cost>0 guard.
      }
      const payload = {
        organizationId,
        storeId,
        ...(projectId ? { projectId } : {}),
        // «Владелец» — owner employee / department / shared (else BE stamps creator).
        ...(ownerAccess.ownerId ? { ownerId: ownerAccess.ownerId } : {}),
        ...(ownerAccess.groupId ? { groupId: ownerAccess.groupId } : {}),
        ...(ownerAccess.shared ? { shared: true } : {}),
        ...(externalCode ? { externalCode } : {}),
        ...(Number(overheadMajor) > 0
          ? {
              overheadSumMinor: String(BigInt(Math.round(Number(overheadMajor) * 100))),
              overheadDistribution,
              overheadCurrency: 'UZS',
            }
          : {}),
        description: description || undefined,
        ...(docNumber ? { name: docNumber } : {}),
        moment: docDate ? new Date(docDate).toISOString() : undefined,
        applicable,
        // «Валюта документа» + rate — both from the selected account currency
        // (real /currencies data; base ⇒ rateValue 1e8).
        currency,
        rateValue: isBaseCurrency ? '100000000' : effectiveRateValue,
        positions: positions.map((p) => ({
          assortmentKind: 'product',
          // biome-ignore lint/style/noNonNullAssertion: validated non-null in the loop above before payload build
          assortmentId: p.assortmentId!,
          quantity: p.quantity,
          // enter «Цена» === cost basis — the displayed price IS the cost.
          costMinor: p.priceMinor,
          // «Причина оприходования» — per-position free text (moysklad parity).
          ...(p.reason ? { reason: p.reason } : {}),
          // «Номер ГТД» / «Страна» — import/customs block (mirror supply §41).
          ...(p.gtdNumber ? { gtdNumber: p.gtdNumber } : {}),
          ...(p.gtdSumMinor ? { gtdSumMinor: p.gtdSumMinor } : {}),
          ...(p.countryId ? { countryId: p.countryId } : {}),
          // «РНПТ» / «Ячейка» — free-text batch/bin reference.
          ...(p.rnpt ? { rnpt: p.rnpt } : {}),
          ...(p.cell ? { cell: p.cell } : {}),
        })),
      };
      return api.post<{ id: string }>('/enters', payload);
    },
    onSuccess: (created) => router.push(`/enters/${created.id}`),
    onError: (err: Error) => setError(err.message),
  });

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

  // Apply a chosen product onto a position row — carried fields drive the
  // read-only Остаток/Доступно cells, the «Цена ▾» reprice and the folder sort.
  const applyProductToRow = (rowUid: string, item: PickerItem) => {
    const raw = (item as PickerItem & { raw?: ProductItem }).raw;
    updatePosition(rowUid, {
      assortmentId: item.id,
      productLabel: String(item.primary),
      productCode: raw?.code ?? undefined,
      productUom: raw?.uom ?? null,
      priceMinor: raw?.buyPrice ?? '0',
      stock: raw?.stock?.onHand,
      available: raw?.stock?.available,
      salePrices: raw?.salePrices ?? null,
      folderPath: raw?.productFolder?.pathName ?? undefined,
      // «Вес» / «Объём» read-only (product weightG / volumeML).
      weight: raw?.weightG != null ? String(raw.weightG) : undefined,
      volume: raw?.volumeML != null ? String(raw.volumeML) : undefined,
      // «Наименование» cell thumbnail (moysklad shows the product image inline).
      imageUrl: raw?.mainImageId ? `/api/v1/images/${raw.mainImageId}/raw` : undefined,
    });
  };

  // «Страна» country picker (mirror supply §41) — per-row inline picker.
  const countryFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{ items: Array<{ id: string; name: string; code?: string | null }> }>(
      `/countries?search=${encodeURIComponent(s)}&limit=50`,
    );
    return d.items.map((c) => ({ id: c.id, primary: c.name, secondary: c.code ?? undefined }));
  };

  const renderPositionCountryCell = (row: DocPositionRow) => (
    <CatalogPickerField
      value={row.countryId ? { id: row.countryId, label: row.countryLabel ?? '' } : null}
      placeholder={tFields('country')}
      onPick={() => setOpenPicker({ kind: 'country', rowUid: row.id })}
      onClear={() => updatePosition(row.id, { countryId: null, countryLabel: '' })}
      // moysklad parity: borderless «Страна» cell — box appears on hover (mirror the grid inputs).
      fieldClassName="h-7 border-transparent bg-transparent hover:border-[var(--ms-border-input)] hover:bg-[var(--ms-bg-surface)]"
    />
  );

  const renderPositionNameCell = (row: DocPositionRow) => {
    const p = row as NewPositionRow;
    // moysklad-parity borderless [img] + bold code + name (mirror /[id] + CO).
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

  // moysklad b-operation-form-top — the metadata grid sits ABOVE the
  // «Главная»/«Связанные документы» tabs and stays visible across tab switches.
  // Row pairing: Организация↔Склад · Проект↔(empty) · Валюта↔(empty).
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
            onEdit={
              organizationId
                ? () => window.open(`/organizations/${organizationId}`, '_blank', 'noopener')
                : undefined
            }
            editLabel={tCommon('edit')}
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
            onEdit={
              storeId ? () => window.open(`/stores/${storeId}`, '_blank', 'noopener') : undefined
            }
            editLabel={tCommon('edit')}
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
      </DocumentMetaRow>

      {/* «Валюта документа» — moysklad layout: a COMPACT select followed INLINE by
          «1 USD = 12 200 UZS ✎» on the SAME row (the ✎ overrides the rate for THIS
          document — inline, no new window). Base currency (UZS) shows no rate. */}
      <DocumentMetaRow>
        <DocumentMetaField label={tFields('currency_document')} required fullWidth>
          <div className="flex items-center gap-2">
            <div className="w-[180px] shrink-0">
              {/* Options come from the account's REAL currencies (GET /currencies). */}
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
            // moysklad-parity: drag handle in the leftmost column reorders rows.
            onReorder={(from, to) => {
              setPositions((ps) => {
                const next = ps.slice();
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              });
            }}
            // moysklad «Наименование ▾» — sort the document's lines by name / code,
            // grouping by product folder first when «С учётом групп» is checked.
            onSortPositions={(by) =>
              setPositions((ps) => {
                const key = (p: NewPositionRow) =>
                  by === 'name' ? (p.productLabel ?? '') : (p.productCode ?? '');
                return [...ps].sort((a, b) => {
                  if (withGroups) {
                    const g = (a.folderPath ?? '').localeCompare(b.folderPath ?? '', 'ru');
                    if (g !== 0) return g;
                  }
                  return key(a).localeCompare(key(b), 'ru');
                });
              })
            }
            sortByNameLabel={tPos('sort_by_name')}
            sortByCodeLabel={tPos('sort_by_code')}
            withGroups={withGroups}
            onWithGroupsChange={setWithGroups}
            withGroupsLabel={tPos('sort_with_groups')}
            renderNameCell={renderPositionNameCell}
            renderCountryCell={renderPositionCountryCell}
            selectedIds={selectedRowIds}
            onSelectionChange={setSelectedRowIds}
            // moysklad-parity: inline «Добавить позицию» bar with typeahead — the
            // user types a product name / code / barcode and picks from the rich
            // dropdown; chosen item lands as a new position row pre-filled.
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
                      available: p.stock?.available != null ? Number(p.stock.available) : 0,
                      raw: p,
                    })),
                    total: r.total ?? r.items.length,
                  };
                }}
                sortAvailableLabel={tPos('sortByAvailable')}
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
                      priceMinor: raw?.buyPrice ?? '0',
                      discount: '0',
                      vat: '0',
                      vatEnabled: false,
                      // read-only stock cluster at the store (moysklad «Остаток»/«Доступно»).
                      stock: raw?.stock?.onHand,
                      available: raw?.stock?.available,
                      salePrices: raw?.salePrices ?? null,
                      folderPath: raw?.productFolder?.pathName ?? undefined,
                      weight: raw?.weightG != null ? String(raw.weightG) : undefined,
                      volume: raw?.volumeML != null ? String(raw.volumeML) : undefined,
                      imageUrl: raw?.mainImageId
                        ? `/api/v1/images/${raw.mainImageId}/raw`
                        : undefined,
                    },
                  ]);
                }}
                onAddFromCatalog={addPosition}
              />
            }
          />

          {/* Bottom — moysklad: «Комментарий» (left, FIXED ~600px) + a right column
              with «Итого», a divider, and «Накладные расходы … Распределить». The row
              is LEFT-aligned and content-sized — it does NOT stretch to the screen edge. */}
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
            <div className="min-w-[300px] space-y-3">
              <div className="flex justify-between gap-8 font-semibold text-base">
                <dt>{tFields('sum_total')}:</dt>
                <dd className="tabular-nums" data-test-id="enter-total">
                  {formatMoney(String(totals), 'UZS', { displayAs: 'none' })}
                </dd>
              </div>
              <hr className="border-[var(--ms-border-default)]" />
              {/* «Накладные расходы» — moysklad sits it under «Итого» (right column);
                  «Распределить по цене» by default. */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-[var(--ms-text-muted)]">{tDetailForm('overhead_sum')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={overheadMajor}
                  placeholder="0"
                  onChange={(e) => setOverheadMajor(e.target.value)}
                  data-test-id="field-overhead-sum"
                  className="w-24"
                />
                <span className="text-[var(--ms-text-muted)]">
                  {tDetailForm('overhead_distribution')}
                </span>
                <NativeSelect
                  value={overheadDistribution}
                  onChange={(e) =>
                    setOverheadDistribution(e.target.value as 'WEIGHT' | 'PRICE' | 'VOLUME')
                  }
                  data-test-id="field-overhead-distribution"
                  disabled={!(Number(overheadMajor) > 0)}
                  className="w-32"
                >
                  <option value="PRICE">{tDetailForm('overhead_by_price')}</option>
                  <option value="WEIGHT">{tDetailForm('overhead_by_weight')}</option>
                  <option value="VOLUME">{tDetailForm('overhead_by_volume')}</option>
                </NativeSelect>
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
      // moysklad «Связанные документы» = a relations diagram, not a centered
      // notice. On a brand-new doc there are no links yet — the linking flow needs
      // a saved doc, so the button stays disabled until after the first save.
      content: (
        <div className="bg-[var(--ms-bg-surface)] px-4 py-3">
          <RelatedDocsTab
            current={{
              id: 'new',
              name: docNumber,
              moment: docDate ? new Date(docDate).toISOString() : new Date().toISOString(),
              sumMinor: String(totals),
              kind: 'enter',
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
        testId="enter-new-page"
        documentTypeLabel={tDetailTitles('enter')}
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
        onClose={() => router.push('/enters')}
        modifyMenu={[]}
        createDocMenu={[]}
        printMenu={[]}
        sendMenu={[]}
        // moysklad-parity: right side of toolbar = «Владелец» (owner/access)
        // popover — click «Admin User / Основной» to set Сотрудник (employee) /
        // Отдел (department) / «Общий доступ» (shared). Saved on create.
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
      <CatalogPicker
        open={
          typeof openPicker === 'object' && openPicker !== null && openPicker.kind === 'country'
        }
        onClose={() => setOpenPicker(null)}
        title={tFields('country')}
        fetcher={countryFetcher}
        onSelect={(item) => {
          if (typeof openPicker !== 'object' || openPicker === null) return;
          updatePosition(openPicker.rowUid, {
            countryId: item.id,
            countryLabel: String(item.primary),
          });
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
