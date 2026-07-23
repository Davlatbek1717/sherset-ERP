import * as React from 'react';
import { cn } from '../lib/cn.ts';
import { Checkbox } from '../primitives/Checkbox.tsx';
import { HIDE_NATIVE_X_SCROLLBAR, StickyXScrollbar } from './StickyHScroll.tsx';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /**
   * Plain-text accessor for CSV/Excel export. When absent, the column is
   * skipped during export (columns that render complex JSX have no
   * well-defined stringification — let the caller opt in).
   */
  cellText?: (row: T) => string;
  /**
   * Plain-text header used for the CSV. Defaults to `header` if it's a
   * string, else the column key.
   */
  headerText?: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  sortable?: boolean;
  /**
   * Backend field name when it differs from the UI column `key`. Set this
   * when the column header reads "Сумма" but the API sort param expects
   * `sumMinor`. The DataTable renders the indicator off `key` and feeds
   * `onSortChange` with `sortField ?? key` so the page handler always
   * gets the API-compatible value.
   */
  sortField?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  /**
   * moysklad parity: clicking ANYWHERE on the row (not just the № link) opens the
   * document. When true and no `onRowClick` is set, a click on the row body
   * activates the row's FIRST `<a href>` (the № cell link) — so every list page
   * gets whole-row-click without per-page wiring. Clicks that land on an
   * interactive child (link / button / checkbox / input) are left to that child.
   * ListView turns this on for all list pages; raw DataTable callers (breakdown
   * tables etc.) leave it off so their rows stay non-navigable.
   */
  rowClickOpensPrimaryLink?: boolean;
  rowTestId?: (row: T) => string | undefined;
  /**
   * moysklad parity: per-row actions rendered in the trailing cell (under the
   * `headerEndSlot` gear column), revealed on row hover. Typically a «⋮» menu
   * trigger. Requires `headerEndSlot` (the trailing column) to be present.
   */
  rowActions?: (row: T) => React.ReactNode;
  /**
   * moysklad parity: optional extra classes per row — e.g. grey+italic for
   * unposted/draft documents (moysklad de-emphasises non-posted rows). Opt-in:
   * undefined for the ~80 callers that don't need per-row styling.
   */
  rowClassName?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  loading?: boolean;
  className?: string;
  /**
   * moysklad parity: fill the parent's height instead of sizing to content.
   * When true the table body scrolls INTERNALLY (the header stays pinned via
   * sticky-top and the totals footer via sticky-bottom) so the grid claims
   * the full viewport with the pagination bar always visible — matching
   * moysklad's list layout. Requires a height-bounded flex parent (ListView
   * provides one). OFF by default so the ~80 non-ListView DataTable callers
   * keep their natural content-height layout untouched.
   */
  fillHeight?: boolean;
  /**
   * When true, a leading checkbox column is rendered and rows become selectable.
   * `selectedIds` is the controlled set of selected row keys (stringified keyField).
   */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /**
   * Optional predicate — rows that return false are not selectable (checkbox disabled).
   * Used e.g. to lock posted rows out of bulk-delete.
   */
  canSelect?: (row: T) => boolean;
  /**
   * If provided, only columns whose key is in this set are rendered. The
   * `columns` prop still defines the full list — the caller feeds this set
   * from a localStorage-backed preference (see `ColumnCustomizer`).
   */
  visibleColumnKeys?: Set<string>;
  /**
   * Optional sticky-bottom totals row that mirrors moysklad's "0,00"
   * sum strip under list pages (Заказы покупателей, Отгрузки, …).
   * Keys map to column `key`s; values render in the same align as the
   * column. Columns absent from the map render an empty cell. When
   * the table is empty this row is hidden — moysklad renders it only
   * when `total > 0`, but we surface it whenever `rows.length > 0` so
   * the UI stays consistent for filtered views with the totals row.
   */
  footerRow?: Record<string, React.ReactNode>;
  /** Currently-sorted column key. Used to render the ▲/▼ indicator. */
  sortKey?: string;
  /** Current sort direction (defaults to 'desc' on first click). */
  sortDir?: 'asc' | 'desc';
  /** Fired when the user clicks a sortable header. The handler is
   *  responsible for toggling direction + updating the parent query. */
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
  /**
   * Optional node rendered as the LAST cell of the header row — used to
   * host a column-visibility gear button (moysklad parity: the ⚙ at the
   * right end of the column headers opens a popover with column
   * checkboxes + a row-count toggle).
   */
  headerEndSlot?: React.ReactNode;
  /**
   * Controlled per-column widths in pixels, keyed by `DataTableColumn.key`.
   * When provided, the header cell renders a drag handle on its right edge
   * so the user can resize columns (moysklad parity). Pages pair this
   * with `useColumnWidths` for localStorage persistence.
   */
  columnWidths?: Record<string, number>;
  /** Fired with (columnKey, newWidthPx) on drag-release. */
  onColumnResize?: (key: string, widthPx: number) => void;
}

const alignMap = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

/**
 * Extract plain text from a rendered cell node — the built-in client-side sort
 * fallback for columns without `cellText` when the page hasn't wired
 * server-side `onSortChange`. Best-effort: walks string/number/array/element.
 */
function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

export function DataTable<T extends object>({
  columns: allColumns,
  rows,
  keyField,
  onRowClick,
  rowClickOpensPrimaryLink,
  rowTestId,
  rowActions,
  rowClassName,
  empty,
  loading,
  className,
  fillHeight,
  selectable,
  selectedIds,
  onSelectionChange,
  canSelect,
  visibleColumnKeys,
  footerRow,
  sortKey,
  sortDir,
  onSortChange,
  headerEndSlot,
  columnWidths,
  onColumnResize,
}: DataTableProps<T>) {
  // Column resize drag state — when active, a single column is being
  // dragged; we listen to mousemove/up on window and write the new width
  // through `onColumnResize` on release. Live update during drag keeps
  // the header visible without re-rendering rows on every pixel.
  const [dragState, setDragState] = React.useState<{
    key: string;
    startX: number;
    startWidth: number;
    currentWidth: number;
  } | null>(null);

  // Uncontrolled fallbacks so EVERY DataTable is resizable + sortable even when
  // the page didn't wire columnWidths / onSortChange. Controlled props win.
  const [internalWidths, setInternalWidths] = React.useState<Record<string, number>>({});
  const [internalSort, setInternalSort] = React.useState<{
    key: string;
    dir: 'asc' | 'desc';
  } | null>(null);

  React.useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragState.startX;
      const next = Math.max(40, dragState.startWidth + delta);
      setDragState((s) => (s ? { ...s, currentWidth: next } : s));
    };
    const onUp = () => {
      if (dragState) {
        if (onColumnResize) onColumnResize(dragState.key, dragState.currentWidth);
        else setInternalWidths((w) => ({ ...w, [dragState.key]: dragState.currentWidth }));
      }
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragState, onColumnResize]);

  // Controlled widths (columnWidths) win; else fall back to internal widths
  // captured on first resize.
  const effectiveWidths = columnWidths ?? internalWidths;
  const widthFor = (col: DataTableColumn<T>): string | undefined => {
    // Drag-in-progress wins so the user sees live feedback.
    if (dragState?.key === col.key) return `${dragState.currentWidth}px`;
    const persisted = effectiveWidths[col.key];
    if (persisted) return `${persisted}px`;
    return col.width;
  };
  // Switch to fixed table-layout (needed for resize) once ANY width is set —
  // controlled, captured-on-drag, or a live drag. Until then keep auto-layout
  // so the natural content-fit sizing is preserved for every untouched table.
  const hasAnyWidth = !!columnWidths || Object.keys(internalWidths).length > 0 || !!dragState;
  const columns = visibleColumnKeys
    ? allColumns.filter((c) => visibleColumnKeys.has(c.key))
    : allColumns;

  // Built-in client-side sort — active ONLY when the page didn't wire
  // server-side onSortChange. Then clicking any header (unless sortable:false)
  // sorts the loaded rows by cellText / extracted cell text; numeric-aware.
  const clientSort = !onSortChange;
  const sortedRows = React.useMemo(() => {
    if (!clientSort || !internalSort) return rows;
    const col = allColumns.find((c) => c.key === internalSort.key);
    if (!col) return rows;
    const valOf = (r: T): string => (col.cellText ? col.cellText(r) : textOf(col.cell(r))).trim();
    const dir = internalSort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = valOf(a);
      const bv = valOf(b);
      const an = Number.parseFloat(av.replace(/\s/g, '').replace(',', '.'));
      const bn = Number.parseFloat(bv.replace(/\s/g, '').replace(',', '.'));
      const bothNum = !Number.isNaN(an) && !Number.isNaN(bn) && /\d/.test(av) && /\d/.test(bv);
      const cmp = bothNum ? an - bn : av.localeCompare(bv, 'ru');
      return cmp * dir;
    });
  }, [clientSort, internalSort, rows, allColumns]);

  // Derived header-checkbox state
  const selectableRows = React.useMemo(
    () => (selectable ? rows.filter((r) => (canSelect ? canSelect(r) : true)) : []),
    [selectable, rows, canSelect],
  );
  const selectedCount =
    selectable && selectedIds
      ? selectableRows.filter((r) => selectedIds.has(String(r[keyField]))).length
      : 0;
  const allSelected = selectableRows.length > 0 && selectedCount === selectableRows.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      const next = new Set<string>();
      for (const r of selectableRows) next.add(String(r[keyField]));
      onSelectionChange(next);
    }
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const totalCols = columns.length + (selectable ? 1 : 0) + (headerEndSlot ? 1 : 0);

  // Sticky x-scrollbar (user 2026-07-17): with natural document scroll the
  // native scrollbar sits at the table's bottom — off-screen on long lists.
  // Non-fill mode hides it and mirrors it into a sticky-bottom proxy strip.
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        // `overflow-clip` (NOT hidden): clips the square table corners to the
        // rounded border without becoming a scroll container — an overflow-
        // hidden ancestor would pin the sticky x-scrollbar proxy to this box
        // instead of the viewport.
        'w-full overflow-clip rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
        // fill mode: become a height-bounded flex column so the inner scroll
        // box can claim flex-1 and the sticky header/footer have somewhere to
        // pin against.
        fillHeight && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      <div
        ref={scrollerRef}
        className={cn(
          fillHeight
            ? 'min-h-0 flex-1 overflow-auto'
            : cn('overflow-x-auto', HIDE_NATIVE_X_SCROLLBAR),
        )}
      >
        <table
          // OWNER-OVERRIDE 2026-07-17 (deliberate parity-deviation, like the
          // 24px controls): grid text bumped 11px → 13px — the owner found the
          // moysklad-parity 11px cells too small to read. Header + footer
          // carry their own explicit text-[13px].
          className="w-full caption-bottom text-[13px]"
          // moysklad parity: fixed table layout when ANY column has an
          // explicit / persisted width OR resize handles are enabled —
          // otherwise the browser's auto-layout overrides `width`, which
          // breaks column-resize feedback. Without a persisted width
          // table-layout stays auto so the natural content-fit layout
          // still works for callers who haven't opted into resizing.
          style={hasAnyWidth ? { tableLayout: 'fixed' } : undefined}
        >
          <thead
            className={cn(
              'bg-[var(--ms-bg-muted)]',
              // fill mode: pin the header to the top of the internal scroll box
              // so column titles stay visible while the rows scroll (moysklad
              // grid parity).
              fillHeight && 'sticky top-0 z-[2]',
            )}
          >
            <tr>
              {selectable && (
                <th scope="col" className="h-9 w-10 px-1 text-left" style={{ width: '2.5rem' }}>
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    disabled={selectableRows.length === 0}
                    aria-label="Select all rows"
                    data-test-id="select-all"
                  />
                </th>
              )}
              {columns.map((col) => {
                // Server mode (onSortChange wired): opt-in via col.sortable.
                // Client mode (no onSortChange): EVERY column sorts unless it
                // explicitly opts out with sortable:false.
                const isSortable = clientSort ? col.sortable !== false : !!col.sortable;
                // Active highlight matches against either the UI key
                // (typical case) or the explicit backend field — pages
                // that store sort state in API-field shape (e.g.
                // sortKey="sumMinor") still light up the "Сумма" header.
                const sortFieldName = col.sortField ?? col.key;
                const activeSortKey = clientSort ? internalSort?.key : sortKey;
                const activeSortDir = clientSort ? internalSort?.dir : sortDir;
                const isActive =
                  !!activeSortKey && (activeSortKey === col.key || activeSortKey === sortFieldName);
                const handleClick = () => {
                  if (!isSortable) return;
                  const nextDir: 'asc' | 'desc' =
                    isActive && activeSortDir === 'asc' ? 'desc' : isActive ? 'asc' : 'desc';
                  if (clientSort) {
                    setInternalSort({ key: col.key, dir: nextDir });
                  } else {
                    // Always emit the backend-shaped value so the page can
                    // forward it straight into URL params.
                    onSortChange?.(sortFieldName, nextDir);
                  }
                };
                const resolvedWidth = widthFor(col);
                const resizable = true;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: sortable column header; click-to-sort mirrors the moysklad GWT grid (keyboard-sort tracked as a separate a11y task)
                  <th
                    key={col.key}
                    scope="col"
                    data-col-key={col.key}
                    className={cn(
                      // moysklad list grid headers: brand-blue (#186999),
                      // 11px, normal weight, NORMAL case (no uppercase/
                      // letter-spacing). Measured live against
                      // online.moysklad.uz #purchaseorder — every sortable
                      // column header renders in the link-blue, not a grey
                      // uppercased caption. See docs/audits/
                      // purchase-orders-list-PIXEL-DELTA.md (#1).
                      // (11px → 13px: OWNER-OVERRIDE 2026-07-17, see <table>.)
                      'relative h-9 px-1 font-normal text-[13px] text-[var(--ms-text-brand)]',
                      // table-layout: fixed bilan birga: cell width
                      // resize handle orqali narrow bo'lganida header
                      // matni keyingi cell'ga oqib ketmasligi uchun
                      // overflow: hidden + nowrap (truncate). Sort
                      // indicator alohida span sifatida render qilingani
                      // uchun ham ellipsiz orqali ko'rinmay qoladi —
                      // bu OK, hovering header full text tooltip uchun
                      // title atributi bilan beriladi.
                      'overflow-hidden',
                      // moysklad parity (user 2026-06-22): EVERY column boundary
                      // shows an always-visible vertical separator (not just the
                      // hovered one) so the user sees each column's width/space at
                      // a glance. The 6px resize handle below sits on top and
                      // turns brand-blue on hover for dragging.
                      'border-[var(--ms-border-strong)] border-r last:border-r-0',
                      isSortable &&
                        'cursor-pointer select-none hover:text-[var(--ms-text-primary)]',
                    )}
                    title={typeof col.header === 'string' ? col.header : col.headerText}
                    style={resolvedWidth ? { width: resolvedWidth } : undefined}
                    onClick={isSortable ? handleClick : undefined}
                    aria-sort={
                      isActive ? (activeSortDir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {/* moysklad-parity header: a small reserved box LEFT of the
                        label holds the sort caret (its arrows_down.png ≈ 8×4 dark
                        glyph) — present on every sortable header so the label
                        doesn't shift when sorted; the caret shows only on the
                        active column. Alignment is via flex justify (the th's
                        text-align was dropped). */}
                    <span
                      className={cn(
                        'flex min-w-0 items-center gap-0.5',
                        col.align === 'right'
                          ? 'justify-end'
                          : col.align === 'center'
                            ? 'justify-center'
                            : 'justify-start',
                      )}
                    >
                      {isSortable && (
                        <span className="inline-flex w-2.5 shrink-0 justify-center" aria-hidden>
                          {isActive && (
                            <span
                              style={{
                                width: 0,
                                height: 0,
                                borderLeft: '4px solid transparent',
                                borderRight: '4px solid transparent',
                                ...(activeSortDir === 'asc'
                                  ? { borderBottom: '4px solid #555' }
                                  : { borderTop: '4px solid #555' }),
                              }}
                            />
                          )}
                        </span>
                      )}
                      <span className="truncate">{col.header}</span>
                    </span>
                    {resizable && (
                      // biome-ignore lint/a11y/useFocusableInteractive: column-resize separator is a mouse-only drag handle, intentionally not a tab stop
                      // biome-ignore lint/a11y/useKeyWithClickEvents: onClick only stops propagation; resizing is mouse-drag driven (moysklad grid parity)
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize column"
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-[var(--ms-text-brand)] active:bg-[var(--ms-text-brand)]"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const th = (e.currentTarget as HTMLElement).parentElement;
                          // Uncontrolled + first resize: snapshot EVERY data
                          // column's current rendered width so the switch to
                          // fixed table-layout doesn't collapse the others.
                          if (!columnWidths && Object.keys(internalWidths).length === 0) {
                            const tr = th?.parentElement;
                            if (tr) {
                              const snap: Record<string, number> = {};
                              for (const cell of Array.from(tr.children)) {
                                const k = cell.getAttribute('data-col-key');
                                if (k && cell instanceof HTMLElement) snap[k] = cell.offsetWidth;
                              }
                              if (Object.keys(snap).length > 0) setInternalWidths(snap);
                            }
                          }
                          const startWidth =
                            effectiveWidths[col.key] ??
                            (th instanceof HTMLElement ? th.offsetWidth : 120);
                          setDragState({
                            key: col.key,
                            startX: e.clientX,
                            startWidth,
                            currentWidth: startWidth,
                          });
                        }}
                        data-test-id={`column-resize-${col.key}`}
                      />
                    )}
                  </th>
                );
              })}
              {headerEndSlot && (
                <th
                  scope="col"
                  className="h-9 w-10 px-2 text-right"
                  style={{ width: '2.5rem' }}
                  data-test-id="datatable-header-end-slot"
                >
                  {headerEndSlot}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="h-24 text-center text-[var(--ms-text-muted)] text-sm"
                >
                  Yuklanmoqda...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="p-0">
                  {empty}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const rowKey = String(row[keyField]);
                const rowSelectable = selectable && (canSelect ? canSelect(row) : true);
                const isSelected = selectable && selectedIds?.has(rowKey) === true;
                const rowNavigable = !!onRowClick || !!rowClickOpensPrimaryLink;
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: optional row-click is a mouse affordance; primary navigation is the in-row link (keyboard-reachable)
                  <tr
                    key={rowKey}
                    data-test-id={rowTestId?.(row)}
                    data-selected={isSelected || undefined}
                    onClick={
                      rowNavigable
                        ? (e) => {
                            // Clicks that land on an interactive child (link, button,
                            // checkbox, input, or an opted-out cell) are handled by
                            // that child — never trigger row navigation as well.
                            const el = e.target as HTMLElement;
                            if (
                              el.closest(
                                'a,button,input,select,textarea,label,[role="checkbox"],[data-no-row-nav]',
                              )
                            )
                              return;
                            if (onRowClick) {
                              onRowClick(row);
                              return;
                            }
                            // moysklad parity: clicking anywhere on the row opens the
                            // document — activate the row's primary link (the № cell
                            // <a>), extending the click target to the whole row.
                            (
                              e.currentTarget.querySelector('a[href]') as HTMLAnchorElement | null
                            )?.click();
                          }
                        : undefined
                    }
                    className={cn(
                      'group border-[var(--ms-border-default)] border-t',
                      'transition-colors duration-[var(--ms-duration-fast)]',
                      rowNavigable && 'cursor-pointer',
                      // Hover/selection priority — moysklad keeps the
                      // selected tint visibly DARKER than the hover tint
                      // so a selected row that the cursor passes over
                      // doesn't flash to the lighter hover color and
                      // appear deselected.
                      // moysklad row hover: light-yellow tint. Measured live
                      // on online.moysklad.ru #purchaseorder (climart) — the
                      // hovered row's cells compute to rgb(255,251,140) =
                      // #fffb8c (was a paler #FFF8E1 guess). Distinct from the
                      // blue brand hover used elsewhere. Applied even when
                      // onRowClick is absent — moysklad shows the row
                      // affordance regardless of click semantics.
                      isSelected
                        ? 'bg-[var(--ms-bg-selected)] hover:bg-[color-mix(in_srgb,var(--ms-bg-selected)_85%,black)]'
                        : 'hover:bg-[#fffb8c]',
                      // Opt-in per-row classes (e.g. grey+italic draft rows).
                      rowClassName?.(row),
                    )}
                  >
                    {selectable && (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: onClick only stops row-click propagation so the (keyboard-accessible) checkbox handles selection
                      <td
                        className="w-10 px-1 py-2 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => rowSelectable && toggleOne(rowKey)}
                          disabled={!rowSelectable}
                          aria-label="Select row"
                          data-test-id={`select-row-${rowKey}`}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          // moysklad parity: cells stay on ONE line — never wrap to a
                          // second row when a column is narrowed. Content that doesn't fit
                          // is clipped with an ellipsis (auto table-layout still grows the
                          // column to its content + the table scrolls horizontally; fixed
                          // table-layout during a column-resize truncates instead).
                          'overflow-hidden text-ellipsis whitespace-nowrap px-1 py-2 align-middle',
                          alignMap[col.align ?? 'left'],
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                    {headerEndSlot && (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: onClick only stops row-click propagation so the (keyboard-accessible) ⋮ menu trigger handles activation
                      <td
                        className="w-10 px-1 py-2 text-right align-middle"
                        aria-hidden={!rowActions}
                        onClick={rowActions ? (e) => e.stopPropagation() : undefined}
                      >
                        {rowActions?.(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          {footerRow && rows.length > 0 && (
            <tfoot
              className={cn(
                'border-[var(--ms-border-strong)] border-t-2 bg-[var(--ms-bg-muted)]',
                // fill mode: pin the totals row to the bottom of the scroll box
                // so it stays visible like moysklad's «итоги» strip.
                fillHeight && 'sticky bottom-0 z-[2]',
              )}
            >
              <tr>
                {selectable && <td className="px-1 py-2" aria-hidden />}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      // moysklad parity: footer totals are regular weight
                      // (w400), #222 — not bold. (Measured w400 + the
                      // #purchaseorder screenshot reads as regular weight.)
                      // (11px → 13px: OWNER-OVERRIDE 2026-07-17, see <table>.)
                      'px-1 py-2 font-normal text-[13px] text-[var(--ms-text-primary)] tabular-nums',
                      alignMap[col.align ?? 'left'],
                    )}
                  >
                    {footerRow[col.key] ?? ''}
                  </td>
                ))}
                {headerEndSlot && <td className="w-10 px-2 py-2" aria-hidden />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* fill mode keeps its native scrollbar — the internal scroll box is
          height-bounded, so the bar is already always visible at its bottom. */}
      {!fillHeight && <StickyXScrollbar scrollerRef={scrollerRef} />}
    </div>
  );
}
