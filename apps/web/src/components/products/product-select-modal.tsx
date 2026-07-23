'use client';

/**
 * «Выбор товара» — moysklad's rich product-selection modal (the
 * «Добавить из справочника» button on every document position table).
 *
 * Parity target (live deep-spec, docs/audits/customer-order-DEEP-LIVE-SPEC.md §7):
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │ Выбор товара  🔄  [➕ Создать]  [Фильтр]  [search]               [✕] │
 *   ├───────────────┬────────────────────────────────────────────────────┤
 *   │ folder tree   │ 🖼 │ Наименование▲ │ Кол-во │ … стоки … │ Код │     │
 *   │ (Товары и…)   │ Артикул │ Ед.изм │ Розничная цена │ Оптовая цена ⚙ │
 *   ├───────────────┴────────────────────────────────────────────────────┤
 *   │ [Выбрать]  [Отменить]                                               │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * The left folder tree filters the table by category; the user types a
 * quantity on any number of rows and one «Выбрать» adds them all (bulk).
 * Header columns Наименование/Код sort server-side; the ⚙ on the last price
 * column toggles which of the account's price types are shown. Backend:
 * GET /product-folders/tree + GET /products (returns {onHand,reserved,
 * inTransit,available} stock cluster, `article`, and `mainImageId`) +
 * GET /price-types (the account's price-type columns) + GET /images/:id/raw.
 *
 * Localised strings are injected by the caller (avoids the RU-leak bug-class
 * — the same approach as CatalogPickerLabels / ModalLabels). Price-type column
 * headers come from account DATA (the price-type names) so they are not i18n'd.
 */

import { ColumnSettings } from '@/components/column-settings';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useColumnWidths } from '@/hooks/use-column-widths';
import { api } from '@/lib/api-client';
import { imageRawUrl } from '@/lib/image-url';
import { resolveDefaultSalePriceOrZero } from '@/lib/sale-price';
import {
  Button,
  CatalogPickerField,
  DataTable,
  type DataTableColumn,
  Input,
  MultiCombobox,
  NativeSelect,
  Pagination,
  type PickerItem,
  cn,
  formatMoney,
  useDebounce,
} from '@moysklad/ui';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Image as ImageIcon, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { PositionColumnCustomizer } from '../documents/position-column-customizer';
import { ProductFolderTree } from './product-folder-tree';

export interface ProductSelectRow {
  id: string;
  name: string;
  code: string | null;
  article: string | null;
  uom: string | null;
  vat: number | null;
  salePrices: Array<{ priceTypeId: string; value: string }> | null;
  mainImageId: string | null;
  stock: { onHand: string; reserved: string; inTransit: string; available: string };
  // Surfaced only in SELECTION mode (the analog picker mirrors the full Tovary
  // list page columns: Тип · … · Страна · Вес · Описание · Мин.цена · Розн.цена).
  // The /products list returns all of these as plain product scalars.
  kind?: string;
  description?: string | null;
  minPrice?: string | null;
  country?: string | null;
  weightG?: number | null;
}

interface ProductListResponse {
  items: ProductSelectRow[];
  total?: number;
}

interface PriceTypeRow {
  id: string;
  name: string;
  currency: string;
  isDefault: boolean;
  position: number;
}
interface PriceTypeListResponse {
  items: PriceTypeRow[];
}

/** Filter-panel labels for the modal's «Фильтр» (moysklad parity). Optional —
 *  when omitted the «Фильтр» toggle + panel are hidden. Options are injected as
 *  {value,label} arrays so the caller controls i18n (RU-leak protection). */
export interface ProductSelectFilterLabels {
  toggle: string;
  kind: string;
  kindOptions: ReadonlyArray<{ value: string; label: string }>;
  show: string;
  showOptions: ReadonlyArray<{ value: string; label: string }>;
  barcode: string;
  belowMinimum: string;
  belowMinimumOptions: ReadonlyArray<{ value: string; label: string }>;
  reset: string;
  /** Discrete single-column text filters (moysklad «Фильтр» panel). Each renders
   *  only when its label is supplied → existing callers are unaffected. Wired to
   *  the /products params the list endpoint already accepts (description / article
   *  / code / externalCode). */
  description?: string;
  article?: string;
  code?: string;
  externalCode?: string;
  /** «Поставщик» — supplier filter (a counterparty picker → supplierId param). */
  supplier?: string;
  supplierPlaceholder?: string;
  /** Stock-based filters (moysklad «Выбор товара» Фильтр, live-grounded). «Остаток»
   *  (on-hand sign) + «Доступно» (display available) are dropdowns; «Только с
   *  резервом» / «Только с ожиданием» are Нет/Да toggles. Each renders only when
   *  its label is supplied; wired to stockFilter / availableFilter / hasReserve /
   *  hasIncoming on the /products query. */
  stock?: string;
  stockOptions?: ReadonlyArray<{ value: string; label: string }>;
  available?: string;
  availableOptions?: ReadonlyArray<{ value: string; label: string }>;
  onlyReserve?: string;
  onlyIncoming?: string;
  /** Нет/Да options for the two «Только с …» toggles ('' = off, 'true' = only). */
  toggleOptions?: ReadonlyArray<{ value: string; label: string }>;
  /** «Весовой товар» — '' = all, 'false' = Нет, 'true' = Да (→ weighed param). */
  weighed?: string;
  weighedOptions?: ReadonlyArray<{ value: string; label: string }>;
  /** Full Tovary-list-parity filters (analog picker). Each renders only when its
   *  label is supplied → quantity-mode callers are unaffected. Wired to the
   *  /products params the list endpoint already accepts. */
  mxik?: string; // → mxikCode (contains)
  tasnif?: string; // → packTasnifCode (contains)
  ownerEmployee?: string; // → ownerId (CSV, multi)
  ownerGroup?: string; // → groupId (CSV, multi)
  modifiedBy?: string; // → modifiedById (single)
  shared?: string; // → shared (boolean)
  sharedOptions?: ReadonlyArray<{ value: string; label: string }>;
  updatedPeriod?: string; // → updatedFrom / updatedTo (date range)
}

export interface ProductSelectModalLabels {
  title: string;
  /** «Создать» — opens the product-create form (moysklad modal toolbar). */
  create?: string;
  /** «Фильтр» panel labels (moysklad modal toolbar). Hidden when omitted. */
  filter?: ProductSelectFilterLabels;
  searchPlaceholder: string;
  /** aria-label for the 🔄 refresh button. */
  refresh: string;
  /** aria-label for the price-column ⚙ customizer. */
  priceColumns: string;
  colName: string;
  colQty: string;
  colOnHand: string;
  colReserved: string;
  colInTransit: string;
  colAvailable: string;
  colCode: string;
  colArticle: string;
  colUom: string;
  /** Columns shown ONLY in selection mode (analog picker mirrors the full Tovary
   *  list page): Тип · … · Страна · Вес · Описание · Мин.цена · Розн.цена.
   *  Optional so quantity-mode callers can omit them. */
  colImage?: string;
  colKind?: string;
  colCountry?: string;
  colWeight?: string;
  colDescription?: string;
  colMinPrice?: string;
  colRetailPrice?: string;
  /** Fallback single price column header (used only when the account has no
   *  price types — otherwise the price-type names are the column headers). */
  colPrice: string;
  select: string;
  cancel: string;
  close: string;
  empty: string;
  loading: string;
}

export interface ProductSelectModalProps {
  open: boolean;
  onClose: () => void;
  /** Document currency — used to format the fallback price column. */
  currency: string;
  labels: ProductSelectModalLabels;
  /** Fires once with every row the user gave a quantity > 0. */
  onConfirm: (rows: Array<{ product: ProductSelectRow; quantity: string }>) => void;
  /** «Создать» button handler (opens product-create). Hidden when omitted. */
  onCreate?: () => void;
  /**
   * Selection-only mode (moysklad «Выбор товара» as an analog/reference picker):
   * the Кол-во column becomes a row checkbox, the price column(s) are replaced by
   * «Страна»/«Вес», and «Выбрать» fires `onConfirmSelection` with the checked
   * products (no quantities). `onConfirm` is NOT used in this mode.
   */
  selectionMode?: boolean;
  onConfirmSelection?: (products: ProductSelectRow[]) => void;
  /** Ids already linked — rendered checked + disabled so they can't be re-added. */
  disabledIds?: string[];
  /** Extra control(s) rendered in the header next to the search — e.g. the
   *  cell «Scan» button (owner 2026-07-19). Callers own look and handlers. */
  headerAction?: React.ReactNode;
}

type SortCol = 'name' | 'code';

/** ru-RU grouped quantity (mirrors the assortment list / stock-balance report). */
function fmtQty(minor: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

function defaultPriceMinor(p: ProductSelectRow): string {
  return resolveDefaultSalePriceOrZero(p.salePrices);
}

function priceMinorFor(p: ProductSelectRow, pt: PriceTypeRow): string {
  const sp = p.salePrices ?? [];
  // salePrices store the default tier under the legacy "default" alias rather
  // than the default price-type UUID — resolve both so the default column fills.
  const hit =
    sp.find((x) => x.priceTypeId === pt.id) ??
    (pt.isDefault ? sp.find((x) => x.priceTypeId === 'default') : undefined);
  return hit?.value ?? '0';
}

export function ProductSelectModal({
  open,
  onClose,
  currency,
  labels,
  onConfirm,
  onCreate,
  selectionMode,
  onConfirmSelection,
  disabledIds,
  headerAction,
}: ProductSelectModalProps) {
  const [search, setSearch] = useState('');
  // Folder sidebar collapse (owner 2026-07-20): open on desktop, CLOSED on
  // phones (there it overlays the grid when opened).
  const tFolders = useTranslations('product_select');
  const [treeOpen, setTreeOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setTreeOpen(false);
    }
  }, []);
  const [folderId, setFolderId] = useState<string | null>(null);
  // Selection-mode: ids the user has checked (no quantities). Already-linked
  // ids (disabledIds) are treated as permanently checked + disabled.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Selected row OBJECTS, accumulated ACROSS pages — `items` only holds the
  // current page, so confirm() can't rebuild the chosen products from it once
  // pagination is on. This Map carries off-page selections too.
  const [selectedRows, setSelectedRows] = useState<Map<string, ProductSelectRow>>(new Map());
  const lockedIds = useMemo(() => new Set(disabledIds ?? []), [disabledIds]);
  // Apply a new selected-id set: keep `selected` for the checkboxes AND refresh
  // `selectedRows` (preserve off-page picks via the previous map, resolve new
  // current-page picks from `items`).
  const applySelection = (next: Set<string>) => {
    setSelected(next);
    setSelectedRows((prev) => {
      const m = new Map<string, ProductSelectRow>();
      for (const id of next) {
        const row = prev.get(id) ?? items.find((p) => p.id === id);
        if (row) m.set(id, row);
      }
      return m;
    });
  };
  const toggleSelected = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    applySelection(next);
  };
  const [qty, setQty] = useState<Record<string, string>>({});
  const debouncedSearch = useDebounce(search, 250);
  // «Фильтр» panel state (moysklad parity) — the product filter (kind / show /
  // barcode / below-minimum), wired into the same /products query.
  const [showFilter, setShowFilter] = useState(false);
  const [kind, setKind] = useState('');
  const [archived, setArchived] = useState('active');
  const [barcode, setBarcode] = useState('');
  const [belowMinimum, setBelowMinimum] = useState('');
  const debouncedBarcode = useDebounce(barcode, 250);
  // Discrete single-column text filters (moysklad «Фильтр» panel) + «Поставщик».
  const [description, setDescription] = useState('');
  const [article, setArticle] = useState('');
  const [code, setCode] = useState('');
  const [externalCode, setExternalCode] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState('');
  const debouncedDescription = useDebounce(description, 250);
  const debouncedArticle = useDebounce(article, 250);
  const debouncedCode = useDebounce(code, 250);
  const debouncedExternalCode = useDebounce(externalCode, 250);
  // Stock-based filters (moysklad «Выбор товара» Фильтр). 'any' = no filter.
  const [stock, setStock] = useState('any');
  const [available, setAvailable] = useState('any');
  const [onlyReserve, setOnlyReserve] = useState(''); // '' = off, 'true' = only-with-reserve
  const [onlyIncoming, setOnlyIncoming] = useState('');
  const [weighed, setWeighed] = useState(''); // '' = all, 'false' / 'true'
  // Full Tovary-list-parity filters (analog picker): ИКПУ · Код упаковки ТАСНИф ·
  // Владелец-сотрудник · Владелец-отдел · Кто изменил · Общий доступ · Когда изменен.
  const [mxik, setMxik] = useState('');
  const [tasnif, setTasnif] = useState('');
  const [owners, setOwners] = useState<Array<{ id: string; label: string }>>([]);
  const [ownerGroups, setOwnerGroups] = useState<Array<{ id: string; label: string }>>([]);
  const [modifiedById, setModifiedById] = useState<string | null>(null);
  const [modifiedByLabel, setModifiedByLabel] = useState('');
  const [shared, setShared] = useState(''); // '' = all, 'true' / 'false'
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const debouncedMxik = useDebounce(mxik, 250);
  const debouncedTasnif = useDebounce(tasnif, 250);
  const filterActive = !!(
    kind ||
    archived !== 'active' ||
    barcode ||
    belowMinimum ||
    description ||
    article ||
    code ||
    externalCode ||
    supplierId ||
    stock !== 'any' ||
    available !== 'any' ||
    onlyReserve === 'true' ||
    onlyIncoming === 'true' ||
    weighed ||
    mxik ||
    tasnif ||
    owners.length > 0 ||
    ownerGroups.length > 0 ||
    modifiedById ||
    shared ||
    updatedFrom ||
    updatedTo
  );
  // Column sort (server-side) — defaults to «Наименование ▲» like moysklad.
  const [sortBy, setSortBy] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Pagination (moysklad list parity «1-100 из N» + ‹ ›). 100/page like the list.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);
  // Price-column visibility. `null` = the default (only the account's default
  // price type shown — robust when an account has many price types); once the
  // user touches the ⚙ it holds an explicit {id→shown} map.
  const [priceShown, setPriceShown] = useState<Record<string, boolean> | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<ProductListResponse>({
    queryKey: [
      'product-select',
      debouncedSearch,
      folderId,
      kind,
      archived,
      debouncedBarcode,
      belowMinimum,
      debouncedDescription,
      debouncedArticle,
      debouncedCode,
      debouncedExternalCode,
      supplierId,
      stock,
      available,
      onlyReserve,
      onlyIncoming,
      weighed,
      debouncedMxik,
      debouncedTasnif,
      owners.map((o) => o.id).join(','),
      ownerGroups.map((g) => g.id).join(','),
      modifiedById,
      shared,
      updatedFrom,
      updatedTo,
      sortBy,
      sortDir,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), sortBy, sortDir });
      // Pagination only in selection mode (analog picker). Quantity-mode doc
      // pickers keep the legacy first-100 behaviour so a typed-qty row isn't lost
      // by paging away (their qty state is page-scoped).
      if (selectionMode) params.set('page', String(page));
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (folderId) params.set('productFolderId', folderId);
      if (kind) params.set('kind', kind);
      if (archived !== 'active') params.set('archived', archived);
      if (debouncedBarcode.trim()) params.set('barcode', debouncedBarcode.trim());
      if (belowMinimum) params.set('belowMinimum', belowMinimum);
      if (debouncedDescription.trim()) params.set('description', debouncedDescription.trim());
      if (debouncedArticle.trim()) params.set('article', debouncedArticle.trim());
      if (debouncedCode.trim()) params.set('code', debouncedCode.trim());
      if (debouncedExternalCode.trim()) params.set('externalCode', debouncedExternalCode.trim());
      if (supplierId) params.set('supplierId', supplierId);
      if (stock !== 'any') params.set('stockFilter', stock);
      if (available !== 'any') params.set('availableFilter', available);
      if (onlyReserve === 'true') params.set('hasReserve', 'true');
      if (onlyIncoming === 'true') params.set('hasIncoming', 'true');
      if (weighed) params.set('weighed', weighed);
      if (debouncedMxik.trim()) params.set('mxikCode', debouncedMxik.trim());
      if (debouncedTasnif.trim()) params.set('packTasnifCode', debouncedTasnif.trim());
      if (owners.length > 0) params.set('ownerId', owners.map((o) => o.id).join(','));
      if (ownerGroups.length > 0) params.set('groupId', ownerGroups.map((g) => g.id).join(','));
      if (modifiedById) params.set('modifiedById', modifiedById);
      if (shared) params.set('shared', shared);
      if (updatedFrom) params.set('updatedFrom', updatedFrom);
      if (updatedTo) params.set('updatedTo', updatedTo);
      return api.get<ProductListResponse>(`/products?${params.toString()}`);
    },
    enabled: open,
  });

  // The account's price types become the modal's price columns (moysklad shows
  // «Розничная цена», «Оптовая цена», … as separate columns with a ⚙).
  const { data: priceTypeData } = useQuery<PriceTypeListResponse>({
    queryKey: ['product-select-price-types'],
    queryFn: () => api.get<PriceTypeListResponse>('/price-types?limit=50'),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const priceTypes = useMemo(
    () => [...(priceTypeData?.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [priceTypeData],
  );
  const usePriceTypeCols = priceTypes.length > 0;
  const hasDefaultType = priceTypes.some((pt) => pt.isDefault);
  // Default-visible = the account's default price type (or the first one when
  // none is flagged default); the ⚙ lets the user reveal the rest. This stays
  // sane even when an account has many price types.
  const isShown = (pt: PriceTypeRow): boolean =>
    priceShown
      ? priceShown[pt.id] !== false
      : hasDefaultType
        ? pt.isDefault
        : priceTypes[0]?.id === pt.id;
  const visiblePriceTypes = priceTypes.filter(isShown);
  const priceVisibleMap = Object.fromEntries(priceTypes.map((pt) => [pt.id, isShown(pt)]));
  const togglePrice = (key: string, next: boolean) =>
    setPriceShown((prev) => {
      const base = prev ?? Object.fromEntries(priceTypes.map((pt) => [pt.id, isShown(pt)]));
      return { ...base, [key]: next };
    });
  const priceColCount = usePriceTypeCols ? Math.max(visiblePriceTypes.length, 1) : 1;
  // Selection mode mirrors the full Tovary list page → 11 columns: checkbox · Тип ·
  // Наименование · Код · Артикул · Ед.изм · Страна · Вес · Описание · Мин.цена ·
  // Розн.цена. Quantity mode = 10 fixed (thumb…uom) + the price column(s).
  const colCount = selectionMode ? 11 : 10 + priceColCount;

  // «Тип» value → label, resolved from the caller's filter kindOptions (Товар/
  // Услуга/Комплект); falls back to the raw kind when the filter isn't supplied.
  const kindLabelMap = useMemo(
    () => Object.fromEntries((labels.filter?.kindOptions ?? []).map((o) => [o.value, o.label])),
    [labels.filter?.kindOptions],
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Any result-set-defining input change resets to page 1 (moysklad list parity).
  const filterSig = JSON.stringify([
    debouncedSearch,
    folderId,
    kind,
    archived,
    debouncedBarcode,
    belowMinimum,
    debouncedDescription,
    debouncedArticle,
    debouncedCode,
    debouncedExternalCode,
    supplierId,
    stock,
    available,
    onlyReserve,
    onlyIncoming,
    weighed,
    debouncedMxik,
    debouncedTasnif,
    owners.map((o) => o.id),
    ownerGroups.map((g) => g.id),
    modifiedById,
    shared,
    updatedFrom,
    updatedTo,
    sortBy,
    sortDir,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the filter signature, NOT on `page` (which this sets).
  useEffect(() => {
    setPage(1);
  }, [filterSig]);

  // ── Selection mode renders the full Tovary list grid via the shared DataTable
  // so it inherits column-resize handles + the ⚙ column-settings + the exact list
  // styling. Persisted per-user under the 'product-analog-picker' key. ──
  const analogCols = useColumnVisibility('product-analog-picker', [
    'image',
    'kind',
    'name',
    'code',
    'article',
    'uom',
    'country',
    'weightG',
    'description',
    'minPrice',
    'retailPrice',
  ]);
  const analogWidths = useColumnWidths('product-analog-picker');
  const selectionColumns = useMemo<DataTableColumn<ProductSelectRow>[]>(
    () => [
      {
        // «Изображение» — thumbnail (empty grid header; the ⚙ shows colImage). First
        // column, matching the Tovary list.
        key: 'image',
        header: '',
        cell: (p) =>
          p.mainImageId ? (
            // eslint-disable-next-line @next/next/no-img-element -- raw API byte stream, not a static asset
            <img
              src={imageRawUrl(p.mainImageId)}
              alt=""
              loading="lazy"
              className="h-7 w-7 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-subtle)] object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
              <ImageIcon className="h-3.5 w-3.5" />
            </div>
          ),
        width: '46px',
      },
      {
        key: 'kind',
        header: labels.colKind ?? '',
        cell: (p) => kindLabelMap[p.kind ?? 'product'] ?? p.kind ?? '',
        width: '90px',
      },
      { key: 'name', header: labels.colName, cell: (p) => p.name, sortable: true, width: '260px' },
      {
        key: 'code',
        header: labels.colCode,
        cell: (p) => p.code ?? '',
        sortable: true,
        width: '110px',
      },
      { key: 'article', header: labels.colArticle, cell: (p) => p.article ?? '', width: '110px' },
      { key: 'uom', header: labels.colUom, cell: (p) => p.uom ?? '', width: '70px' },
      {
        key: 'country',
        header: labels.colCountry ?? '',
        cell: (p) => p.country ?? '',
        width: '90px',
      },
      {
        key: 'weightG',
        header: labels.colWeight ?? '',
        cell: (p) => p.weightG ?? 0,
        align: 'right',
        width: '70px',
      },
      {
        key: 'description',
        header: labels.colDescription ?? '',
        cell: (p) => p.description ?? '',
        width: '220px',
      },
      {
        key: 'minPrice',
        header: labels.colMinPrice ?? '',
        cell: (p) => formatMoney(p.minPrice ?? '0', currency),
        align: 'right',
        width: '130px',
      },
      {
        key: 'retailPrice',
        header: labels.colRetailPrice ?? '',
        cell: (p) => formatMoney(defaultPriceMinor(p), currency),
        align: 'right',
        width: '130px',
      },
    ],
    [labels, kindLabelMap, currency],
  );

  const toggleSort = (col: SortCol) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const sortIcon = (col: SortCol) =>
    sortBy === col ? (
      sortDir === 'asc' ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )
    ) : null;

  // «Поставщик» picker — search the account's counterparties (same endpoint +
  // shape as the products/new supplier picker); the chosen id drives supplierId.
  const supplierFetcher = async (s: string): Promise<PickerItem[]> => {
    const d = await api.get<{
      items: Array<{ id: string; name: string; legalTitle?: string | null }>;
    }>(`/counterparties?search=${encodeURIComponent(s)}&limit=50`);
    return d.items.map((c) => ({
      id: c.id,
      primary: c.name,
      secondary: c.legalTitle ?? undefined,
    }));
  };

  // «Владелец-сотрудник» / «Кто изменил» — employee search (MultiCombobox owners
  // + the modifiedBy inline picker). Returns {value,label} / PickerItem shapes.
  const employeeOptions = async (q: string): Promise<Array<{ value: string; label: string }>> => {
    const r = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name }));
  };
  const employeeFetcher = async (q: string): Promise<PickerItem[]> => {
    const r = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/employees?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ id: x.id, primary: x.name }));
  };
  // «Владелец-отдел» — group (отдел) search for the MultiCombobox.
  const groupOptions = async (q: string): Promise<Array<{ value: string; label: string }>> => {
    const r = await api.get<{ items: Array<{ id: string; name: string }> }>(
      `/groups?search=${encodeURIComponent(q)}&limit=20`,
    );
    return r.items.map((x) => ({ value: x.id, label: x.name }));
  };

  const clearFilters = () => {
    setKind('');
    setArchived('active');
    setBarcode('');
    setBelowMinimum('');
    setDescription('');
    setArticle('');
    setCode('');
    setExternalCode('');
    setSupplierId(null);
    setSupplierLabel('');
    setStock('any');
    setAvailable('any');
    setOnlyReserve('');
    setOnlyIncoming('');
    setWeighed('');
    setMxik('');
    setTasnif('');
    setOwners([]);
    setOwnerGroups([]);
    setModifiedById(null);
    setModifiedByLabel('');
    setShared('');
    setUpdatedFrom('');
    setUpdatedTo('');
  };

  const reset = () => {
    setQty({});
    setSelected(new Set());
    setSelectedRows(new Map());
    setPage(1);
    setSearch('');
    setFolderId(null);
    clearFilters();
    setSortBy('name');
    setSortDir('asc');
    setPriceShown(null);
  };

  const confirm = () => {
    if (selectionMode) {
      // Return the checked rows from the cross-page accumulator (excluding the
      // already-linked locked ids).
      const chosen = [...selectedRows.values()].filter((p) => !lockedIds.has(p.id));
      if (chosen.length > 0) onConfirmSelection?.(chosen);
    } else {
      const rows = items
        .filter((p) => Number(qty[p.id]) > 0)
        .map((p) => ({ product: p, quantity: qty[p.id] ?? '0' }));
      if (rows.length > 0) onConfirm(rows);
    }
    reset();
    onClose();
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[400] bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content
          data-test-id="product-select-modal"
          // Mobile (owner 2026-07-20): the picker takes the WHOLE screen —
          // a centered 92vh card left unusable slivers on a phone.
          className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-[400] flex h-[92vh] w-[min(1480px,98vw)] flex-col rounded-[var(--ms-radius-md)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)] max-md:top-0 max-md:left-0 max-md:h-dvh max-md:w-screen max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none"
        >
          <header className="flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-b px-4 py-2.5 max-md:px-2">
            <Dialog.Title className="shrink-0 font-semibold text-base">{labels.title}</Dialog.Title>
            {/* moysklad modal toolbar order: 🔄 · Создать · Фильтр · search · ✕ */}
            <button
              type="button"
              onClick={() => refetch()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-primary)]"
              aria-label={labels.refresh}
              title={labels.refresh}
              data-test-id="product-select-refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
            {/* moysklad modal toolbar: «Создать» (new product) next to the title. */}
            {onCreate && labels.create && (
              <button
                type="button"
                onClick={onCreate}
                className="shrink-0 rounded-[var(--ms-radius-default)] border border-[var(--ms-action-success-border)] bg-gradient-to-b from-[var(--ms-success-100)] to-[var(--ms-action-success-border)] px-3 py-1 font-medium text-[12px] text-white hover:brightness-95"
                data-test-id="product-select-create"
              >
                {labels.create}
              </button>
            )}
            {/* moysklad modal toolbar: «Фильтр» toggle (opens the product filter). */}
            {labels.filter && (
              <button
                type="button"
                onClick={() => setShowFilter((v) => !v)}
                aria-pressed={showFilter}
                className={cn(
                  'shrink-0 rounded-[var(--ms-radius-default)] border px-3 py-1 font-medium text-[12px]',
                  showFilter || filterActive
                    ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                    : 'border-[var(--ms-border-strong)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
                )}
                data-test-id="product-select-filter-toggle"
              >
                {labels.filter.toggle}
              </button>
            )}
            {/* Owner 2026-07-20: the folder sidebar collapses/expands — the
                chevron lives next to the search so it reads as a layout toggle. */}
            <button
              type="button"
              onClick={() => setTreeOpen((v) => !v)}
              aria-expanded={treeOpen}
              aria-label={tFolders('folders_toggle')}
              title={tFolders('folders_toggle')}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] border text-[13px] max-md:h-9 max-md:w-9',
                treeOpen
                  ? 'border-[var(--ms-border-focus)] bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                  : 'border-[var(--ms-border-strong)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]',
              )}
              data-test-id="product-select-tree-toggle"
            >
              ☰
            </button>
            <div className="ml-1 max-w-md flex-1 max-md:order-last max-md:ml-0 max-md:basis-full">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={labels.searchPlaceholder}
                data-test-id="product-select-search"
              />
            </div>
            {/* Top-right corner, just before the ✕ (owner 2026-07-20). */}
            <div className="ml-auto flex items-center gap-2">
              {headerAction}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                  aria-label={labels.close}
                  data-test-id="product-select-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
          </header>

          {/* «Фильтр» panel — the product filter (kind / show / barcode /
              below-minimum), wired into the same /products query. moysklad shows
              this as a collapsible panel under the modal toolbar. */}
          {labels.filter && showFilter && (
            <div
              className="flex flex-wrap items-end gap-4 border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] px-4 py-3 text-[12px]"
              data-test-id="product-select-filter-panel"
            >
              {/* Field ORDER mirrors the Tovary list page 1:1 (live-grounded
                  2026-06-24): Описание · Артикул · Код · Внешний код · ИКПУ ·
                  Код упаковки ТАСНИф · Штрихкод · Весовой товар · Тип ·
                  Показывать · Поставщик · Владелец-сотрудник · Владелец-отдел ·
                  Общий доступ · Когда изменен · Кто изменил. The «Выбор товара»
                  stock filters (not on the list) trail at the END for the
                  quantity-mode document pickers that still pass them. Each field
                  renders only when its label is supplied. */}
              {labels.filter.description && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.description}</span>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    data-test-id="product-select-filter-description"
                  />
                </label>
              )}
              {labels.filter.article && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.article}</span>
                  <Input
                    value={article}
                    onChange={(e) => setArticle(e.target.value)}
                    data-test-id="product-select-filter-article"
                  />
                </label>
              )}
              {labels.filter.code && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.code}</span>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    data-test-id="product-select-filter-code"
                  />
                </label>
              )}
              {labels.filter.externalCode && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.externalCode}</span>
                  <Input
                    value={externalCode}
                    onChange={(e) => setExternalCode(e.target.value)}
                    data-test-id="product-select-filter-external-code"
                  />
                </label>
              )}
              {labels.filter.mxik && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.mxik}</span>
                  <Input
                    value={mxik}
                    onChange={(e) => setMxik(e.target.value)}
                    data-test-id="product-select-filter-mxik"
                  />
                </label>
              )}
              {labels.filter.tasnif && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.tasnif}</span>
                  <Input
                    value={tasnif}
                    onChange={(e) => setTasnif(e.target.value)}
                    data-test-id="product-select-filter-tasnif"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[var(--ms-text-muted)]">{labels.filter.barcode}</span>
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  data-test-id="product-select-filter-barcode"
                />
              </label>
              {labels.filter.weighed && labels.filter.weighedOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.weighed}</span>
                  <NativeSelect
                    value={weighed}
                    onChange={(e) => setWeighed(e.target.value)}
                    data-test-id="product-select-filter-weighed"
                  >
                    {labels.filter.weighedOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[var(--ms-text-muted)]">{labels.filter.kind}</span>
                <NativeSelect
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  data-test-id="product-select-filter-kind"
                >
                  {labels.filter.kindOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[var(--ms-text-muted)]">{labels.filter.show}</span>
                <NativeSelect
                  value={archived}
                  onChange={(e) => setArchived(e.target.value)}
                  data-test-id="product-select-filter-show"
                >
                  {labels.filter.showOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {labels.filter.supplier && (
                <div className="flex w-48 flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.supplier}</span>
                  <CatalogPickerField
                    value={supplierId ? { id: supplierId, label: supplierLabel } : null}
                    placeholder={labels.filter.supplierPlaceholder}
                    onPick={() => undefined}
                    onClear={() => {
                      setSupplierId(null);
                      setSupplierLabel('');
                    }}
                    inlineFetcher={supplierFetcher}
                    onInlineSelect={(item) => {
                      setSupplierId(item.id);
                      setSupplierLabel(String(item.primary));
                    }}
                    testId="product-select-filter-supplier"
                  />
                </div>
              )}
              {labels.filter.ownerEmployee && (
                <div className="flex w-48 flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.ownerEmployee}</span>
                  <MultiCombobox
                    value={owners.map((o) => o.id)}
                    items={owners.map((o) => ({ value: o.id, label: o.label }))}
                    onSearch={employeeOptions}
                    onChange={(nextIds, toggled) =>
                      setOwners((prev) =>
                        nextIds.map((id) => {
                          const ex = prev.find((o) => o.id === id);
                          if (ex) return ex;
                          if (toggled?.value === id) return { id, label: String(toggled.label) };
                          return { id, label: id };
                        }),
                      )
                    }
                    placeholder=""
                    testId="product-select-filter-owner"
                  />
                </div>
              )}
              {labels.filter.ownerGroup && (
                <div className="flex w-48 flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.ownerGroup}</span>
                  <MultiCombobox
                    value={ownerGroups.map((g) => g.id)}
                    items={ownerGroups.map((g) => ({ value: g.id, label: g.label }))}
                    onSearch={groupOptions}
                    onChange={(nextIds, toggled) =>
                      setOwnerGroups((prev) =>
                        nextIds.map((id) => {
                          const ex = prev.find((g) => g.id === id);
                          if (ex) return ex;
                          if (toggled?.value === id) return { id, label: String(toggled.label) };
                          return { id, label: id };
                        }),
                      )
                    }
                    placeholder=""
                    testId="product-select-filter-group"
                  />
                </div>
              )}
              {labels.filter.shared && labels.filter.sharedOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.shared}</span>
                  <NativeSelect
                    value={shared}
                    onChange={(e) => setShared(e.target.value)}
                    data-test-id="product-select-filter-shared"
                  >
                    {labels.filter.sharedOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {labels.filter.updatedPeriod && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.updatedPeriod}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={updatedFrom}
                      onChange={(e) => setUpdatedFrom(e.target.value)}
                      className="h-[var(--ms-control-h)] border border-[var(--ms-border-input)] px-1 text-[12px]"
                      data-test-id="product-select-filter-updated-from"
                    />
                    <span className="text-[var(--ms-text-muted)]">—</span>
                    <input
                      type="date"
                      value={updatedTo}
                      onChange={(e) => setUpdatedTo(e.target.value)}
                      className="h-[var(--ms-control-h)] border border-[var(--ms-border-input)] px-1 text-[12px]"
                      data-test-id="product-select-filter-updated-to"
                    />
                  </div>
                </label>
              )}
              {labels.filter.modifiedBy && (
                <div className="flex w-48 flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.modifiedBy}</span>
                  <CatalogPickerField
                    value={modifiedById ? { id: modifiedById, label: modifiedByLabel } : null}
                    onPick={() => undefined}
                    onClear={() => {
                      setModifiedById(null);
                      setModifiedByLabel('');
                    }}
                    inlineFetcher={employeeFetcher}
                    onInlineSelect={(item) => {
                      setModifiedById(item.id);
                      setModifiedByLabel(String(item.primary));
                    }}
                    testId="product-select-filter-modified-by"
                  />
                </div>
              )}
              {/* «Выбор товара» stock filters (NOT on the Tovary list) — trail at
                  the end; only the quantity-mode document pickers pass them. */}
              {labels.filter.belowMinimum && labels.filter.belowMinimumOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.belowMinimum}</span>
                  <NativeSelect
                    value={belowMinimum}
                    onChange={(e) => setBelowMinimum(e.target.value)}
                    data-test-id="product-select-filter-below-min"
                  >
                    {labels.filter.belowMinimumOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {labels.filter.stock && labels.filter.stockOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.stock}</span>
                  <NativeSelect
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    data-test-id="product-select-filter-stock"
                  >
                    {labels.filter.stockOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {labels.filter.available && labels.filter.availableOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.available}</span>
                  <NativeSelect
                    value={available}
                    onChange={(e) => setAvailable(e.target.value)}
                    data-test-id="product-select-filter-available"
                  >
                    {labels.filter.availableOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {labels.filter.onlyReserve && labels.filter.toggleOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.onlyReserve}</span>
                  <NativeSelect
                    value={onlyReserve}
                    onChange={(e) => setOnlyReserve(e.target.value)}
                    data-test-id="product-select-filter-only-reserve"
                  >
                    {labels.filter.toggleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {labels.filter.onlyIncoming && labels.filter.toggleOptions && (
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--ms-text-muted)]">{labels.filter.onlyIncoming}</span>
                  <NativeSelect
                    value={onlyIncoming}
                    onChange={(e) => setOnlyIncoming(e.target.value)}
                    data-test-id="product-select-filter-only-incoming"
                  >
                    {labels.filter.toggleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {filterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="pb-1.5 text-[var(--ms-text-brand)] hover:underline"
                  data-test-id="product-select-filter-reset"
                >
                  {labels.filter.reset}
                </button>
              )}
            </div>
          )}

          <div className="relative flex min-h-0 flex-1">
            {/* Collapsible; with dividers (owner 2026-07-20). On phones it
                OVERLAYS the grid instead of squeezing it. */}
            {treeOpen && (
              <ProductFolderTree
                selectedId={folderId}
                onSelect={(id) => {
                  setFolderId(id);
                  // Phone overlay: picking a folder closes the panel.
                  if (window.matchMedia('(max-width: 767px)').matches) setTreeOpen(false);
                }}
                dividers
                className="max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-64 max-md:shadow-[var(--ms-shadow-lg)]"
              />
            )}

            {selectionMode ? (
              // Selection mode = the full Tovary list grid via the shared DataTable
              // (column-resize + ⚙ column-settings + exact list styling for free).
              <DataTable<ProductSelectRow>
                columns={selectionColumns}
                rows={items}
                keyField="id"
                selectable
                selectedIds={selected}
                onSelectionChange={applySelection}
                canSelect={(p) => !lockedIds.has(p.id)}
                onRowClick={(p) => {
                  if (!lockedIds.has(p.id)) toggleSelected(p.id);
                }}
                rowTestId={(p) => `product-select-row-${p.id}`}
                visibleColumnKeys={analogCols.visibleKeys}
                columnWidths={analogWidths.values}
                onColumnResize={analogWidths.set}
                sortKey={sortBy}
                sortDir={sortDir}
                onSortChange={(key, dir) => {
                  setSortBy(key as SortCol);
                  setSortDir(dir);
                }}
                loading={isLoading}
                empty={
                  <div className="px-3 py-8 text-center text-[var(--ms-text-muted)]">
                    {labels.empty}
                  </div>
                }
                headerEndSlot={
                  <ColumnSettings
                    columns={selectionColumns.map((c) => ({
                      key: c.key,
                      // the image column has an empty grid header; show «Изображение»
                      // in the ⚙ list (moysklad parity).
                      label:
                        c.key === 'image'
                          ? (labels.colImage ?? c.key)
                          : typeof c.header === 'string'
                            ? c.header
                            : c.key,
                    }))}
                    visibleKeys={analogCols.visibleKeys}
                    onChange={analogCols.setVisibleKeys}
                    onReset={analogCols.reset}
                  />
                }
                fillHeight
                // min-w-0: a flex child's default min-width is its CONTENT width —
                // without this the wide grid pushed the row past the dialog edge
                // (owner 2026-07-20: columns visually escaped the modal). Bounded,
                // the DataTable scrolls horizontally inside itself instead.
                className="min-h-0 min-w-0 flex-1 rounded-none border-0 border-l"
              />
            ) : (
              <div className="min-w-0 flex-1 overflow-auto">
                {/* `min-w-full` + `whitespace-nowrap` (inherited by every cell): the
                table fills the panel but GROWS past it when the columns don't
                fit — the parent's overflow-auto then gives a horizontal scrollbar
                (moysklad parity), so a header/cell never wraps to a 2nd line. */}
                <table className="min-w-full border-collapse whitespace-nowrap text-[11px]">
                  <thead className="sticky top-0 z-10 bg-[var(--ms-bg-muted)]">
                    {selectionMode ? (
                      // Selection mode mirrors the full Tovary list page columns.
                      <tr className="border-[var(--ms-border-default)] border-b text-[var(--ms-text-brand)]">
                        <th className="w-10 px-2 py-1.5" aria-hidden />
                        <th className="w-20 px-2 py-1.5 text-left font-normal">{labels.colKind}</th>
                        <th className="px-3 py-1.5 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-1 hover:text-[var(--ms-text-primary)]"
                            data-test-id="product-select-sort-name"
                          >
                            {labels.colName}
                            {sortIcon('name')}
                          </button>
                        </th>
                        <th className="w-24 px-2 py-1.5 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => toggleSort('code')}
                            className="inline-flex items-center gap-1 hover:text-[var(--ms-text-primary)]"
                            data-test-id="product-select-sort-code"
                          >
                            {labels.colCode}
                            {sortIcon('code')}
                          </button>
                        </th>
                        <th className="w-24 px-2 py-1.5 text-left font-normal">
                          {labels.colArticle}
                        </th>
                        <th className="w-16 px-2 py-1.5 text-left font-normal">{labels.colUom}</th>
                        <th className="w-20 px-2 py-1.5 text-left font-normal">
                          {labels.colCountry}
                        </th>
                        <th className="w-16 px-2 py-1.5 text-right font-normal">
                          {labels.colWeight}
                        </th>
                        <th className="w-44 px-2 py-1.5 text-left font-normal">
                          {labels.colDescription}
                        </th>
                        <th className="w-28 px-3 py-1.5 text-right font-normal">
                          {labels.colMinPrice}
                        </th>
                        <th className="w-28 px-3 py-1.5 text-right font-normal">
                          {labels.colRetailPrice}
                        </th>
                      </tr>
                    ) : (
                      <tr className="border-[var(--ms-border-default)] border-b text-[var(--ms-text-brand)]">
                        <th className="w-10 px-2 py-1.5" aria-hidden />
                        <th className="px-3 py-1.5 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-1 hover:text-[var(--ms-text-primary)]"
                            data-test-id="product-select-sort-name"
                          >
                            {labels.colName}
                            {sortIcon('name')}
                          </button>
                        </th>
                        <th className="w-24 px-2 py-1.5 text-right font-normal">{labels.colQty}</th>
                        <th className="w-20 px-2 py-1.5 text-right font-normal">
                          {labels.colOnHand}
                        </th>
                        <th className="w-20 px-2 py-1.5 text-right font-normal">
                          {labels.colReserved}
                        </th>
                        <th className="w-20 px-2 py-1.5 text-right font-normal">
                          {labels.colInTransit}
                        </th>
                        <th className="w-20 px-2 py-1.5 text-right font-normal">
                          {labels.colAvailable}
                        </th>
                        <th className="w-24 px-2 py-1.5 text-left font-normal">
                          <button
                            type="button"
                            onClick={() => toggleSort('code')}
                            className="inline-flex items-center gap-1 hover:text-[var(--ms-text-primary)]"
                            data-test-id="product-select-sort-code"
                          >
                            {labels.colCode}
                            {sortIcon('code')}
                          </button>
                        </th>
                        <th className="w-24 px-2 py-1.5 text-left font-normal">
                          {labels.colArticle}
                        </th>
                        <th className="w-16 px-2 py-1.5 text-left font-normal">{labels.colUom}</th>
                        {usePriceTypeCols ? (
                          visiblePriceTypes.length > 0 ? (
                            visiblePriceTypes.map((pt, i) => (
                              <th
                                key={pt.id}
                                className="w-28 px-3 py-1.5 text-right font-normal"
                                data-test-id={`product-select-price-col-${pt.id}`}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <span className="truncate">{pt.name}</span>
                                  {i === visiblePriceTypes.length - 1 && (
                                    <PositionColumnCustomizer
                                      ariaLabel={labels.priceColumns}
                                      options={priceTypes.map((p) => ({
                                        key: p.id,
                                        label: p.name,
                                      }))}
                                      visible={priceVisibleMap}
                                      onToggle={togglePrice}
                                    />
                                  )}
                                </span>
                              </th>
                            ))
                          ) : (
                            // all price columns hidden — keep a gear-only header cell
                            <th className="w-10 px-2 py-1.5 text-right font-normal">
                              <PositionColumnCustomizer
                                ariaLabel={labels.priceColumns}
                                options={priceTypes.map((p) => ({ key: p.id, label: p.name }))}
                                visible={priceVisibleMap}
                                onToggle={togglePrice}
                              />
                            </th>
                          )
                        ) : (
                          <th className="w-28 px-3 py-1.5 text-right font-normal">
                            {labels.colPrice}
                          </th>
                        )}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-3 py-8 text-center text-[var(--ms-text-muted)]"
                        >
                          {labels.loading}
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-3 py-8 text-center text-[var(--ms-text-muted)]"
                        >
                          {labels.empty}
                        </td>
                      </tr>
                    ) : (
                      items.map((p) =>
                        selectionMode ? (
                          // biome-ignore lint/a11y/useKeyWithClickEvents: row-click is a MOUSE convenience mirroring the row's <input type="checkbox"> (the keyboard control); a handler on a non-focusable <tr> would be dead code
                          <tr
                            key={p.id}
                            className={cn(
                              'border-[var(--ms-border-subtle)] border-b',
                              selected.has(p.id) || lockedIds.has(p.id)
                                ? 'bg-[var(--ms-bg-selected)]'
                                : 'hover:bg-[#fffb8c]',
                              !lockedIds.has(p.id) && 'cursor-pointer',
                            )}
                            onClick={!lockedIds.has(p.id) ? () => toggleSelected(p.id) : undefined}
                            data-test-id={`product-select-row-${p.id}`}
                          >
                            <td className="w-10 px-2 py-1 text-center">
                              <input
                                type="checkbox"
                                checked={selected.has(p.id) || lockedIds.has(p.id)}
                                disabled={lockedIds.has(p.id)}
                                onChange={() => toggleSelected(p.id)}
                                onClick={(e) => e.stopPropagation()}
                                data-test-id={`product-select-check-${p.id}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {kindLabelMap[p.kind ?? 'product'] ?? p.kind ?? ''}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="block max-w-[320px] truncate">{p.name}</span>
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.code ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.article ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.uom ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.country ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {p.weightG ?? 0}
                            </td>
                            <td className="max-w-[300px] truncate px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.description ?? ''}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {formatMoney(p.minPrice ?? '0', currency)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {formatMoney(defaultPriceMinor(p), currency)}
                            </td>
                          </tr>
                        ) : (
                          <tr
                            key={p.id}
                            className="border-[var(--ms-border-subtle)] border-b hover:bg-[#fffb8c]"
                            data-test-id={`product-select-row-${p.id}`}
                          >
                            <td className="w-10 px-2 py-1">
                              {p.mainImageId ? (
                                // eslint-disable-next-line @next/next/no-img-element -- raw API byte stream, not a static asset (next/image can't proxy it)
                                <img
                                  src={imageRawUrl(p.mainImageId)}
                                  alt=""
                                  loading="lazy"
                                  className="h-7 w-7 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-subtle)] object-cover"
                                />
                              ) : (
                                <div className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
                                  <ImageIcon className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className="block max-w-[320px] truncate">{p.name}</span>
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={qty[p.id] ?? ''}
                                onChange={(e) => setQty((m) => ({ ...m, [p.id]: e.target.value }))}
                                className="h-6 w-20 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] px-1 text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-[var(--ms-text-brand)]"
                                data-test-id={`product-select-qty-${p.id}`}
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtQty(p.stock.onHand)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtQty(p.stock.reserved)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtQty(p.stock.inTransit)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmtQty(p.stock.available)}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.code ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.article ?? ''}
                            </td>
                            <td className="px-2 py-1.5 text-left text-[var(--ms-text-muted)]">
                              {p.uom ?? ''}
                            </td>
                            {usePriceTypeCols ? (
                              visiblePriceTypes.length > 0 ? (
                                visiblePriceTypes.map((pt) => (
                                  <td
                                    key={pt.id}
                                    className="px-3 py-1.5 text-right tabular-nums"
                                    data-test-id={`product-select-price-${pt.id}-${p.id}`}
                                  >
                                    {formatMoney(priceMinorFor(p, pt), pt.currency)}
                                  </td>
                                ))
                              ) : (
                                <td className="px-2 py-1.5" />
                              )
                            ) : (
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {formatMoney(defaultPriceMinor(p), currency)}
                              </td>
                            )}
                          </tr>
                        ),
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <footer className="flex items-center gap-2 border-[var(--ms-border-default)] border-t px-4 py-2.5">
            <Button type="button" onClick={confirm} data-test-id="product-select-confirm">
              {labels.select}
            </Button>
            <Button type="button" variant="secondary" onClick={close}>
              {labels.cancel}
            </Button>
            {/* moysklad list parity «1-100 из N» + ‹ › across the whole catalogue
              (folder tree + every filter narrow the paged result). */}
            <div className="ml-auto" data-test-id="product-select-pager">
              <Pagination
                moyskladStyle
                total={total}
                limit={PAGE_SIZE}
                offset={(page - 1) * PAGE_SIZE}
                visibleCount={items.length}
                hasPrevious={page > 1}
                hasNext={page < pageCount}
                onFirst={() => setPage(1)}
                onPrevious={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
                onLast={() => setPage(pageCount)}
              />
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
