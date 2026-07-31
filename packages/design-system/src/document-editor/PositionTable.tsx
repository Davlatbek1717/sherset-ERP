'use client';

import { computePositionTotal } from '@moysklad/money';
import * as React from 'react';
import { HIDE_NATIVE_X_SCROLLBAR, StickyXScrollbar } from '../data-display/StickyHScroll.tsx';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';
import { MoneyInput } from '../primitives/MoneyInput.tsx';

/**
 * Position table — line-item editor that sits in the middle of every
 * moysklad document. Mirrors the b-inlineeditor-table layout from the
 * original UI:
 *
 *   [☐] [#] [img] [name + picker] [qty] [unit] [base qty] [shipped]
 *   [available] [stock] [reserve] [waiting] [weight] [volume] [price]
 *   [vat%] [vat sum] [discount %] [amount] [⋮]
 *
 * Not every column is meaningful for every document type — Заказ has
 * shipped + waiting + reserve, Inventarisatsiya has surplus + shortage,
 * RetailSale has none of those. Pages opt in by passing an explicit
 * `columns` array; the component renders only those.
 *
 * Pages keep position state in their own `useState`. The component is
 * a controlled view + change handler — no internal mutation, easier to
 * test, and pages can save / revert without state drift between the
 * table and the page-level summary.
 */
export type PositionColumnKey =
  | 'dragarea' // drag handle for row reordering (HTML5 DnD)
  | 'select' // leading checkbox
  | 'index' // row number
  | 'image' // thumb
  | 'name' // product picker (always shown)
  | 'code' // «Код» — product code (read-only, gear-optional)
  | 'article' // «Артикул» — product SKU/article (read-only, gear-optional)
  | 'quantityInPacks' // pack count
  | 'goodPack' // pack unit dropdown
  | 'unit' // «Единица измерения» — base unit of measure (read-only)
  | 'quantity' // base unit count
  | 'shipped' // already shipped
  | 'available' // stock - reserve
  | 'stock' // total in store
  | 'reserve' // reserved by other docs
  | 'waiting' // expected via inbound docs
  | 'weight'
  | 'volume'
  | 'price'
  | 'vat'
  | 'vatAmount'
  | 'discount'
  | 'amount' // line total
  | 'commission' // «Комиссия» — per-line commission/reward (commission report «Выданный»), editable money
  | 'gtdNumber' // «Номер ГТД» — customs declaration no. (import inbound, §41)
  | 'gtdSumMinor' // «Сумма ГТД» / «Себестоимость ГТД» — customs sum (tiyin)
  | 'rnpt' // «РНПТ» — registration number of goods batch, free-text (Enter import grid)
  | 'marking' // «Маркировка» — Честный знак marking code(s), free-text entry (scan later)
  | 'country' // «Страна» — country of origin (Country picker, §41/§45)
  | 'cell' // «Ячейка» — warehouse bin/cell reference, free-text (Enter grid)
  | 'reason' // «Причина оприходования» — per-position free text (Enter, §enter)
  | 'costPerUnit' // «Себест. единицы» — unit cost, read-only (= price for an Enter)
  | 'costTotal' // «Себестоимость» — total cost, read-only (= amount for an Enter)
  | 'menu'; // row actions

export interface DocPositionRow {
  /** Stable id used as React key. */
  id: string;
  productLabel: string;
  productCode?: string;
  /** «Артикул» — product SKU. Read-only, shown only when the column is enabled. */
  productArticle?: string;
  productUom?: string | null;
  /** Product thumbnail URL (e.g. /api/v1/images/:id/raw). When the «image»
   *  column is shown, renders the thumbnail; falls back to the name initial. */
  imageUrl?: string;
  quantity: string;
  priceMinor: string;
  discount: string;
  vat: string;
  vatEnabled: boolean;
  /** Optional read-only fields shown for procurement/inventory contexts. */
  shipped?: string;
  /** Per-unit cost (tiyin). When set, the «Себест. единицы» (costPerUnit) column
   *  renders THIS instead of `priceMinor` — for docs where carrying cost ≠ price
   *  (sales-return / loss weighted-average). Falls back to `priceMinor` when unset
   *  (Enter/Supply, where cost = price), so existing callers are unaffected. */
  costMinor?: string;
  available?: string;
  stock?: string;
  reserve?: string;
  waiting?: string;
  weight?: string;
  volume?: string;
  /** Per-unit weight (grams) / volume (ml) from the product. When set, «Вес» /
   *  «Объём» render the LINE total (per-unit × Кол-во) — moysklad parity — instead
   *  of the pre-formatted `weight`/`volume` string. */
  weightG?: number;
  volumeML?: number;
  /** Customs block (import-inbound positions — Приёмка §41, Возврат §45). */
  gtdNumber?: string;
  gtdSumMinor?: string;
  countryId?: string | null;
  /** Resolved country name for read-only / picker-trigger display. */
  countryLabel?: string;
  /** «Причина оприходования» — per-position free text (Enter only). */
  reason?: string;
  /** «РНПТ» — registration number of goods batch, free-text (Enter import grid). */
  rnpt?: string;
  /** «Маркировка» — Честный знак marking code(s), free-text (scan entry is a later feature). */
  marking?: string;
  /** «Ячейка» — address-storage bin. `cellId` = picked StoreCell; `cell` = the
   *  denormalized «Зона / Ячейка» label shown in the trigger / read-only span. */
  cellId?: string | null;
  cell?: string;
  /** «Комиссия» — per-line commission/reward amount (tiyin/minor), commission-report
   *  «Выданный» positions only. Editable money column (mirrors «Цена»). */
  commissionMinor?: string;
}

export interface PositionTableColumnConfig {
  /** Column identifier — drives column ordering. */
  key: PositionColumnKey;
  /** Header text override; defaults to the moysklad-parity label. */
  label?: React.ReactNode;
  /** Pixel width override. */
  width?: string;
  /** Placeholder for free-text cells (e.g. «Ячейка» → «Не указана» when empty). */
  placeholder?: string;
}

export interface PositionTableProps {
  /** Ordered column list. The component renders only these. */
  columns: PositionTableColumnConfig[];
  rows: DocPositionRow[];
  onUpdate: (id: string, patch: Partial<DocPositionRow>) => void;
  onRemove: (id: string) => void;
  onAdd?: () => void;
  /**
   * Optional row duplication handler. When provided, the per-row
   * kebab menu adds a «Дублировать» entry that calls this — pages
   * typically clone the row data and append a new entry below.
   */
  onDuplicate?: (id: string) => void;
  /**
   * Optional row product-SWAP handler. When provided, the per-row kebab menu
   * adds a «Заменить» entry (moysklad order: Дублировать · Заменить · Удалить)
   * that calls this — pages open the product picker for that row to replace its
   * product. This is where swapping moves once the name becomes a card link.
   */
  onReplace?: (id: string) => void;
  /** Custom cell renderer for the «name» column — pages wire their own
   *  CatalogPicker / autocomplete here. */
  renderNameCell: (row: DocPositionRow) => React.ReactNode;
  /** Optional custom cell renderer for the «vat%» column — pages can
   *  swap the default plain input for a Picker. */
  renderVatCell?: (row: DocPositionRow) => React.ReactNode;
  /** Optional custom cell renderer for the «Страна» column — pages wire
   *  their own Country CatalogPicker here (mirrors renderNameCell). When
   *  omitted, the column falls back to a read-only `countryLabel` span. */
  renderCountryCell?: (row: DocPositionRow) => React.ReactNode;
  /** Optional custom cell renderer for the «Ячейка» column — pages wire their own
   *  address-storage CellPickerField here (needs the doc store + row product). When
   *  omitted, the column falls back to the free-text input. */
  renderCellCell?: (row: DocPositionRow) => React.ReactNode;
  /** Read-only mode (posted documents). Inputs become spans. */
  readOnly?: boolean;
  /** Empty-state text shown when there are no rows (localize from the page). */
  emptyText?: string;
  /**
   * Whether the price column reads as «with VAT». Drives the
   * per-row VAT-amount + line total math inside the table. The
   * parent still owns the document-level reduce (totals panel),
   * but this lets the row's «Сумма НДС» + «Сумма» cells render
   * correctly without the parent reaching into them.
   */
  vatIncluded?: boolean;
  /** Footer toolbar — search input + "Добавить из справочника" + Импорт. */
  footerToolbar?: React.ReactNode;
  /**
   * Selected row ids (controlled). When provided + onSelectionChange,
   * a select-all checkbox renders in the «select» column header and
   * a «Удалить (N)» bulk-action button appears in the footer when
   * the set is non-empty.
   */
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /**
   * Drag-to-reorder handler. When provided, rows get a drag handle
   * (rendered in the `dragarea` column) and HTML5 native DnD wires
   * dragstart → dragover → drop → onReorder(fromIndex, toIndex).
   * Pages typically arrayMove the positions array and setState.
   */
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /**
   * «Наименование ▾» position-sort menu (moysklad parity — live-grounded 2026-06-20,
   * the customer-order edit grid). When provided (with both labels), the «name»
   * column header becomes a ▾ dropdown that sorts the document's own lines by
   * product name or code. The page reorders its positions state (mirrors
   * onReorder); rendered only when the handler + both labels are supplied, so
   * other doc pages keep the plain header.
   */
  onSortPositions?: (by: 'name' | 'code') => void;
  sortByNameLabel?: string;
  sortByCodeLabel?: string;
  /**
   * moysklad «Наименование ▾ → ☐ С учётом групп» — a checkbox under the two sort
   * items that makes the sort group lines by their product folder first, then by
   * name/code within each group. Rendered only when `onWithGroupsChange` +
   * `withGroupsLabel` are supplied; `withGroups` is the controlled checked state.
   */
  withGroups?: boolean;
  onWithGroupsChange?: (value: boolean) => void;
  withGroupsLabel?: string;
  /**
   * moysklad parity: the just-added line's «Кол-во» input auto-focuses (and
   * selects its «1») so the user can type the quantity straight away. The page
   * sets this to the newly-appended row id after a product pick.
   */
  autoFocusRowId?: string;
  /**
   * moysklad «Зарезерв.» editable per line (customer orders). When true, the
   * `reserve` column renders an editable number input (bound via onUpdate's
   * `reserve` field) instead of the read-only «reserved by other docs» cell that
   * procurement/stock contexts use. Off by default — PO etc. keep it read-only.
   */
  editableReserve?: boolean;
  /**
   * moysklad parity (user 2026-07-06): in SALES grids (Заказ покупателя /
   * Отгрузка / Счёт), the «Остаток» + «Доступно» cells turn RED when the value
   * is ≤ 0 — a "you're selling stock you don't have" warning. Off by default so
   * PURCHASE grids (supply / order-to-supplier), where 0 stock is normal, keep
   * the neutral grey. Enable only on sales editors.
   */
  warnStock?: boolean;
  /**
   * moysklad «⚙» column-config gear (live-grounded 2026-06-29 — the commission-out
   * grid). When supplied, the LAST header cell (the `menu` column) renders a gear
   * dropdown listing these toggleable optional columns with a checkbox each; toggling
   * calls `onColumnToggle`. The PAGE owns visibility — it adds/removes the column key
   * from its `columns` prop in response. Opt-in: editors that don't pass it keep a
   * plain (empty) last header cell. moysklad's set = Изображение / Единица измерения /
   * Вес / Объем / Сумма НДС.
   */
  columnConfig?: { key: PositionColumnKey; label: React.ReactNode; checked: boolean }[];
  onColumnToggle?: (key: PositionColumnKey, checked: boolean) => void;
  columnConfigLabel?: React.ReactNode;
  /**
   * moysklad «Цена ▾» header menu (live-grounded — «Расценить» / «Сохранить цены»).
   * When `onPriceAction` + both labels are supplied, the `price` column header becomes
   * a ▾ dropdown. «reprice» re-fills every line's price from a chosen price type;
   * «save» writes the grid's line prices back to the products. Opt-in.
   */
  onPriceAction?: (action: 'reprice' | 'save') => void;
  repriceLabel?: string;
  savePricesLabel?: string;
  /** Per-row «Цена» quick-pick (owner 2026-07-27): when this returns options for a
   *  row, the price cell gets a ▾ listing them (e.g. Оптом / Sotilish from the
   *  product's sale prices); picking one sets the row's price. Empty ⇒ no ▾. */
  priceOptions?: (row: DocPositionRow) => Array<{ id: string; label: string; value: string }>;
  /**
   * moysklad «Комиссия ▾» header menu (live-grounded — «Пересчитать»). When
   * `onCommissionRecalc` + the label are supplied, the `commission` column header
   * becomes a ▾ dropdown that recomputes every line's commission from the document's
   * «Комиссия» mode/percent. Commission-report only (opt-in).
   */
  onCommissionRecalc?: () => void;
  commissionRecalcLabel?: string;
  /** Custom test id. */
  testId?: string;
}

const DEFAULT_LABELS: Record<PositionColumnKey, string> = {
  dragarea: '',
  select: '',
  index: '#',
  image: '',
  name: 'Наименование',
  code: 'Код',
  article: 'Артикул',
  quantityInPacks: 'Кол-во',
  goodPack: 'Уп.',
  unit: 'Единица измерения',
  quantity: 'Кол-во б. ед.',
  shipped: 'Принято',
  available: 'Доступно',
  stock: 'Остаток',
  reserve: 'Зарезерв.',
  waiting: 'Ожидание',
  weight: 'Вес',
  volume: 'Объем',
  price: 'Цена',
  vat: 'НДС',
  vatAmount: 'Сумма НДС',
  discount: 'Скидка',
  amount: 'Сумма',
  commission: 'Комиссия',
  gtdNumber: 'Номер ГТД',
  gtdSumMinor: 'Сумма ГТД',
  rnpt: 'РНПТ',
  marking: 'Маркировка',
  country: 'Страна',
  cell: 'Ячейка',
  reason: 'Причина оприходования',
  costPerUnit: 'Себест. единицы',
  costTotal: 'Себестоимость',
  menu: '',
};

const DEFAULT_WIDTHS: Record<PositionColumnKey, string> = {
  dragarea: '18px',
  select: '32px',
  index: '40px',
  image: '36px',
  // moysklad parity (user 2026-06-20 «jadvallar maksimal ekranni egallamasin,
  // minimal»): the «Наименование» column is a FIXED sensible width, not `auto`.
  // With `auto` it absorbed all leftover space, so on a wide screen the table
  // stretched edge-to-edge with a huge empty name cell. A fixed width keeps the
  // table content-sized (see the table/​wrapper width below).
  name: '300px',
  code: '90px',
  article: '110px',
  // wider than before: «Кол-во» now also carries the inline unit («1 шт»).
  quantityInPacks: '92px',
  goodPack: '60px',
  unit: '90px',
  quantity: '80px',
  shipped: '90px',
  available: '70px',
  stock: '70px',
  reserve: '70px',
  waiting: '80px',
  weight: '60px',
  volume: '60px',
  price: '110px',
  vat: '70px',
  vatAmount: '110px',
  discount: '70px',
  amount: '120px',
  commission: '110px',
  gtdNumber: '150px',
  gtdSumMinor: '120px',
  rnpt: '150px',
  marking: '180px',
  country: '140px',
  cell: '90px',
  reason: '180px',
  costPerUnit: '120px',
  costTotal: '120px',
  menu: '36px',
};

const RIGHT_ALIGNED: Set<PositionColumnKey> = new Set([
  'quantityInPacks',
  'quantity',
  'shipped',
  'available',
  'stock',
  'reserve',
  'waiting',
  'weight',
  'volume',
  'price',
  'vat',
  'vatAmount',
  'discount',
  'amount',
  'commission',
  'gtdSumMinor',
  'costPerUnit',
  'costTotal',
]);

/**
 * Per-row line total (BigInt-safe). Delegates to the shared
 * `computePositionTotal` — the SAME micro-tiyin, single-round-half-up
 * discipline the API uses to post the document — so the «Сумма» /
 * «Сумма НДС» cells render the EXACT totals the database will store.
 *
 * Why delegate (not its own math): the previous inline version rounded
 * `price × qty` to tiyin BEFORE applying the discount and then divided
 * the discount with a TRUNCATING BigInt division, so the on-screen line
 * total could disagree by a tiyin with the API's single-round result —
 * an FE↔BE drift. It also did `BigInt(Number(row.vat))`, which throws a
 * RangeError for a fractional «НДС» (e.g. 7.5) and crashed the row's
 * render. computePositionTotal scales VAT via `Math.round(vat*10000)`,
 * so fractional rates are exact; the try/catch additionally degrades a
 * transient malformed input (mid-typing) to «—» instead of crashing.
 */
function computeLineTotal(
  row: DocPositionRow,
  vatIncluded: boolean,
): { net: bigint; vat: bigint; gross: bigint } {
  try {
    const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
      {
        quantity: row.quantity || '0',
        priceMinor: row.priceMinor || '0',
        discount: row.discount || '0',
        vat: row.vatEnabled && row.vat ? Number(row.vat) : null,
      },
      row.vatEnabled,
      vatIncluded,
    );
    return { net: baseMinor, vat: vatAmountMinor, gross: totalMinor };
  } catch {
    return { net: 0n, vat: 0n, gross: 0n };
  }
}

/** Line total for «Вес»/«Объём» = per-unit measure (g / ml) × Кол-во. Returns ''
 *  (→ «—») when there's no per-unit value or qty, so a column with no product
 *  weight/volume reads blank rather than 0. Trimmed to 3 dp for fractional qty. */
function lineMeasure(perUnit: number | undefined, qty: string): string {
  const u = Number(perUnit);
  const q = Number(qty);
  if (!Number.isFinite(u) || u <= 0 || !Number.isFinite(q) || q <= 0) return '';
  return (Math.round(u * q * 1000) / 1000).toLocaleString('ru-RU');
}

function formatMinor(value: bigint): string {
  if (value === 0n) return '';
  const major = value / 100n;
  const fr = (value % 100n).toString().padStart(2, '0');
  return `${major.toLocaleString('ru-RU')},${fr}`;
}

export function PositionTable({
  columns,
  rows,
  onUpdate,
  onRemove,
  onAdd,
  onDuplicate,
  onReplace,
  renderNameCell,
  renderVatCell,
  renderCountryCell,
  renderCellCell,
  readOnly,
  emptyText = "Hali pozitsiya yo'q",
  vatIncluded = false,
  footerToolbar,
  selectedIds,
  onSelectionChange,
  onReorder,
  onSortPositions,
  sortByNameLabel,
  sortByCodeLabel,
  withGroups,
  onWithGroupsChange,
  withGroupsLabel,
  autoFocusRowId,
  editableReserve,
  warnStock,
  columnConfig,
  onColumnToggle,
  columnConfigLabel,
  priceOptions,
  onPriceAction,
  repriceLabel,
  savePricesLabel,
  onCommissionRecalc,
  commissionRecalcLabel,
  testId,
}: PositionTableProps) {
  // moysklad parity (user 2026-06-24): «Единица измерения» is NOT a standalone
  // column — the unit (e.g. «шт») renders INLINE after the quantity in «Кол-во»
  // («1 шт»). So when the `unit` column is toggled on we (a) show the unit inline
  // and (b) drop the separate column. `visibleCols` is the column list with `unit`
  // filtered out; `showInlineUnit` drives the inline label.
  const showInlineUnit = columns.some((c) => c.key === 'unit');
  const visibleCols = showInlineUnit ? columns.filter((c) => c.key !== 'unit') : columns;

  // Drag-to-reorder state. dragFromIndex tracks the row being dragged;
  // dropIndicator is the visual line position (rendered above the row
  // at that index). Both reset on drop / dragend / escape.
  const [dragFromIndex, setDragFromIndex] = React.useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = React.useState<number | null>(null);
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!onReorder) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragFromIndex(index);
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!onReorder || dragFromIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Decide whether the cursor is on the top or bottom half of the
    // row — drop indicator goes between rows on either side.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropIndicator(isTopHalf ? index : index + 1);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!onReorder || dragFromIndex === null || dropIndicator === null) {
      setDragFromIndex(null);
      setDropIndicator(null);
      return;
    }
    // dropIndicator points to a between-rows position; account for the
    // fact that removing the source row shifts later indices down by 1.
    const to = dropIndicator > dragFromIndex ? dropIndicator - 1 : dropIndicator;
    if (to !== dragFromIndex) onReorder(dragFromIndex, to);
    setDragFromIndex(null);
    setDropIndicator(null);
  };
  const handleDragEnd = () => {
    setDragFromIndex(null);
    setDropIndicator(null);
  };
  const toggleRow = (id: string) => {
    if (!selectedIds || !onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };
  const toggleAll = () => {
    if (!selectedIds || !onSelectionChange) return;
    if (selectedIds.size === rows.length) onSelectionChange(new Set());
    else onSelectionChange(new Set(rows.map((r) => r.id)));
  };
  const allSelected = !!selectedIds && rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = !!selectedIds && selectedIds.size > 0 && selectedIds.size < rows.length;
  const bulkDeleteCount = selectedIds?.size ?? 0;
  const handleBulkDelete = () => {
    if (!selectedIds) return;
    for (const id of selectedIds) onRemove(id);
    onSelectionChange?.(new Set());
  };
  // Sticky x-scrollbar (user 2026-07-17): long position lists pushed the native
  // horizontal scrollbar below the viewport; the scroller's bar is hidden and
  // mirrored into a sticky-bottom proxy strip between the table and the footer.
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  // In-table keyboard entry chain (owner 2026-07-18): Enter in «Кол-во» jumps
  // to the same row's «Цена» (selected); Enter in «Цена» returns to the
  // inline-add search input (footerToolbar) so the next product can be typed
  // straight away. DOM-scoped to this table's root so multiple grids coexist.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const focusWithin = (selector: string): boolean => {
    const el = rootRef.current?.querySelector(selector);
    if (el instanceof HTMLInputElement && !el.disabled && !el.readOnly) {
      el.focus();
      el.select();
      return true;
    }
    return false;
  };
  const handlePriceEnter = () => {
    // Suffix match: PositionInlineAdd emits `${testId}-input` and callers pass
    // custom bases (move-position-add, io-position-add, inventory-position-add)
    // besides the default position-inline-add — all end in «-add-input».
    focusWithin('input[data-test-id$="-add-input"]');
  };
  const handleQtyEnter = (rowId: string) => {
    if (focusWithin(`[data-test-id="pos-${rowId}-price"]`)) return;
    // No editable price cell (price column hidden or read-only) — go straight
    // back to the search input, same as the price → Enter hop.
    handlePriceEnter();
  };
  return (
    <div
      ref={rootRef}
      // moysklad parity (user 2026-06-20): the table hugs its content (w-fit) and
      // caps at the available width (max-w-full → horizontal scroll when it can't
      // fit) instead of stretching edge-to-edge. The user controls per-column
      // widths via the column config (`width` override) on top of these defaults.
      // `overflow-clip` (not hidden/auto): clips corners without becoming a
      // scroll container, so the proxy sticks to the VIEWPORT bottom.
      className="w-fit max-w-full overflow-clip rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]"
      data-test-id={testId ?? 'position-table'}
    >
      <div ref={scrollerRef} className={cn('overflow-x-auto', HIDE_NATIVE_X_SCROLLBAR)}>
        {/* width:auto + table-fixed → the table is the SUM of the column widths
          (all fixed now), so it stays compact instead of filling w-full. */}
        <table className="min-w-[990px] table-fixed border-collapse text-sm">
          <colgroup>
            {visibleCols.map((c) => (
              <col key={c.key} style={{ width: c.width ?? DEFAULT_WIDTHS[c.key] }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b text-[var(--ms-text-muted)]">
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  // moysklad grid header (blueprint table.headerCell + the
                  // customer-order edit-new screenshot): Tahoma 11px, weight 400,
                  // Title Case (NOT uppercase), brand-blue #186999 — moysklad's
                  // goods-table column headers are sortable links rendered in
                  // brand blue (rgb(24,105,153)), not neutral grey.
                  style={{ fontFamily: 'var(--ms-font-dense)' }}
                  className={cn(
                    'h-[30px] px-2 font-normal text-[11px] text-[var(--ms-text-brand)]',
                    RIGHT_ALIGNED.has(c.key) ? 'text-right' : 'text-left',
                  )}
                >
                  {c.key === 'select' && selectedIds && onSelectionChange ? (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer"
                      data-test-id="position-select-all"
                    />
                  ) : c.key === 'name' && onSortPositions && sortByNameLabel && sortByCodeLabel ? (
                    // moysklad «Наименование ▾» — sort the document's own lines by
                    // name or code (live-grounded). The page reorders its state.
                    <DropdownMenu
                      align="start"
                      testId="position-name-sort"
                      trigger={
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
                          data-test-id="position-name-sort-trigger"
                        >
                          {c.label ?? DEFAULT_LABELS[c.key]}
                          <Icons.down className="h-3 w-3" aria-hidden />
                        </button>
                      }
                    >
                      <DropdownMenu.Item
                        onSelect={() => onSortPositions('name')}
                        testId="position-sort-by-name"
                      >
                        {sortByNameLabel}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={() => onSortPositions('code')}
                        testId="position-sort-by-code"
                      >
                        {sortByCodeLabel}
                      </DropdownMenu.Item>
                      {onWithGroupsChange && withGroupsLabel && (
                        <>
                          <DropdownMenu.Separator />
                          {/* moysklad «☐ С учётом групп» — toggle group-aware sort.
                            DropdownMenu.Item closes on select (our menu exposes no
                            keep-open hook), so the user re-opens to sort; the check
                            icon reflects the current state. */}
                          <DropdownMenu.Item
                            onSelect={() => onWithGroupsChange(!withGroups)}
                            icon={
                              <Icons.check
                                className={cn('h-3.5 w-3.5', !withGroups && 'opacity-0')}
                                aria-hidden
                              />
                            }
                            testId="position-sort-with-groups"
                          >
                            {withGroupsLabel}
                          </DropdownMenu.Item>
                        </>
                      )}
                    </DropdownMenu>
                  ) : c.key === 'price' && onPriceAction && repriceLabel && savePricesLabel ? (
                    // moysklad «Цена ▾» — Расценить (re-price from a price type) / Сохранить цены.
                    <DropdownMenu
                      align="start"
                      testId="position-price-menu"
                      trigger={
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
                          data-test-id="position-price-menu-trigger"
                        >
                          {c.label ?? DEFAULT_LABELS[c.key]}
                          <Icons.down className="h-3 w-3" aria-hidden />
                        </button>
                      }
                    >
                      <DropdownMenu.Item
                        onSelect={() => onPriceAction('reprice')}
                        testId="position-price-reprice"
                      >
                        {repriceLabel}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={() => onPriceAction('save')}
                        testId="position-price-save"
                      >
                        {savePricesLabel}
                      </DropdownMenu.Item>
                    </DropdownMenu>
                  ) : c.key === 'commission' && onCommissionRecalc && commissionRecalcLabel ? (
                    // moysklad «Комиссия ▾» — Пересчитать (recompute per-line commission).
                    <DropdownMenu
                      align="start"
                      testId="position-commission-menu"
                      trigger={
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 text-[var(--ms-text-brand)] hover:underline focus:outline-none"
                          data-test-id="position-commission-menu-trigger"
                        >
                          {c.label ?? DEFAULT_LABELS[c.key]}
                          <Icons.down className="h-3 w-3" aria-hidden />
                        </button>
                      }
                    >
                      <DropdownMenu.Item
                        onSelect={() => onCommissionRecalc()}
                        testId="position-commission-recalc"
                      >
                        {commissionRecalcLabel}
                      </DropdownMenu.Item>
                    </DropdownMenu>
                  ) : c.key === 'menu' &&
                    columnConfig &&
                    columnConfig.length > 0 &&
                    onColumnToggle ? (
                    // moysklad «⚙» column-config gear — toggle the optional columns
                    // (Изображение / Единица измерения / Вес / Объем / Сумма НДС). The
                    // page owns visibility (adds/removes the key from `columns`).
                    <DropdownMenu
                      align="end"
                      testId="position-column-config"
                      trigger={
                        <button
                          type="button"
                          className="inline-flex items-center text-[var(--ms-text-brand)] hover:opacity-70 focus:outline-none"
                          aria-label={
                            columnConfigLabel ? String(columnConfigLabel) : 'Настройка колонок'
                          }
                          data-test-id="position-column-config-trigger"
                        >
                          <Icons.settings className="h-4 w-4" aria-hidden />
                          <Icons.down className="h-3 w-3" aria-hidden />
                        </button>
                      }
                    >
                      {columnConfig.map((col) => (
                        <DropdownMenu.Item
                          key={col.key}
                          onSelect={() => onColumnToggle(col.key, !col.checked)}
                          icon={
                            <Icons.check
                              className={cn('h-3.5 w-3.5', !col.checked && 'opacity-0')}
                              aria-hidden
                            />
                          }
                          testId={`position-column-toggle-${col.key}`}
                        >
                          {col.label}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu>
                  ) : (
                    (c.label ?? DEFAULT_LABELS[c.key])
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              // moysklad shows no «empty» row — the add-line sits right under the
              // header. Pass emptyText="" to suppress the placeholder row entirely.
              emptyText ? (
                <tr>
                  <td
                    colSpan={visibleCols.length}
                    className="px-2 py-8 text-center text-[var(--ms-text-muted)] text-sm"
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : null
            ) : (
              rows.map((row, index) => {
                // moysklad: a line ordering MORE than the displayed stock tints red.
                const isOversold = !!warnStock && isRowOversold(row, visibleCols);
                return (
                  <tr
                    key={row.id}
                    draggable={!!onReorder && !readOnly}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      // moysklad parity: the goods grid highlights the row under the
                      // cursor in a pale yellow (b-inlineeditor-table tr:hover). `group`
                      // lets per-row hover affordances (e.g. the drag «⋮⋮») fade in.
                      'group border-[var(--ms-border-default)] border-b transition-colors last:border-b-0',
                      // moysklad sales-grid: Кол-во > displayed stock tints the WHOLE row
                      // red («selling stock you don't have»); else the pale-yellow hover.
                      isOversold
                        ? 'bg-[color-mix(in_srgb,var(--ms-action-destructive)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--ms-action-destructive)_20%,transparent)]'
                        : 'hover:bg-[var(--ms-row-hover)]',
                      selectedIds?.has(row.id) && 'bg-[var(--ms-brand-50)]/30',
                      dragFromIndex === index && 'opacity-40',
                      // The drop indicator is rendered as a 2px top
                      // border on the row at the target index. When
                      // dropping at the very end (after last row), the
                      // last row gets a bottom border instead.
                      dropIndicator === index && 'border-t-2 border-t-[var(--ms-text-brand)]',
                      dropIndicator === rows.length &&
                        index === rows.length - 1 &&
                        'border-b-2 border-b-[var(--ms-text-brand)]',
                    )}
                    data-test-id={`position-row-${row.id}`}
                  >
                    {visibleCols.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-2 py-1.5 align-middle',
                          RIGHT_ALIGNED.has(c.key) && 'text-right',
                        )}
                      >
                        {renderCell({
                          column: c,
                          row,
                          index,
                          onUpdate,
                          onRemove,
                          onDuplicate,
                          onReplace,
                          renderNameCell,
                          renderVatCell,
                          renderCountryCell,
                          renderCellCell,
                          readOnly,
                          vatIncluded,
                          isSelected: selectedIds?.has(row.id) ?? false,
                          onSelect: () => toggleRow(row.id),
                          canDrag: !!onReorder && !readOnly,
                          autoFocusQty: !!autoFocusRowId && row.id === autoFocusRowId,
                          editableReserve: !!editableReserve,
                          priceOptions,
                          warnStock: !!warnStock,
                          showInlineUnit,
                          onQtyEnter: handleQtyEnter,
                          onPriceEnter: handlePriceEnter,
                        })}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <StickyXScrollbar scrollerRef={scrollerRef} />
      <div className="flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-2 py-2">
        {bulkDeleteCount > 0 && !readOnly && (
          <Button
            type="button"
            variant="secondary"
            onClick={handleBulkDelete}
            className="text-[var(--ms-text-destructive)]"
            data-test-id="position-bulk-delete"
          >
            <Icons.close className="h-4 w-4" />
            Удалить ({bulkDeleteCount})
          </Button>
        )}
        {footerToolbar ??
          (onAdd && !readOnly ? (
            <Button type="button" variant="secondary" onClick={onAdd} data-test-id="add-position">
              <Icons.create className="h-4 w-4" />
              Добавить позицию
            </Button>
          ) : null)}
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  readOnly,
  align,
  testId,
  autoFocus,
  suffix,
  onEnterKey,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  align?: 'right' | 'left';
  testId?: string;
  autoFocus?: boolean;
  /** moysklad parity: a fixed unit glyph rendered after the value (e.g. «%» on
   *  the «Скидка» column). Read-only shows `value+suffix`; the editable input
   *  shows the suffix as a non-interactive trailing label. */
  suffix?: string;
  /** Enter pressed in this cell — the «Кол-во» cell chains to «Цена» with it
   *  (owner 2026-07-18 in-table entry flow). */
  onEnterKey?: () => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  // moysklad parity: the freshly-added line auto-focuses its «Кол-во» input and
  // selects the «1» so the user types the quantity straight away (mount-only).
  React.useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [autoFocus]);
  if (readOnly) {
    return (
      <span className={cn('block tabular-nums', align === 'right' && 'text-right')}>
        {value ? `${value}${suffix ?? ''}` : '—'}
      </span>
    );
  }
  const input = (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onEnterKey
          ? (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onEnterKey();
              }
            }
          : undefined
      }
      // moysklad parity: editable goods cells are BORDERLESS at rest (the value
      // reads as plain text on the row) — a white box with a grey border appears
      // on hover (affordance) and the border turns brand-blue on focus (editing).
      className={cn(
        'h-7 w-full rounded-[var(--ms-radius-sm)] border border-transparent bg-transparent tabular-nums hover:border-[var(--ms-border-default)] hover:bg-[var(--ms-bg-surface)] focus:border-[var(--ms-border-focus)] focus:bg-[var(--ms-bg-surface)] focus:outline-none',
        suffix ? 'pr-4 pl-1.5' : 'px-1.5',
        align === 'right' && 'text-right',
      )}
      data-test-id={testId}
    />
  );
  if (!suffix) return input;
  return (
    <span className="relative block">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[11px] text-[var(--ms-text-muted)]">
        {suffix}
      </span>
    </span>
  );
}

/** True when a stock/available string parses to a number ≤ 0 (empty/undefined ⇒
 *  false, so a row with no stock info stays neutral, not red). Tolerates the
 *  grouping spaces / decimal comma the values may carry. */
function isNonPositive(value: string | undefined): boolean {
  if (value == null || value === '') return false;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n <= 0;
}

/** Parse a stock/qty display string («1 234,5» → 1234.5). null when blank/NaN. */
function parseStockNum(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * moysklad sales-grid oversell test: is this line ordering MORE than the stock
 * figure the grid DISPLAYS («Доступно» if that column is shown, else «Остаток»)?
 * Кол-во > that figure means "selling stock you don't have", so the WHOLE row
 * renders red. Returns false when no stock column is shown or the row carries no
 * stock number (e.g. a fresh empty line, or a purchase grid where 0 stock is fine).
 */
export function isRowOversold(row: DocPositionRow, cols: { key: string }[]): boolean {
  const stockKey = cols.some((c) => c.key === 'available')
    ? 'available'
    : cols.some((c) => c.key === 'stock')
      ? 'stock'
      : null;
  if (!stockKey) return false;
  const stock = parseStockNum(stockKey === 'available' ? row.available : row.stock);
  if (stock == null) return false;
  return (parseStockNum(row.quantity) ?? 0) > stock;
}

function ReadOnlyCell({ value, warn }: { value: string | undefined; warn?: boolean }) {
  // moysklad sales-grid warning: «Остаток»/«Доступно» ≤ 0 renders in the
  // destructive red (parent passes warn); otherwise the neutral muted grey.
  return (
    <span
      className={cn(
        'block tabular-nums',
        warn ? 'text-[var(--ms-action-destructive)]' : 'text-[var(--ms-text-muted)]',
      )}
    >
      {value ?? '—'}
    </span>
  );
}

/** Free-text cell (e.g. «Номер ГТД» — slash-bearing customs number). */
function TextInput({
  value,
  onChange,
  readOnly,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  /** Grey placeholder shown when empty (moysklad «Ячейка» → «Не указана»). */
  placeholder?: string;
  testId?: string;
}) {
  if (readOnly) {
    // Empty + read-only → show the placeholder (moysklad «Не указана»), else a dash.
    return (
      <span className={`block truncate ${value ? '' : 'text-[var(--ms-text-muted)]'}`}>
        {value || placeholder || '—'}
      </span>
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      // moysklad parity: borderless at rest, white box on hover, brand-blue on focus.
      className="h-7 w-full rounded-[var(--ms-radius-sm)] border border-transparent bg-transparent px-1.5 hover:border-[var(--ms-border-default)] hover:bg-[var(--ms-bg-surface)] focus:border-[var(--ms-border-focus)] focus:bg-[var(--ms-bg-surface)] focus:outline-none"
      data-test-id={testId}
    />
  );
}

function renderCell({
  column,
  row,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
  onReplace,
  renderNameCell,
  renderVatCell,
  renderCountryCell,
  renderCellCell,
  readOnly,
  vatIncluded,
  isSelected,
  onSelect,
  canDrag,
  autoFocusQty,
  editableReserve,
  priceOptions,
  warnStock,
  showInlineUnit,
  onQtyEnter,
  onPriceEnter,
}: {
  column: PositionTableColumnConfig;
  row: DocPositionRow;
  index: number;
  onUpdate: (id: string, patch: Partial<DocPositionRow>) => void;
  onRemove: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onReplace?: (id: string) => void;
  renderNameCell: (row: DocPositionRow) => React.ReactNode;
  renderVatCell?: (row: DocPositionRow) => React.ReactNode;
  renderCountryCell?: (row: DocPositionRow) => React.ReactNode;
  renderCellCell?: (row: DocPositionRow) => React.ReactNode;
  readOnly?: boolean;
  vatIncluded?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  canDrag?: boolean;
  autoFocusQty?: boolean;
  editableReserve?: boolean;
  priceOptions?: (row: DocPositionRow) => Array<{ id: string; label: string; value: string }>;
  /** moysklad: colour «Остаток»/«Доступно» red when ≤ 0 (sales grids only). */
  warnStock?: boolean;
  /** moysklad: render the unit («шт») inline after the «Кол-во» quantity. */
  showInlineUnit?: boolean;
  /** In-table entry chain (owner 2026-07-18): Enter in «Кол-во» → row's «Цена». */
  onQtyEnter?: (rowId: string) => void;
  /** Enter in «Цена» → back to the inline-add search input. */
  onPriceEnter?: () => void;
}) {
  switch (column.key) {
    case 'dragarea':
      return canDrag ? (
        // moysklad parity: no persistent grip in the resting grid — the «⋮⋮» handle
        // only fades in on row hover (the row carries `group`), keeping the default
        // view clean like moysklad's b-inlineeditor-table.
        <span
          className="block cursor-grab select-none text-center text-[var(--ms-text-muted)] text-xs leading-none opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
          aria-label="Drag handle"
          title="Tartibni o'zgartirish uchun sudrang"
        >
          ⋮⋮
        </span>
      ) : null;
    case 'select':
      return (
        <input
          type="checkbox"
          aria-label="Select row"
          checked={!!isSelected}
          onChange={() => onSelect?.()}
          className="h-4 w-4 cursor-pointer"
          data-test-id={`pos-${row.id}-select`}
        />
      );
    case 'index':
      return <span className="block text-[var(--ms-text-muted)] tabular-nums">{index + 1}</span>;
    case 'image':
      // moysklad shows the product thumbnail (GET /images/:id/raw); fall back to
      // the name initial when the product has no image.
      return row.imageUrl ? (
        <img
          src={row.imageUrl}
          alt=""
          loading="lazy"
          className="h-7 w-7 rounded-[var(--ms-radius-sm)] object-cover"
        />
      ) : (
        <div
          className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs"
          aria-hidden
          title={row.productLabel}
        >
          {row.productLabel?.[0]?.toUpperCase() ?? '·'}
        </div>
      );
    case 'name':
      return renderNameCell(row);
    case 'code':
      return <ReadOnlyCell value={row.productCode} />;
    case 'article':
      return <ReadOnlyCell value={row.productArticle} />;
    case 'quantityInPacks':
    case 'quantity': {
      // moysklad «Кол-во»: the quantity input with the unit («шт») rendered
      // INLINE to its right («1 шт»). This replaces the standalone «Единица
      // измерения» column (filtered out when showInlineUnit is on). Both quantity
      // keys share this — every doc grid (CO/PO use `quantity`) gets the inline unit.
      const qtyInput = (
        <NumberInput
          value={row.quantity}
          onChange={(v) => onUpdate(row.id, { quantity: v })}
          readOnly={readOnly}
          align="right"
          autoFocus={autoFocusQty}
          testId={`pos-${row.id}-qty`}
          onEnterKey={onQtyEnter ? () => onQtyEnter(row.id) : undefined}
        />
      );
      if (!showInlineUnit) return qtyInput;
      return (
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1">{qtyInput}</span>
          <span className="shrink-0 text-[11px] text-[var(--ms-text-muted)]">
            {row.productUom || 'шт'}
          </span>
        </div>
      );
    }
    case 'shipped':
      return <ReadOnlyCell value={row.shipped} />;
    case 'available':
      return (
        <ReadOnlyCell value={row.available} warn={warnStock && isNonPositive(row.available)} />
      );
    case 'stock':
      return <ReadOnlyCell value={row.stock} warn={warnStock && isNonPositive(row.stock)} />;
    case 'reserve':
      // moysklad «Зарезерв.» is an editable per-line box on customer orders;
      // elsewhere (procurement/stock) it's the read-only «reserved by other docs».
      return editableReserve && !readOnly ? (
        <NumberInput
          value={row.reserve ?? ''}
          onChange={(v) => onUpdate(row.id, { reserve: v })}
          align="right"
          testId={`pos-${row.id}-reserve`}
        />
      ) : (
        <ReadOnlyCell value={row.reserve} />
      );
    case 'waiting':
      return <ReadOnlyCell value={row.waiting} />;
    case 'weight':
      // «Вес» = line total (per-unit g × Кол-во); falls back to a pre-set string.
      return <ReadOnlyCell value={lineMeasure(row.weightG, row.quantity) || row.weight} />;
    case 'volume':
      // «Объём» = line total (per-unit ml × Кол-во); falls back to a pre-set string.
      return <ReadOnlyCell value={lineMeasure(row.volumeML, row.quantity) || row.volume} />;
    case 'price': {
      // moysklad «Цена»: entered/shown in MAJOR sum, formatted «890,00» (comma +
      // 2 decimals) at rest, stored as minor. The old NumberInput bound the raw
      // `priceMinor`, so a 900,00 price showed as «90000» (minor, unformatted)
      // and typing «90000» booked only 900,00. MoneyInput fixes both — major
      // entry + formatted display.
      if (readOnly) return <ReadOnlyCell value={formatMinor(BigInt(row.priceMinor || '0'))} />;
      const priceInput = (
        <MoneyInput
          valueMinor={row.priceMinor}
          onChangeMinor={(v) => onUpdate(row.id, { priceMinor: v })}
          displayFormatted
          onKeyDown={
            onPriceEnter
              ? (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onPriceEnter();
                  }
                }
              : undefined
          }
          // moysklad parity: «Цена» reads as plain text at rest — borderless +
          // transparent bg, the white box + grey border show on hover, brand-blue
          // on focus (overrides the Input primitive's always-on resting border).
          className="h-7 border-transparent bg-transparent text-right hover:border-[var(--ms-border-input)] hover:bg-[var(--ms-bg-surface)] focus:bg-[var(--ms-bg-surface)]"
          data-test-id={`pos-${row.id}-price`}
        />
      );
      // Owner 2026-07-27: when the product carries sale prices (Оптом / Sotilish),
      // the «Цена» cell gets a ▾ to switch between them; picking sets the row price.
      const priceOpts = priceOptions?.(row) ?? [];
      if (priceOpts.length === 0) return priceInput;
      return (
        <div className="flex items-center justify-end gap-1">
          <span className="min-w-0 flex-1">{priceInput}</span>
          <DropdownMenu
            align="end"
            testId={`pos-${row.id}-price-pick`}
            trigger={
              <button
                type="button"
                aria-label="Narxni tanlash"
                className="shrink-0 text-[var(--ms-text-brand)] leading-none hover:opacity-70 focus:outline-none"
                data-test-id={`pos-${row.id}-price-pick-trigger`}
              >
                <Icons.down className="h-3.5 w-3.5" aria-hidden />
              </button>
            }
          >
            {priceOpts.map((o) => (
              <DropdownMenu.Item
                key={o.id}
                onSelect={() => onUpdate(row.id, { priceMinor: o.value })}
                testId={`pos-${row.id}-price-opt-${o.id}`}
              >
                {o.label}: {formatMinor(BigInt(o.value || '0'))}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu>
        </div>
      );
    }
    case 'vat':
      return renderVatCell ? (
        renderVatCell(row)
      ) : (
        <NumberInput
          value={row.vat}
          onChange={(v) => onUpdate(row.id, { vat: v })}
          readOnly={readOnly}
          align="right"
          testId={`pos-${row.id}-vat`}
        />
      );
    case 'discount':
      // moysklad «Скидка» is a PERCENT — show a trailing «%» (e.g. «0%», «10%»).
      return (
        <NumberInput
          value={row.discount}
          onChange={(v) => onUpdate(row.id, { discount: v })}
          readOnly={readOnly}
          align="right"
          suffix="%"
          testId={`pos-${row.id}-discount`}
        />
      );
    case 'vatAmount': {
      // VAT amount per row — computed live from price × qty × vat%.
      const { vat } = computeLineTotal(row, !!vatIncluded);
      return (
        <span className="block text-[var(--ms-text-muted)] tabular-nums">
          {vat > 0n ? formatMinor(vat) : '—'}
        </span>
      );
    }
    case 'amount': {
      // Line total — qty × price − discount + (vat if not included).
      // Computed BigInt-safe so 2000-row docs don't drift on rounding.
      const { gross } = computeLineTotal(row, !!vatIncluded);
      return (
        <span className="block font-medium tabular-nums">
          {gross > 0n ? formatMinor(gross) : '—'}
        </span>
      );
    }
    case 'commission': {
      // «Комиссия» — per-line commission/reward on a commission report «Выданный».
      // Editable money: entered in MAJOR sum, formatted, stored as minor (mirrors
      // «Цена»). The parent sums these into the «Комиссия» / «Сумма комитента» footer.
      if (readOnly) return <ReadOnlyCell value={formatMinor(BigInt(row.commissionMinor || '0'))} />;
      return (
        <MoneyInput
          valueMinor={row.commissionMinor ?? '0'}
          onChangeMinor={(v) => onUpdate(row.id, { commissionMinor: v })}
          displayFormatted
          className="h-7 border-transparent bg-transparent text-right hover:border-[var(--ms-border-input)] hover:bg-[var(--ms-bg-surface)] focus:bg-[var(--ms-bg-surface)]"
          data-test-id={`pos-${row.id}-commission`}
        />
      );
    }
    case 'goodPack':
    case 'unit':
      // Both surface the product's unit of measure read-only. `goodPack`
      // («Уп.») is the packaging slot; `unit` («Единица измерения») is the
      // base-unit column moysklad shows by default on purchase orders.
      return <ReadOnlyCell value={row.productUom ?? '—'} />;
    case 'gtdNumber':
      return (
        <TextInput
          value={row.gtdNumber ?? ''}
          onChange={(v) => onUpdate(row.id, { gtdNumber: v })}
          readOnly={readOnly}
          testId={`pos-${row.id}-gtd-number`}
        />
      );
    case 'gtdSumMinor':
      return (
        <NumberInput
          value={row.gtdSumMinor ?? ''}
          onChange={(v) => onUpdate(row.id, { gtdSumMinor: v })}
          readOnly={readOnly}
          align="right"
          testId={`pos-${row.id}-gtd-sum`}
        />
      );
    case 'country':
      return renderCountryCell ? (
        renderCountryCell(row)
      ) : (
        <span className="block truncate text-[var(--ms-text-muted)]">
          {row.countryLabel ?? '—'}
        </span>
      );
    case 'reason':
      return (
        <TextInput
          value={row.reason ?? ''}
          onChange={(v) => onUpdate(row.id, { reason: v })}
          readOnly={readOnly}
          testId={`pos-${row.id}-reason`}
        />
      );
    case 'rnpt':
      // «РНПТ» — registration number of goods batch, free-text (Enter import grid).
      return (
        <TextInput
          value={row.rnpt ?? ''}
          onChange={(v) => onUpdate(row.id, { rnpt: v })}
          readOnly={readOnly}
          testId={`pos-${row.id}-rnpt`}
        />
      );
    case 'marking':
      // «Маркировка» — Честный знак marking code(s), free-text (scan entry later).
      return (
        <TextInput
          value={row.marking ?? ''}
          onChange={(v) => onUpdate(row.id, { marking: v })}
          readOnly={readOnly}
          placeholder={column.placeholder}
          testId={`pos-${row.id}-marking`}
        />
      );
    case 'cell':
      // «Ячейка» — address-storage bin. Pages wire a CellPickerField via
      // renderCellCell (needs the doc store + the row's product). When omitted (or
      // read-only without a picker), fall back to the free-text input — moysklad
      // shows «Не указана» (col.placeholder) when empty.
      return renderCellCell ? (
        renderCellCell(row)
      ) : (
        <TextInput
          value={row.cell ?? ''}
          onChange={(v) => onUpdate(row.id, { cell: v })}
          readOnly={readOnly}
          placeholder={column.placeholder}
          testId={`pos-${row.id}-cell`}
        />
      );
    case 'costPerUnit':
      // «Себест. единицы» — read-only unit cost. Uses `costMinor` (carrying cost,
      // e.g. sales-return weighted-average) when provided; falls back to `priceMinor`
      // for docs where cost = price (Enter/Supply) — backward-compatible.
      return (
        <span className="block tabular-nums">
          {formatMinor(BigInt(row.costMinor ?? row.priceMinor ?? '0'))}
        </span>
      );
    case 'costTotal': {
      // «Себестоимость» — read-only total cost (price × qty; no VAT/discount on Enter).
      const { gross } = computeLineTotal(row, !!vatIncluded);
      return <span className="block tabular-nums">{gross > 0n ? formatMinor(gross) : '—'}</span>;
    }
    case 'menu':
      return readOnly ? null : (
        <DropdownMenu
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Qator menyusi"
              data-test-id={`pos-${row.id}-menu`}
            >
              <Icons.more className="h-4 w-4" />
            </Button>
          }
          align="end"
        >
          {onDuplicate && (
            <DropdownMenu.Item
              onSelect={() => onDuplicate(row.id)}
              testId={`pos-${row.id}-duplicate`}
            >
              Дублировать
            </DropdownMenu.Item>
          )}
          {onReplace && (
            <DropdownMenu.Item onSelect={() => onReplace(row.id)} testId={`pos-${row.id}-replace`}>
              Заменить
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            destructive
            onSelect={() => onRemove(row.id)}
            testId={`pos-${row.id}-remove`}
          >
            Удалить
          </DropdownMenu.Item>
        </DropdownMenu>
      );
    default:
      return null;
  }
}
