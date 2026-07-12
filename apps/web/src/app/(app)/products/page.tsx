'use client';

import { AssortmentBulkActionsDropdown } from '@/components/assortment/bulk-actions-dropdown';
import { AssortmentPrintDropdown } from '@/components/assortment/print-dropdown';
import { ColumnSettings } from '@/components/column-settings';
import { SavedFiltersPills } from '@/components/customer-orders/saved-filters-pills';
import { FilterToggleButton } from '@/components/filters/filter-toggle-button';
import { ProductFolderTree } from '@/components/products/product-folder-tree';
import { ProductLocationsModal } from '@/components/products/product-locations-popover';
import { useBulkDocumentActions } from '@/hooks/use-bulk-actions';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { formatBinLocation } from '@/lib/bin-location';
import { usePriceTypeIds } from '@/lib/sale-price';
import {
  CatalogPicker,
  CatalogPickerField,
  type DataTableColumn,
  Icons,
  InlineFilterPanel,
  Input,
  ListView,
  MultiCombobox,
  NativeSelect,
  PeriodInputs,
  PeriodShortcuts,
  type PickerItem,
  formatDate,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Product {
  id: string;
  name: string;
  code: string | null;
  // moysklad parity (D2 audit): Артикул + Ед. изм. — backend returns
  // both scalar fields (findMany uses include, not select).
  article: string | null;
  uom: string | null;
  kind: string;
  buyPrice: string | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  vat: number | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  productFolder: { id: string; name: string; pathName: string | null } | null;
  owner: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  modifiedBy: { id: string; name: string } | null;
  // moysklad ⚙ column-customizer fields (all returned by the list API's `include`).
  minPrice: string | null;
  country: string | null;
  weightG: number | null;
  volumeML: number | null;
  // Warehouse home location (Sherset custom) — composed into «NN-NN-NN-NN».
  locSklad: number | null;
  locPolka: number | null;
  locQavat: number | null;
  locYacheyka: number | null;
  mxikCode: string | null;
  description: string | null;
  shared: boolean;
  isSerialTrackable: boolean;
  minimumBalanceMinor: string | null;
  variantCount: number;
  packTasnif: string | null;
  // moysklad «Изображение» column (default-on, first): the list API flattens the
  // main ProductImage into a `mainImageId` scalar; the thumbnail is fetched via
  // GET /api/v1/images/:id/raw (no binary in the list payload).
  mainImageId: string | null;
  // NB: the backend still computes & returns a live stock cluster
  // (Остаток/Резерв/Ожидание/Доступно), but moysklad's «Товары и услуги» list
  // shows NO stock columns — stock lives in «Склад → Остатки». Verified live on
  // moysklad.uz 2026-06-16 (the 26-column ⚙ set has no Остаток/Доступно/Резерв/
  // Ожидание). So this list intentionally does not surface them. The earlier
  // stock columns were mis-grounded on a contaminated capture (04-module/product
  // captures actually render «Заказы покупателей»/«Корзина»).
}

interface ProductListResponse {
  items: Product[];
  nextCursor?: string;
  total: number;
}

interface PriceTypeRow {
  id: string;
  name: string;
  isDefault: boolean;
  position: number;
  currency: string;
  archived: boolean;
}

// moysklad-day-to-day currency short names (parens suffix in the price cells).
const CURRENCY_NAME: Record<string, string> = {
  UZS: 'сум',
  USD: 'доллар',
  RUB: 'руб.',
  EUR: 'евро',
};

// moysklad renders a column per account price type (GET /price-types). Each cell
// shows the product's sale price for that type with the type's currency name in
// parens — «79,30 (сум)». Legacy data uses the 'default'/'wholesale' STRING
// sentinels (not real PriceType ids), so the lookup bridges: a real-id match wins;
// the isDefault type also accepts the 'default' sentinel; the position-1 type also
// accepts the 'wholesale' sentinel.
function salePriceForType(p: Product, type: PriceTypeRow, index: number): string | null {
  if (!p.salePrices?.length) return null;
  const byId = p.salePrices.find((x) => x.priceTypeId === type.id);
  if (byId) return byId.value;
  if (type.isDefault) return p.salePrices.find((x) => x.priceTypeId === 'default')?.value ?? null;
  if (index === 1) return p.salePrices.find((x) => x.priceTypeId === 'wholesale')?.value ?? null;
  return null;
}

function fmtPriceCur(value: string | null, currency: string): string {
  if (value === null) return '—';
  const name = CURRENCY_NAME[currency] ?? currency;
  return `${formatMoney(value, currency, { displayAs: 'none' })} (${name})`;
}

// Single-currency UZS scalar money columns (Закупочная / Минимальная цена).
function fmtPrice(value: string | null): string {
  if (value === null) return '—';
  return `${formatMoney(value, 'UZS', { displayAs: 'none' })} (сум)`;
}

// Display helpers for the ⚙ column-customizer columns.
// moysklad's «Тип» grid COLUMN shows the SINGULAR type name per row (Товар /
// Услуга / Комплект — live-grounded 2026-06-18 against online.moysklad.uz), which
// DIFFERS from the «Тип» FILTER dropdown that lists the PLURAL forms (Товары /
// Услуги / Комплекты — see KIND_OPTIONS). moysklad itself labels the two
// surfaces differently, so the column must not reuse the filter's plural labels.
const KIND_COLUMN_LABEL: Readonly<Record<string, string>> = {
  product: 'Товар',
  service: 'Услуга',
  bundle: 'Комплект',
};
function kindLabel(kind: string): string {
  return KIND_COLUMN_LABEL[kind] ?? kind;
}
function fmtNum(n: number | null): string {
  return n == null ? '—' : n.toLocaleString('ru-RU');
}
// minimum-balance is stored ×1000 (milliunit) like quantities.
function fmtMinorQty(minor: string | null): string {
  if (minor == null) return '—';
  const n = Number(minor) / 1000;
  return Number.isFinite(n) ? n.toLocaleString('ru-RU', { maximumFractionDigits: 3 }) : '—';
}

// Moysklad parity — 100 rows per page.
const LIMIT = 100;

// moysklad parity: the «Товары и услуги» list «Тип» filter offers exactly
// Товары · Услуги · Комплекты — PLURAL, matching the live moysklad.uz native
// <select> options (Все / Товары=Good / Услуги=Service / Комплекты=Kit, grounded
// 2026-06-17). The «Все» default is carried by the empty option rendered below.
// Variants («Модификация») are nested under their parent product and
// series/batches («Партия») live in the separate «Серийные номера» tab —
// neither appears as a «Тип» option in this list.
//
// The previous 4th entry `{ value: 'consignment', label: 'Модификация' }` was a
// §4 inversion-mislabel: «Модификация» is the `variant` entity's label, while
// the value `consignment` is «Серия/Партия» — so the pair was wrong by the data
// model, and the option does not exist in moysklad's dropdown at all. Removed.
//
// Values are Product.kind discriminators (no kind=consignment product is ever
// created — there is no kind selector in the editor; products default to
// 'product'). Kept inline (not in i18n) because the rest of the page uses
// literal Russian for static control labels and 3 keys for one dropdown = churn.
const KIND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'product', label: 'Товары' },
  { value: 'service', label: 'Услуги' },
  { value: 'bundle', label: 'Комплекты' },
];

// moysklad «Товары и услуги» toolbar create button — a white, gray-bordered
// button with a filled colored «+» circle (matching the live moysklad.uz toolbar,
// 2026-06-16). The circle colour distinguishes the assortment type
// (Товар=green · Услуга=amber · Комплект/Группа=blue).
function CreateAssortmentButton({
  href,
  label,
  circleClass,
  testId,
}: {
  href: string;
  label: string;
  circleClass: string;
  testId: string;
}) {
  return (
    <a
      href={href}
      data-test-id={testId}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--ms-radius-default)] border border-[#cccccc] bg-[var(--ms-bg-surface)] px-3 font-medium text-[var(--ms-text-primary)] text-sm transition-colors hover:bg-[var(--ms-bg-muted)]"
    >
      <span
        aria-hidden
        className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[13px] text-white leading-none ${circleClass}`}
      >
        +
      </span>
      {label}
    </a>
  );
}

export default function ProductsPage() {
  const t = useTranslations('pages.products');
  const tCommon = useTranslations('common');
  const tFields = useTranslations('fields');
  const tFilters = useTranslations('filters');

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  // «Показывать» tri-state: active = «Только обычные» (default), archived =
  // «Только архивные», all = «Все» (both — sends archived=all → no predicate).
  const [archived, setArchived] = useState<'active' | 'archived' | 'all'>('active');
  // moysklad-style offset pagination: 1-based page number (jump to any page,
  // real first/last, «101-200 из N» range). Reset to 1 on any filter/sort change.
  const [page, setPage] = useState(1);
  // «Количество строк» — moysklad's 25/50/100 page-size selector (in the ⚙ popup).
  const [pageSize, setPageSize] = useState(LIMIT);
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // moysklad parity: the «Товары и услуги» filter panel is COLLAPSED on load
  // (live-grounded 2026-06-18 — a fresh login shows just the toolbar + grid; the
  // panel opens only when «Фильтр» is clicked). Was open-by-default.
  const [filterOpen, setFilterOpen] = useState(false);
  // Joylashuvlar modali (2026-07-12): qator-klik HAM, 📍 belgisi HAM ochadi.
  const [locTarget, setLocTarget] = useState<Product | null>(null);
  // moysklad's filter 🔖 (bookmark) icon opens the «save current filter» input —
  // shared open-state between the InlineFilterPanel icon and the SavedFiltersPills.
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  // moysklad ⚙ (filter settings): which filter fields are HIDDEN. Default empty
  // = all shown; persisted per-user. The fields are keyed by their label string
  // (no per-field fieldKey needed; locale-switch just resets to all-shown).
  const filterHidden = useColumnVisibility('products-filter-hidden', []);
  const [pickerOpen, setPickerOpen] = useState<null | 'folder' | 'folderDeep' | 'modifiedBy'>(null);
  // moysklad «Товары и услуги» Фильтр panel — fields in capture order (live
  // moysklad.uz 2026-06-16): Наименование · Описание · Артикул · Код · Внешний
  // код · ИКПУ (MXIK) · [Код упаковки ТАСНИФ — deferred, needs a column] ·
  // Штрихкод · Весовой товар · Тип · Показывать · Группа товаров (без подгрупп) ·
  // Группа товаров (с подгруппами) · Поставщик · Владелец-сотрудник ·
  // Владелец-отдел · Общий доступ · Когда изменен · Кто изменил. The top search
  // box still ORs name/code/article/externalCode/barcode; these discrete inputs
  // mirror moysklad's per-column fields.
  const [nameInput, setNameInput] = useState('');
  const nameFilter = useDebounce(nameInput, 300);
  const [descriptionInput, setDescriptionInput] = useState('');
  const description = useDebounce(descriptionInput, 300);
  const [articleInput, setArticleInput] = useState('');
  const article = useDebounce(articleInput, 300);
  const [codeInput, setCodeInput] = useState('');
  const codeFilter = useDebounce(codeInput, 300);
  const [externalCodeInput, setExternalCodeInput] = useState('');
  const externalCode = useDebounce(externalCodeInput, 300);
  const [mxikInput, setMxikInput] = useState('');
  const mxikCode = useDebounce(mxikInput, 300);
  const [tasnifInput, setTasnifInput] = useState('');
  const packTasnifCode = useDebounce(tasnifInput, 300);
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcode = useDebounce(barcodeInput, 300);
  const [weighed, setWeighed] = useState<'' | 'true' | 'false'>('');
  const [kind, setKind] = useState<string>('');
  // «Группа товаров (без подгрупп)» (exact folder) + «Группа товаров»
  // (with subgroups → productFolderIdDeep, the repo expands the pathName subtree).
  const [folderFilter, setFolderFilter] = useState<{ id?: string; label?: string }>({});
  const [folderDeepFilter, setFolderDeepFilter] = useState<{ id?: string; label?: string }>({});
  // «Поставщик» — multi-select counterparties (moysklad checkbox-dropdown + phone
  // sublabel parity). Was a single-select modal picker.
  const [suppliers, setSuppliers] = useState<{ id: string; label: string }[]>([]);
  // «Владелец-сотрудник» / «Владелец-отдел» — multi-select (moysklad checkbox
  // dropdowns, grounded 2026-06-18). Each holds the picked {id,label} pairs.
  const [owners, setOwners] = useState<{ id: string; label: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; label: string }[]>([]);
  const [shared, setShared] = useState<'' | 'true' | 'false'>('');
  const [updatedFrom, setUpdatedFrom] = useState<string>('');
  const [updatedTo, setUpdatedTo] = useState<string>('');
  // «Кто изменил» — filter by the Employee who last modified the product
  // (Product.modifiedById, set from the request actor on create/edit).
  const [modifiedById, setModifiedById] = useState<string>('');
  const [modifiedByLabel, setModifiedByLabel] = useState<string>('');
  // «Характеристики» — moysklad shows one filter field per characteristic at the
  // bottom of the panel. Defs (name + distinct values) come from the account's
  // variants; the picked values per characteristic drive the `charFilter` param.
  const [charFilters, setCharFilters] = useState<Record<string, string[]>>({});
  const charValuesQuery = useQuery<{ name: string; values: string[] }[]>({
    queryKey: ['product-characteristic-values'],
    queryFn: () => api.get<{ name: string; values: string[] }[]>('/products/characteristic-values'),
    staleTime: 60_000,
  });
  const charDefs = charValuesQuery.data ?? [];
  const charFilterActive = Object.values(charFilters).some((v) => v.length > 0);

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    // Tri-state «Показывать»: 'all' → archived=all (schema maps to no predicate).
    archived: archived === 'all' ? 'all' : archived === 'archived' ? 'true' : 'false',
    limit: String(pageSize),
    sortBy: sortKey,
    sortDir,
    page: String(page),
    ...(nameFilter.trim() ? { name: nameFilter.trim() } : {}),
    ...(description.trim() ? { description: description.trim() } : {}),
    ...(article.trim() ? { article: article.trim() } : {}),
    ...(codeFilter.trim() ? { code: codeFilter.trim() } : {}),
    ...(externalCode.trim() ? { externalCode: externalCode.trim() } : {}),
    ...(mxikCode.trim() ? { mxikCode: mxikCode.trim() } : {}),
    ...(packTasnifCode.trim() ? { packTasnifCode: packTasnifCode.trim() } : {}),
    ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
    ...(weighed ? { weighed } : {}),
    ...(kind ? { kind } : {}),
    ...(folderFilter.id ? { productFolderId: folderFilter.id } : {}),
    ...(folderDeepFilter.id ? { productFolderIdDeep: folderDeepFilter.id } : {}),
    ...(suppliers.length ? { supplierId: suppliers.map((s) => s.id).join(',') } : {}),
    ...(owners.length ? { ownerId: owners.map((o) => o.id).join(',') } : {}),
    ...(groups.length ? { groupId: groups.map((g) => g.id).join(',') } : {}),
    ...(shared ? { shared } : {}),
    ...(updatedFrom ? { updatedFrom } : {}),
    ...(updatedTo ? { updatedTo } : {}),
    ...(modifiedById ? { modifiedById } : {}),
    ...(charFilterActive ? { charFilter: JSON.stringify(charFilters) } : {}),
  });

  const listQueryKey = [
    'products',
    search,
    archived,
    page,
    pageSize,
    sortKey,
    sortDir,
    nameFilter,
    description,
    article,
    codeFilter,
    externalCode,
    mxikCode,
    packTasnifCode,
    barcode,
    weighed,
    kind,
    folderFilter.id,
    folderDeepFilter.id,
    suppliers.map((s) => s.id).join(','),
    owners.map((o) => o.id).join(','),
    groups.map((g) => g.id).join(','),
    shared,
    updatedFrom,
    updatedTo,
    modifiedById,
    JSON.stringify(charFilters),
  ] as const;
  const { data, isLoading, error, refetch } = useQuery<ProductListResponse>({
    queryKey: listQueryKey,
    queryFn: () => api.get<ProductListResponse>(`/products?${params.toString()}`),
  });
  // Offset-pagination derived values (1-based page → absolute range + last page).
  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  // moysklad renders one price column per account price type (GET /price-types).
  // Shared hook = ONE cached query key app-wide, so this list no longer fires a
  // second identical /price-types fetch alongside the bulk-actions «Изменить цены»
  // drawer (which also calls usePriceTypeIds) on this same page.
  const { priceTypes } = usePriceTypeIds();

  const bulk = useBulkDocumentActions('products', listQueryKey, {
    hasFSM: false,
    hasArchive: true,
  });
  // moysklad parity (D2 audit, 2026-05-21): status (active/archived
  // flag column) removed from defaults — moysklad surfaces archive
  // status via filter, not as a default column.
  // moysklad parity — DEFAULT-visible columns, grounded on the live ⚙
  // customizer + grid (user screenshots 2026-06-18): Изображение · Тип ·
  // Наименование · Код · Артикул · Ед. изм. · Страна · Вес · Розничная цена ·
  // Оптовая цена · Общий доступ. Shipping only the leaner 7-set made our table
  // look sparse — one «Наименование» column absorbed all the slack (~555px) and
  // the rows read as half-empty vs moysklad's denser grid. Restoring the full
  // default set drops Наименование to a normal width and fills the row like
  // moysklad. All other columns stay available via the ⚙ gear. NO stock columns
  // — moysklad's list has none (stock = «Склад → Остатки»).
  // Price columns are dynamic (one per account price type) but use POSITIONAL keys
  // (price_0, price_1, …) so these static visibility defaults + the ⚙ gear keep
  // working without async-loaded keys. price_0/price_1 = the first two types
  // (Розничная/Оптовая), default-visible like moysklad.
  const cols = useColumnVisibility('products', [
    // Default-visible set + order grounded LIVE on online.moysklad.uz (farrux@
    // climart, 2026-06-18): Тип · Наименование · Код · Артикул · Ед.изм. · Страна
    // · Вес · Описание · Минимальная цена · <price-type cols> · Общий доступ
    // (the «image» thumbnail column has an empty header but is shown first).
    'image',
    'kind',
    'name',
    'code',
    'article',
    'uom',
    // Sherset custom — warehouse home location «NN-NN-NN-NN» (gear-toggleable).
    'yacheyka',
    'country',
    'weightG',
    'description',
    'minPrice',
    'price_0',
    'price_1',
    'shared',
  ]);
  const colWidths = useColumnWidths('products');

  // moysklad's product list uses moyskladToolbar + Фильтр panel chrome
  // (shared catalog chrome — verified on the processingplan DOM), not
  // active/archive pill sub-tabs. Группа/Поставщик/Holat filtering is the
  // inline filter panel below, backed by ProductFilterSchema.
  //
  // Saved filters (🔖) — moysklad parity. The product filter is a flat set of
  // discrete states (not the FilterDrawerValues object the doc lists use), so we
  // serialise it to/from a query string ourselves. Pickers keep a `__label`
  // companion param so re-applying a saved pill restores readable chips, not
  // bare ids. Only filter values are saved — never pagination/sort.
  const savedFilterQuery = (() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    if (archived !== 'active') p.set('archived', archived);
    if (nameFilter.trim()) p.set('name', nameFilter.trim());
    if (description.trim()) p.set('description', description.trim());
    if (article.trim()) p.set('article', article.trim());
    if (codeFilter.trim()) p.set('code', codeFilter.trim());
    if (externalCode.trim()) p.set('externalCode', externalCode.trim());
    if (mxikCode.trim()) p.set('mxikCode', mxikCode.trim());
    if (packTasnifCode.trim()) p.set('packTasnifCode', packTasnifCode.trim());
    if (barcode.trim()) p.set('barcode', barcode.trim());
    if (weighed) p.set('weighed', weighed);
    if (kind) p.set('kind', kind);
    const pickerParam = (key: string, v: { id?: string; label?: string }) => {
      if (!v.id) return;
      p.set(key, v.id);
      if (v.label) p.set(`${key}__label`, v.label);
    };
    pickerParam('productFolderId', folderFilter);
    pickerParam('productFolderIdDeep', folderDeepFilter);
    // Multi-select fields stored as JSON ({id,label}[]) so a re-applied pill
    // restores the checkbox labels, not bare ids.
    if (suppliers.length) p.set('suppliers', JSON.stringify(suppliers));
    if (owners.length) p.set('owners', JSON.stringify(owners));
    if (groups.length) p.set('groups', JSON.stringify(groups));
    if (shared) p.set('shared', shared);
    if (updatedFrom) p.set('updatedFrom', updatedFrom);
    if (updatedTo) p.set('updatedTo', updatedTo);
    if (modifiedById) {
      p.set('modifiedById', modifiedById);
      if (modifiedByLabel) p.set('modifiedById__label', modifiedByLabel);
    }
    return p.toString();
  })();

  const applySavedFilter = (qs: string) => {
    const p = new URLSearchParams(qs);
    const picker = (key: string): { id?: string; label?: string } =>
      p.get(key) ? { id: p.get(key) ?? undefined, label: p.get(`${key}__label`) ?? undefined } : {};
    setPage(1);
    setSearchInput(p.get('search') ?? '');
    setArchived((p.get('archived') ?? 'active') as 'active' | 'archived' | 'all');
    setNameInput(p.get('name') ?? '');
    setDescriptionInput(p.get('description') ?? '');
    setArticleInput(p.get('article') ?? '');
    setCodeInput(p.get('code') ?? '');
    setExternalCodeInput(p.get('externalCode') ?? '');
    setMxikInput(p.get('mxikCode') ?? '');
    setTasnifInput(p.get('packTasnifCode') ?? '');
    setBarcodeInput(p.get('barcode') ?? '');
    setWeighed((p.get('weighed') ?? '') as '' | 'true' | 'false');
    setKind(p.get('kind') ?? '');
    setFolderFilter(picker('productFolderId'));
    setFolderDeepFilter(picker('productFolderIdDeep'));
    const parseList = (key: string): { id: string; label: string }[] => {
      try {
        const raw = p.get(key);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr)
          ? arr
              .filter((x) => x && typeof x.id === 'string')
              .map((x) => ({ id: x.id, label: String(x.label ?? x.id) }))
          : [];
      } catch {
        return [];
      }
    };
    // Back-compat: filters saved before the multi-select round (2026-06-18)
    // serialized a single ownerId/groupId (+__label) rather than the owners/
    // groups JSON arrays. Fall back to the legacy keys so an old saved filter
    // doesn't silently drop its owner/department (and broaden the result set).
    const ownersList = parseList('owners');
    const ownerLegacy = picker('ownerId');
    setOwners(
      ownersList.length > 0
        ? ownersList
        : ownerLegacy.id
          ? [{ id: ownerLegacy.id, label: ownerLegacy.label ?? ownerLegacy.id }]
          : [],
    );
    const groupsList = parseList('groups');
    const groupLegacy = picker('groupId');
    setGroups(
      groupsList.length > 0
        ? groupsList
        : groupLegacy.id
          ? [{ id: groupLegacy.id, label: groupLegacy.label ?? groupLegacy.id }]
          : [],
    );
    const suppliersList = parseList('suppliers');
    const supplierLegacy = picker('supplierId');
    setSuppliers(
      suppliersList.length > 0
        ? suppliersList
        : supplierLegacy.id
          ? [{ id: supplierLegacy.id, label: supplierLegacy.label ?? supplierLegacy.id }]
          : [],
    );
    setShared((p.get('shared') ?? '') as '' | 'true' | 'false');
    setUpdatedFrom(p.get('updatedFrom') ?? '');
    setUpdatedTo(p.get('updatedTo') ?? '');
    setModifiedById(p.get('modifiedById') ?? '');
    setModifiedByLabel(p.get('modifiedById__label') ?? '');
  };

  const columns: DataTableColumn<Product>[] = [
    // moysklad «Изображение» — first, default-on. Narrow column with an empty
    // grid header (matching moysklad); renders the main-image thumbnail via the
    // list API's mainImageId (GET /api/v1/images/:id/raw — same proven pattern as
    // the «Выбор товара» modal), or a «—» placeholder when the product has none.
    {
      key: 'image',
      header: '',
      width: '44px',
      align: 'center',
      cell: (p) =>
        p.mainImageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- raw API byte stream, not a static asset (next/image can't proxy it)
          <img
            src={`/api/v1/images/${p.mainImageId}/raw`}
            alt=""
            loading="lazy"
            className="mx-auto h-7 w-7 rounded object-cover"
          />
        ) : (
          <span className="text-[var(--ms-text-muted)] text-xs" aria-hidden>
            —
          </span>
        ),
      cellText: () => '',
    },
    {
      key: 'kind',
      header: tFilters('product_kind'),
      sortable: true,
      width: '100px',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-xs">{kindLabel(p.kind)}</span>,
      cellText: (p) => kindLabel(p.kind),
    },
    {
      key: 'name',
      // moysklad uses «Наименование» (not «Название») for the products name column;
      // products-local key (not app-wide tFields.name) to avoid touching other lists.
      header: t('col_name'),
      sortable: true,
      // Primary column — widest, like moysklad's «Наименование». Needs an explicit
      // width: with the full column set the fixed-width columns sum past the
      // viewport, so a width-less «name» collapses to ~0 (table-layout:fixed) and
      // the grid scrolls horizontally for the overflow instead.
      width: '280px',
      cell: (p) => (
        <a
          href={`/products/${p.id}`}
          // Nom bosilganda KARTOCHKAGA o'tiladi — qator-klik modalini ochmasin.
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-[var(--ms-text-primary)] underline-offset-2 hover:text-[var(--ms-text-brand)] hover:underline"
        >
          {p.name}
        </a>
      ),
      cellText: (r: Product) => r.name,
    },
    {
      key: 'code',
      header: tFields('code'),
      sortable: true,
      cell: (p) => p.code ?? tCommon('none'),
      width: '120px',
    },
    // moysklad parity (D2 audit): «Артикул» + «Ед. изм.» — default
    // columns on #good between Код and Цена продажи.
    {
      key: 'article',
      header: tFields('article'),
      sortable: true,
      width: '120px',
      cell: (p) => <span className="font-mono text-xs">{p.article ?? tCommon('none')}</span>,
      cellText: (r: Product) => r.article ?? '',
    },
    {
      key: 'uom',
      header: t('col_uom'),
      sortable: true,
      width: '90px',
      align: 'center',
      cell: (p) => <span className="text-[var(--ms-text-muted)] text-xs">{p.uom ?? '—'}</span>,
      cellText: (r: Product) => r.uom ?? '',
    },
    {
      // Sherset custom — warehouse home location «NN-NN-NN-NN».
      key: 'yacheyka',
      header: t('col_yacheyka'),
      width: '120px',
      align: 'center',
      // 2026-07-12: kod endi bosiladigan 📍 popover — kartochkaga kirmasdan
      // BARCHA joylar (asosiy + qo'shimcha polkalar) sonlari bilan ochiladi.
      cell: (p) => (
        <span className="inline-flex items-center gap-1 font-mono text-[var(--ms-text-secondary)] text-xs tabular-nums tracking-wider">
          {formatBinLocation(p) || '—'}
          <span aria-hidden>📍</span>
        </span>
      ),
      cellText: (r: Product) => formatBinLocation(r),
    },
    // moysklad ⚙ column-customizer — extra (non-default) columns in moysklad's
    // exact order. NO folder/createdAt/status columns (moysklad has none of those
    // in its 26-set). All data comes from the list API's `include`. Verified live
    // on moysklad.uz 2026-06-16.
    {
      key: 'country',
      header: tCommon('country'),
      sortable: true,
      width: '90px',
      cell: (p) => p.country ?? '—',
      cellText: (p) => p.country ?? '',
    },
    {
      key: 'weightG',
      header: t('col_weight'),
      sortable: true,
      align: 'right',
      width: '90px',
      cell: (p) => <span className="tabular-nums">{fmtNum(p.weightG)}</span>,
      cellText: (p) => fmtNum(p.weightG),
    },
    {
      key: 'volumeML',
      header: t('col_volume'),
      sortable: true,
      align: 'right',
      width: '90px',
      cell: (p) => <span className="tabular-nums">{fmtNum(p.volumeML)}</span>,
      cellText: (p) => fmtNum(p.volumeML),
    },
    {
      key: 'isSerialTrackable',
      header: t('col_serial'),
      align: 'center',
      width: '120px',
      cell: (p) => (p.isSerialTrackable ? tCommon('yes') : '—'),
    },
    {
      key: 'mxikCode',
      header: tFilters('mxik'),
      sortable: true,
      width: '140px',
      cell: (p) => <span className="font-mono text-xs">{p.mxikCode ?? '—'}</span>,
      cellText: (p) => p.mxikCode ?? '',
    },
    {
      key: 'packTasnif',
      header: tFilters('tasnif'),
      width: '160px',
      cell: (p) => <span className="font-mono text-xs">{p.packTasnif ?? '—'}</span>,
      cellText: (p) => p.packTasnif ?? '',
    },
    {
      key: 'vat',
      header: tFields('vat'),
      sortable: true,
      width: '80px',
      cell: (p) => (p.vat != null ? `${p.vat}%` : tCommon('none')),
    },
    {
      key: 'minStock',
      header: t('col_min_stock'),
      sortable: true,
      sortField: 'minimumBalanceMinor',
      align: 'right',
      width: '120px',
      cell: (p) => <span className="tabular-nums">{fmtMinorQty(p.minimumBalanceMinor)}</span>,
      cellText: (p) => fmtMinorQty(p.minimumBalanceMinor),
    },
    {
      key: 'supplier',
      header: tFields('supplier'),
      width: '160px',
      cell: (p) => <span className="text-[var(--ms-text-muted)]">{p.supplier?.name ?? '—'}</span>,
      cellText: (p) => p.supplier?.name ?? '',
    },
    {
      key: 'description',
      header: tFilters('description'),
      width: '160px',
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{p.description ?? '—'}</span>
      ),
      cellText: (p) => p.description ?? '',
    },
    {
      key: 'minPrice',
      header: t('col_min_price'),
      align: 'right',
      width: '140px',
      cell: (p) => <span className="tabular-nums">{fmtPrice(p.minPrice)}</span>,
      cellText: (p) => fmtPrice(p.minPrice),
    },
    {
      key: 'buyPrice',
      header: t('col_buy_price'),
      align: 'right',
      width: '140px',
      cell: (p) => <span className="tabular-nums">{fmtPrice(p.buyPrice)}</span>,
      cellText: (p) => fmtPrice(p.buyPrice),
    },
    // moysklad price-type columns — ONE per account price type (GET /price-types),
    // in position order, each with the type's currency suffix. Positional keys
    // (price_0, price_1, …) keep the static visibility defaults + ⚙ gear working.
    // The cell bridges legacy 'default'/'wholesale' sentinels (see salePriceForType).
    ...priceTypes.map(
      (type, i): DataTableColumn<Product> => ({
        key: `price_${i}`,
        header: type.name,
        align: 'right',
        width: '160px',
        cell: (p) => (
          <span className="tabular-nums">
            {fmtPriceCur(salePriceForType(p, type, i), type.currency)}
          </span>
        ),
        cellText: (p) => fmtPriceCur(salePriceForType(p, type, i), type.currency),
      }),
    ),
    {
      key: 'variantCount',
      header: t('col_variant_count'),
      align: 'right',
      width: '110px',
      cell: (p) => <span className="tabular-nums">{p.variantCount || '—'}</span>,
      cellText: (p) => String(p.variantCount || ''),
    },
    {
      key: 'shared',
      header: tFilters('shared'),
      sortable: true,
      align: 'center',
      width: '110px',
      // moysklad «Общий доступ» renders a green ✓ when shared, blank otherwise
      // (live-grounded 2026-06-18) — NOT a «Да»/«—» text.
      cell: (p) =>
        p.shared ? (
          <Icons.check
            className="mx-auto h-4 w-4 text-[var(--ms-text-success)]"
            aria-label={tCommon('yes')}
          />
        ) : (
          ''
        ),
      cellText: (p) => (p.shared ? tCommon('yes') : ''),
    },
    {
      key: 'group',
      header: tFilters('owner_group'),
      width: '140px',
      cell: (p) => <span className="text-[var(--ms-text-muted)]">{p.group?.name ?? '—'}</span>,
      cellText: (p) => p.group?.name ?? '',
    },
    {
      key: 'owner',
      header: tFilters('owner_employee'),
      width: '140px',
      cell: (p) => <span className="text-[var(--ms-text-muted)]">{p.owner?.name ?? '—'}</span>,
      cellText: (p) => p.owner?.name ?? '',
    },
    {
      key: 'updatedAt',
      header: tFilters('updated_period'),
      width: '160px',
      sortable: true,
      cell: (p) => (
        <span className="text-[var(--ms-text-muted)] text-xs">{formatDate(p.updatedAt)}</span>
      ),
    },
    {
      key: 'modifiedBy',
      header: tFilters('modified_by'),
      width: '140px',
      cell: (p) => <span className="text-[var(--ms-text-muted)]">{p.modifiedBy?.name ?? '—'}</span>,
      cellText: (p) => p.modifiedBy?.name ?? '',
    },
  ];

  const hasActiveFilter =
    !!search ||
    archived !== 'active' ||
    !!nameFilter.trim() ||
    !!description.trim() ||
    !!article.trim() ||
    !!codeFilter.trim() ||
    !!externalCode.trim() ||
    !!mxikCode.trim() ||
    !!packTasnifCode.trim() ||
    !!barcode.trim() ||
    !!weighed ||
    !!kind ||
    !!folderFilter.id ||
    !!folderDeepFilter.id ||
    suppliers.length > 0 ||
    owners.length > 0 ||
    groups.length > 0 ||
    !!shared ||
    !!updatedFrom ||
    !!updatedTo ||
    !!modifiedById;

  return (
    <>
      <ListView
        testId="products-page"
        sidebar={
          /* moysklad parity: the folder tree sits beside the table only —
             below the full-width toolbar + filter — via ListView's sidebar
             slot, not as a sibling spanning the whole view. */
          <ProductFolderTree
            selectedId={folderFilter.id ?? null}
            onSelect={(id, label) => {
              setFolderFilter(id ? { id, label: label ?? id } : {});
              setPage(1);
            }}
          />
        }
        title={t('title')}
        subtitle={data ? tCommon('records_count', { count: data.total }) : undefined}
        moyskladToolbar
        onRefresh={() => refetch()}
        onHelp={() => window.open('/help/products', '_blank')}
        search={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPage(1);
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
          setPage(1);
        }}
        searchPlaceholder={t('search_placeholder')}
        columns={columns}
        rows={data?.items ?? []}
        keyField="id"
        // 2026-07-12: qatorning ISTALGAN joyi bosilganda joylashuvlar modali
        // ochiladi (kartochkaga o'tish — nom havolasi yoki modal tugmasi orqali).
        onRowClick={(p) => setLocTarget(p)}
        rowTestId={(p) => `product-row-${p.id}`}
        rowActions={(p) => bulk.rowDelete(p.id)}
        total={data?.total ?? 0}
        limit={pageSize}
        paginationOffset={(page - 1) * pageSize}
        hasPrevious={page > 1}
        hasNext={page < lastPage}
        onFirst={() => setPage(1)}
        onPrevious={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
        onLast={() => setPage(lastPage)}
        loading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyTitle={search ? tCommon('no_results') : t('empty_title')}
        emptyDescription={search ? undefined : t('empty_description')}
        hasActiveFilter={hasActiveFilter}
        {...bulk.listViewProps}
        visibleColumnKeys={cols.visibleKeys}
        headerSlot={
          /* Inline filter panel — moysklad «Товары и услуги» Фильтр 1:1.
               Field order + set captured LIVE on moysklad.uz 2026-06-16
               (docs/audits/products-list-moysklad-live-groundtruth-2026-06-16.md):
                 Наименование · Описание · Артикул · Код · Внешний код · ИКПУ
                 (MXIK) · [Код упаковки ТАСНИФ — deferred, needs a ProductPack
                 column] · Штрихкод · Весовой товар · Тип · Показывать · Группа
                 товаров (без подгрупп) · Группа товаров (с подгруппами) ·
                 Поставщик · Владелец-сотрудник · Владелец-отдел · Общий доступ ·
                 Когда изменен · Кто изменил. The earlier extras (Тип учёта /
                 Страна / Ниже минимума) were NOT in moysklad's panel and were
                 removed for true 1:1 (user-confirmed 2026-06-16). */
          <InlineFilterPanel
            hidden={!filterOpen}
            applyLabel={tFilters('find')}
            clearLabel={tFilters('clear')}
            onBookmarkClick={() => setSaveFilterOpen(true)}
            fieldVisibility={{
              hidden: filterHidden.visibleKeys,
              onToggle: (k) => {
                const next = new Set(filterHidden.visibleKeys);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                filterHidden.setVisibleKeys(next);
              },
            }}
            pills={
              <SavedFiltersPills
                entity="product"
                currentQueryString={savedFilterQuery}
                onApply={applySavedFilter}
                adding={saveFilterOpen}
                onAddingChange={setSaveFilterOpen}
              />
            }
            onClear={() => {
              setArchived('active');
              setNameInput('');
              setDescriptionInput('');
              setArticleInput('');
              setCodeInput('');
              setExternalCodeInput('');
              setMxikInput('');
              setTasnifInput('');
              setBarcodeInput('');
              setWeighed('');
              setKind('');
              setFolderFilter({});
              setFolderDeepFilter({});
              setSuppliers([]);
              setOwners([]);
              setGroups([]);
              setShared('');
              setUpdatedFrom('');
              setUpdatedTo('');
              setModifiedById('');
              setModifiedByLabel('');
              setCharFilters({});
              setPage(1);
            }}
            testId="products-inline-filter"
          >
            {/* 1. Наименование — name contains (insensitive). */}
            <InlineFilterPanel.Field label={tFilters('name')} expandable={false}>
              <Input
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-name"
              />
            </InlineFilterPanel.Field>
            {/* 2. Описание — product description (contains, insensitive). */}
            <InlineFilterPanel.Field label={tFilters('description')} expandable={false}>
              <Input
                value={descriptionInput}
                onChange={(e) => {
                  setDescriptionInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-description"
              />
            </InlineFilterPanel.Field>
            {/* 3. Артикул — article contains (insensitive). */}
            <InlineFilterPanel.Field label={tFilters('article')} expandable={false}>
              <Input
                value={articleInput}
                onChange={(e) => {
                  setArticleInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-article"
              />
            </InlineFilterPanel.Field>
            {/* 4. Код — code contains (insensitive). */}
            <InlineFilterPanel.Field label={tFilters('code')} expandable={false}>
              <Input
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-code"
              />
            </InlineFilterPanel.Field>
            {/* 5. Внешний код — externalCode contains (insensitive). */}
            <InlineFilterPanel.Field label={tFilters('external_code')} expandable={false}>
              <Input
                value={externalCodeInput}
                onChange={(e) => {
                  setExternalCodeInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-external-code"
              />
            </InlineFilterPanel.Field>
            {/* 6. ИКПУ (MXIK) — partial code lookup (contains). */}
            <InlineFilterPanel.Field label={tFilters('mxik')} expandable={false}>
              <Input
                value={mxikInput}
                onChange={(e) => {
                  setMxikInput(e.target.value);
                  setPage(1);
                }}
                inputMode="numeric"
                data-test-id="filter-mxik"
              />
            </InlineFilterPanel.Field>
            {/* 7. Код упаковки ТАСНИФ — products having a pack with this code. */}
            <InlineFilterPanel.Field label={tFilters('tasnif')} expandable={false}>
              <Input
                value={tasnifInput}
                onChange={(e) => {
                  setTasnifInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-tasnif"
              />
            </InlineFilterPanel.Field>
            {/* 8. Штрихкод — exact token in the barcodes[] array (has). */}
            <InlineFilterPanel.Field label={tFilters('barcode')} expandable={false}>
              <Input
                value={barcodeInput}
                onChange={(e) => {
                  setBarcodeInput(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-barcode"
              />
            </InlineFilterPanel.Field>
            {/* 8. Весовой товар — tri-state. moysklad option order: Все / Нет / Да
                   (empty=Все, false=Нет, true=Да — grounded on live native select). */}
            <InlineFilterPanel.Field label={tFilters('weighed')} expandable={false}>
              <NativeSelect
                value={weighed}
                onChange={(e) => {
                  setWeighed(e.target.value as '' | 'true' | 'false');
                  setPage(1);
                }}
                data-test-id="filter-weighed"
              >
                <option value="">{tCommon('all')}</option>
                <option value="false">{tCommon('no')}</option>
                <option value="true">{tCommon('yes')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 9. Тип — moysklad's bare «Тип» (captured value «Все»). The
                   empty option carries the «Все» default; the kind values are
                   the assortment discriminators. */}
            <InlineFilterPanel.Field label={tFilters('product_kind')} expandable={false}>
              <NativeSelect
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setPage(1);
                }}
                data-test-id="filter-kind"
              >
                <option value="">{tCommon('all')}</option>
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 10. Показывать — moysklad's tri-state visibility filter
                   (captured label «Показывать», captured value «Только
                   обычные»). active = «Только обычные» (default), archived =
                   «Только архивные», all = «Все» (both — no archive predicate).
                   NB label is filters.show, NOT fields.state («Статус») which
                   is a different, shared field label. */}
            <InlineFilterPanel.Field label={tFilters('show')} expandable={false}>
              <NativeSelect
                value={archived}
                onChange={(e) => {
                  setArchived(e.target.value as 'active' | 'archived' | 'all');
                  setPage(1);
                }}
                data-test-id="filter-archived"
              >
                <option value="active">{tFilters('show_regular')}</option>
                <option value="archived">{tFilters('show_archived')}</option>
                <option value="all">{tCommon('all')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 11. Группа товаров (без подгрупп) → productFolderId (exact).
                   moysklad field-help tooltip (grounded live): «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFilters('product_folder_exact')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <CatalogPickerField
                value={
                  folderFilter.id
                    ? { id: folderFilter.id, label: folderFilter.label ?? folderFilter.id }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('folder')}
                onClear={() => {
                  setFolderFilter({});
                  setPage(1);
                }}
                testId="filter-folder"
              />
            </InlineFilterPanel.Field>
            {/* 12. Группа товаров (с подгруппами) → productFolderIdDeep (the
                   repo expands the folder + every descendant via pathName).
                   moysklad field-help tooltip (grounded live): «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFilters('product_folder')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <CatalogPickerField
                value={
                  folderDeepFilter.id
                    ? {
                        id: folderDeepFilter.id,
                        label: folderDeepFilter.label ?? folderDeepFilter.id,
                      }
                    : null
                }
                placeholder=""
                onPick={() => setPickerOpen('folderDeep')}
                onClear={() => {
                  setFolderDeepFilter({});
                  setPage(1);
                }}
                testId="filter-folder-deep"
              />
            </InlineFilterPanel.Field>
            {/* 13. Поставщик — multi-select counterparty dropdown with checkboxes +
                   a phone sublabel under each name (live moysklad parity 2026-06-18).
                   moysklad field-help tooltip: «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFields('supplier')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <MultiCombobox
                value={suppliers.map((s) => s.id)}
                items={suppliers.map((s) => ({ value: s.id, label: s.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{
                    items: { id: string; name: string; phone?: string }[];
                  }>(`/counterparties?search=${encodeURIComponent(q)}&limit=20`);
                  return r.items.map((x) => ({
                    value: x.id,
                    label: x.name,
                    sublabel: x.phone || undefined,
                    searchText: `${x.name} ${x.phone ?? ''}`,
                  }));
                }}
                onChange={(nextIds, toggled) => {
                  setSuppliers((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((s) => s.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setPage(1);
                }}
                placeholder=""
                testId="filter-supplier"
              />
            </InlineFilterPanel.Field>
            {/* 14. Владелец-сотрудник — Employee picker via /employees.
                   moysklad field-help tooltip: «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFilters('owner_employee')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <MultiCombobox
                value={owners.map((o) => o.id)}
                items={owners.map((o) => ({ value: o.id, label: o.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/employees?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ value: x.id, label: x.name }));
                }}
                onChange={(nextIds, toggled) => {
                  setOwners((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((o) => o.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setPage(1);
                }}
                placeholder=""
                testId="filter-owner"
              />
            </InlineFilterPanel.Field>
            {/* 15. Владелец-отдел — Group (отдел) multi-select via /groups; backs
                   the repo's groupId `in` where-clause.
                   moysklad field-help tooltip: «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFilters('owner_group')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <MultiCombobox
                value={groups.map((g) => g.id)}
                items={groups.map((g) => ({ value: g.id, label: g.label }))}
                onSearch={async (q) => {
                  const r = await api.get<{ items: { id: string; name: string }[] }>(
                    `/groups?search=${encodeURIComponent(q)}&limit=20`,
                  );
                  return r.items.map((x) => ({ value: x.id, label: x.name }));
                }}
                onChange={(nextIds, toggled) => {
                  setGroups((prev) =>
                    nextIds.map((id) => {
                      const ex = prev.find((g) => g.id === id);
                      if (ex) return ex;
                      if (toggled?.value === id) return { id, label: String(toggled.label) };
                      return { id, label: id };
                    }),
                  );
                  setPage(1);
                }}
                placeholder=""
                testId="filter-group"
              />
            </InlineFilterPanel.Field>
            {/* 16. Общий доступ — tri-state (Все / Да / Нет). */}
            <InlineFilterPanel.Field label={tFilters('shared')} expandable={false}>
              <NativeSelect
                value={shared}
                onChange={(e) => {
                  setShared(e.target.value as '' | 'true' | 'false');
                  setPage(1);
                }}
                data-test-id="filter-shared"
              >
                <option value="">{tCommon('all')}</option>
                <option value="true">{tCommon('yes')}</option>
                <option value="false">{tCommon('no')}</option>
              </NativeSelect>
            </InlineFilterPanel.Field>
            {/* 17. Когда изменен — half-open day range over updatedAt.
                   moysklad renders the вч·сег·нед·мес shortcuts INLINE with the
                   label (via inlineSuffix), the two date inputs below; field-help
                   tooltip (grounded live): «Попадает в период». */}
            <InlineFilterPanel.Field
              label={tFilters('updated_period')}
              tooltip="Попадает в период"
              inlineSuffix={
                <PeriodShortcuts
                  onChange={({ from, to }) => {
                    setUpdatedFrom(from ?? '');
                    setUpdatedTo(to ?? '');
                    setPage(1);
                  }}
                  labels={{
                    yesterday: tFilters('period_yesterday'),
                    today: tFilters('period_today'),
                    week: tFilters('period_week'),
                    month: tFilters('period_month'),
                  }}
                />
              }
              expandable={false}
            >
              <PeriodInputs
                from={updatedFrom}
                to={updatedTo}
                onChange={({ from, to }) => {
                  setUpdatedFrom(from ?? '');
                  setUpdatedTo(to ?? '');
                  setPage(1);
                }}
                testId="filter-updated-period"
              />
            </InlineFilterPanel.Field>
            {/* 18. Кто изменил — Employee picker over Product.modifiedById.
                   moysklad field-help tooltip: «По умолчанию содержит». */}
            <InlineFilterPanel.Field
              label={tFilters('modified_by')}
              tooltip="По умолчанию содержит"
              expandable={false}
            >
              <CatalogPickerField
                value={
                  modifiedById ? { id: modifiedById, label: modifiedByLabel || modifiedById } : null
                }
                placeholder=""
                onPick={() => setPickerOpen('modifiedBy')}
                onClear={() => {
                  setModifiedById('');
                  setModifiedByLabel('');
                  setPage(1);
                }}
                testId="filter-modified-by"
              />
            </InlineFilterPanel.Field>

            {/* «Характеристики» — moysklad appends one field per characteristic at the
                bottom of the panel; each is a checkbox dropdown of that characteristic's
                distinct values. Drives the `charFilter` param (variant-characteristic
                match). Absent when the account has no variant characteristics. */}
            {charDefs.map((cd) => (
              <InlineFilterPanel.Field key={cd.name} label={cd.name} expandable={false}>
                <MultiCombobox
                  value={charFilters[cd.name] ?? []}
                  items={cd.values.map((v) => ({ value: v, label: v }))}
                  onChange={(next) => {
                    setCharFilters((prev) => ({ ...prev, [cd.name]: next }));
                    setPage(1);
                  }}
                  placeholder=""
                  searchPlaceholder={tCommon('search')}
                  testId={`filter-char-${cd.name}`}
                />
              </InlineFilterPanel.Field>
            ))}
          </InlineFilterPanel>
        }
        extraActionsLeft={
          // moysklad parity (re-grounded 2026-06-18 against the USER's live
          // account): the create buttons + Фильтр are SEPARATE rounded pills with
          // a gap between them — NOT a joined segmented bar. (A prior "measured
          // gap=0, joined" read was WRONG; the user's moysklad shows distinct,
          // individually-rounded buttons spaced apart.)
          <div className="flex items-center gap-2">
            {/* moysklad «Товары и услуги» 4 create buttons (live 2026-06-16):
                  Товар (green) → product · Услуга (amber) → service · Комплект
                  (blue) → bundle · Группа (blue) → folder management. White button
                  + filled colored «+» circle, matching moysklad's toolbar. */}
            <CreateAssortmentButton
              href="/products/new"
              label={t('btn_product')}
              circleClass="bg-[var(--ms-text-success)]"
              testId="create-product"
            />
            <CreateAssortmentButton
              href="/services/new"
              label={t('btn_service')}
              circleClass="bg-[var(--ms-text-warning)]"
              testId="create-service"
            />
            <CreateAssortmentButton
              href="/bundles/new"
              label={t('btn_bundle')}
              circleClass="bg-[var(--ms-text-brand)]"
              testId="create-bundle"
            />
            <CreateAssortmentButton
              href="/product-folders"
              label={t('btn_group')}
              circleClass="bg-[var(--ms-text-brand)]"
              testId="create-group"
            />
            <FilterToggleButton
              open={filterOpen}
              onToggle={() => setFilterOpen((v) => !v)}
              label={tFilters('trigger')}
              // Separate pill at the create-button height (h-9) so the toolbar
              // pills line up; #cccccc border + bg-muted hover match them.
              className="h-9 border-[#cccccc] hover:bg-[var(--ms-bg-muted)]"
            />
          </div>
        }
        extraActions={
          // moysklad parity (re-grounded 2026-06-18 against the user's account):
          // the right toolbar group [0 | Изменить ▾ | 🖨 Печать ▾] is ONE connected
          // segmented bar — selection-count cap on the left, then the two
          // dropdowns, square inner corners, overlapping 1px borders. (Unlike the
          // create buttons on the left, which are SEPARATE pills.)
          <div className="flex items-center" data-test-id="assortment-action-group">
            <span
              className="inline-flex h-9 items-center rounded-l-[var(--ms-radius-default)] border border-[#cccccc] bg-[var(--ms-bg-surface)] px-3 text-[12px] text-[var(--ms-text-primary)] tabular-nums"
              data-test-id="toolbar-selection-count"
              title={
                bulk.selectedIds.size > 0
                  ? `${bulk.selectedIds.size} ta qator tanlangan`
                  : 'Hech narsa tanlanmagan'
              }
            >
              {bulk.selectedIds.size}
            </span>
            <AssortmentBulkActionsDropdown
              selectedIds={bulk.selectedIds}
              listQueryKey={listQueryKey}
              onClearSelection={bulk.clearSelection}
              archivedView={archived}
              triggerClassName="-ml-px h-9 rounded-none border-[#cccccc]"
            />
            <AssortmentPrintDropdown
              selectedIds={[...bulk.selectedIds]}
              triggerClassName="-ml-px h-9 rounded-l-none rounded-r-[var(--ms-radius-default)] border-[#cccccc]"
            />
          </div>
        }
        headerEndSlot={
          <ColumnSettings
            columns={columns.map((c) => ({
              key: c.key,
              // The image column has an empty grid header; show «Изображение» in
              // the ⚙ list (matching moysklad's column-customizer label).
              label: c.key === 'image' ? tFields('image') : c.header,
            }))}
            visibleKeys={cols.visibleKeys}
            onChange={cols.setVisibleKeys}
            onReset={cols.reset}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        }
        columnWidths={colWidths.values}
        onColumnResize={colWidths.set}
      />
      <CatalogPicker
        open={pickerOpen === 'folder'}
        onClose={() => setPickerOpen(null)}
        title="Группа"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/product-folders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFolderFilter({ id: item.id, label: String(item.primary) });
          setPage(1);
        }}
      />
      {/* «Группа товаров (с подгруппами)» — same reference, sends productFolderIdDeep. */}
      <CatalogPicker
        open={pickerOpen === 'folderDeep'}
        onClose={() => setPickerOpen(null)}
        title="Группа"
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/product-folders?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setFolderDeepFilter({ id: item.id, label: String(item.primary) });
          setPage(1);
        }}
      />
      {/* Поставщик / Владелец-сотрудник / Владелец-отдел now use inline
          MultiCombobox dropdowns (checkbox + type-to-filter) in the filter
          panel — no modal. */}
      {/* Кто изменил picker — Employee reference (same source as «Владелец-сотрудник»). */}
      <CatalogPicker
        open={pickerOpen === 'modifiedBy'}
        onClose={() => setPickerOpen(null)}
        title={tFilters('modified_by')}
        fetcher={async (q): Promise<PickerItem[]> => {
          const r = await api.get<{ items: { id: string; name: string }[] }>(
            `/employees?search=${encodeURIComponent(q)}&limit=20`,
          );
          return r.items.map((x) => ({ id: x.id, primary: x.name }));
        }}
        onSelect={(item) => {
          setModifiedById(item.id);
          setModifiedByLabel(String(item.primary));
          setPage(1);
        }}
      />

      {/* Joylashuvlar modali — qator-klik/📍 dan ochiladi */}
      {locTarget && (
        <ProductLocationsModal
          productId={locTarget.id}
          productName={locTarget.name}
          open={locTarget !== null}
          onOpenChange={(o) => !o && setLocTarget(null)}
          onOpenCard={() => {
            window.location.href = `/products/${locTarget.id}`;
          }}
        />
      )}
    </>
  );
}
