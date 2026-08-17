'use client';

import * as React from 'react';
import { DataTable, type DataTableColumn } from '../data-display/DataTable.tsx';
import { EmptyState } from '../feedback/EmptyState.tsx';
import { ErrorState } from '../feedback/ErrorState.tsx';
import { Icons } from '../icons/action-icons.ts';
import { Container } from '../layout/Container.tsx';
import { PageHeader } from '../layout/PageHeader.tsx';
import { cn } from '../lib/cn.ts';
import { Pagination } from '../navigation/Pagination.tsx';
import { Button } from '../primitives/Button.tsx';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';
import { Input } from '../primitives/Input.tsx';

export interface ListViewFilter {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

/**
 * Single item in a moysklad-style toolbar dropdown menu
 * (Изменить ▾ / Создать ▾ / Печать ▾ / Отправить ▾).
 */
export interface ListToolbarMenuItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Insert a `<DropdownMenu.Separator>` BEFORE this item. */
  dividerBefore?: boolean;
}

/**
 * moysklad-parity «Запросить форму» block — a promo footer rendered at the
 * bottom of the Печать dropdown. Live structure on online.moysklad.uz
 * #purchaseorder: a `print-custom-template-request-header` title, an
 * explanatory subtitle, and a «Как запросить» button. moysklad shows it on
 * every document's Печать menu (request a custom print form). Optional —
 * only rendered when a page provides it.
 */
export interface ListToolbarMenuRequestForm {
  header: string;
  subtitle: string;
  buttonLabel: string;
  onRequest: () => void;
}

/**
 * Config for one of the four standard moysklad toolbar dropdowns.
 * When passed to ListView, renders a `<DropdownMenu>` with the moysklad
 * label as its trigger button.
 */
export interface ListToolbarMenu {
  /** Defaults to the Russian moysklad standard label
   *  (Изменить / Создать / Печать / Отправить). */
  label?: React.ReactNode;
  items: ListToolbarMenuItem[];
  /** Force-disabled regardless of items (e.g. "Изменить" needs ≥1 selection). */
  disabled?: boolean;
  /** Test id suffix; defaults to the slot key. */
  testId?: string;
  /** moysklad-parity «Запросить форму» promo block rendered under the
   *  menu items (Печать only). */
  requestForm?: ListToolbarMenuRequestForm;
}

export interface ListViewProps<T> {
  /** Page title */
  title: React.ReactNode;
  /** Subtitle / breadcrumb */
  subtitle?: React.ReactNode;
  /** Create button action */
  onCreate?: () => void;
  createLabel?: string;
  createHref?: string;
  /** Search */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Hover help on the search box — moysklad shows «По умолчанию содержит»
   *  (the list search matches substrings by default) as the search input's
   *  `title` on every list (grounded live #customerorder + #counterparty,
   *  2026-06-20: a single element with title="По умолчанию содержит" at the
   *  search box). Rendered as the native hover tooltip, matching moysklad. */
  searchTooltip?: string;
  /** Filter toggle buttons (e.g. Active / Archived) */
  filters?: ListViewFilter[];
  /** Table */
  columns: DataTableColumn<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  // Sherset KEEP (counterparties row-hover) — B3
  onRowMouseEnter?: (row: T) => void;
  onRowMouseLeave?: () => void;
  rowTestId?: (row: T) => string | undefined;
  /** Per-row hover actions (⋮ menu) rendered in the trailing cell. Forwarded to DataTable. */
  rowActions?: (row: T) => React.ReactNode;
  /** Optional per-row classes (e.g. grey+italic draft rows). Forwarded to DataTable. */
  rowClassName?: (row: T) => string | undefined;
  /** Pagination */
  total: number;
  limit: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Offset-pagination extras (moysklad-style jump-to-page). When provided, the
   *  Pagination shows a real first/last + an absolute "M-N" range; cursor-only
   *  lists omit these and keep the page-1-reset / "+1" fallbacks. */
  onFirst?: () => void;
  onLast?: () => void;
  /** Absolute 0-based offset of the first row on the current page (offset mode). */
  paginationOffset?: number;
  /** States */
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** Empty */
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  /** Extra actions (dropdown, bulk, etc.) */
  extraActions?: React.ReactNode;
  /**
   * Actions rendered BEFORE the inline search box in moyskladToolbar
   * mode — typically the Filter toggle button. Allows the page to
   * split toolbar slots so search + selection counter sit between
   * the Filter toggle and the bulk-action dropdowns (i-default.png).
   */
  extraActionsLeft?: React.ReactNode;
  /**
   * Position of the create button in the toolbar.
   * - 'end' (default): Button appears AFTER all extras (existing behaviour).
   * - 'start': Button appears BEFORE extras — used by moysklad-parity
   *   pages where the primary CTA is the leftmost item on the toolbar
   *   (matches the i-default.png screenshot for customer-orders /
   *   demands / invoices-out, where + Заказ / + Отгрузка / + Счёт
   *   sit immediately before the Filter and Bulk-action triggers).
   */
  createPosition?: 'start' | 'end';
  /**
   * Enable the moysklad-style toolbar layout where title, refresh /
   * help icons, search, selection counter and all action buttons
   * sit on a single row (title flush-left, controls flowing right
   * inline). Verified against d-default.png + i-default.png.
   *
   * When this is true:
   *  - `hideTitle` is ignored (title is always rendered).
   *  - The search input is rendered INLINE in the toolbar row
   *    (between Filter and the bulk-action dropdowns), instead of
   *    in its own row below.
   *  - The selection counter (selectionCount) is rendered next to
   *    the search input.
   *  - The standard separate "filters bar" row is suppressed.
   */
  moyskladToolbar?: boolean;
  /** Callback for the ↻ refresh icon next to the title. */
  onRefresh?: () => void;
  /** Callback for the (?) help icon to the left of the title. */
  onHelp?: () => void;
  /** Selection counter rendered between search and the bulk-action
   *  dropdowns when `moyskladToolbar` is true. */
  selectionCount?: number;
  /**
   * Optional content rendered between the toolbar and the table —
   * used by moysklad parity pages to host the InlineFilterPanel.
   */
  headerSlot?: React.ReactNode;
  /**
   * Optional left rail rendered BESIDE the table area only (catalog folder
   * tree). moysklad parity: the toolbar + filter panel span full width, and
   * the folder sidebar starts below them, next to the rows — not beside the
   * whole view. When omitted, the table area renders full-width as before.
   */
  sidebar?: React.ReactNode;
  /**
   * When provided, REPLACES the table + pagination body region entirely with
   * this node (e.g. a moysklad «Столбцы» kanban board). The toolbar, filter
   * tabs and `headerSlot` still render above it; the caller owns the body's
   * own loading / empty / error / scroll. Opt-in — when omitted the standard
   * DataTable body renders as before.
   */
  body?: React.ReactNode;
  /**
   * Forwarded to DataTable: rendered as the last cell of the table
   * header row. Used for the moysklad-parity column-visibility gear
   * (popover with column checkboxes + row count toggle). Pages pass
   * a `<ColumnCustomizer>` here.
   */
  headerEndSlot?: React.ReactNode;
  /**
   * Forwarded to DataTable: controlled per-column widths (px) +
   * resize callback. Pages pair these with `useColumnWidths` for
   * localStorage persistence. When omitted, columns are non-resizable.
   */
  columnWidths?: Record<string, number>;
  onColumnResize?: (key: string, widthPx: number) => void;
  testId?: string;
  /**
   * Row selection (moysklad parity: bulk actions). Passing these three
   * turns on the leading checkbox column in the underlying DataTable.
   */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  canSelect?: (row: T) => boolean;
  /**
   * Rendered between the filter row and the table when `selectedIds` is
   * non-empty. Typically a `<BulkActionBar>`.
   */
  bulkActionBar?: React.ReactNode;
  /**
   * Forwarded to DataTable: only columns whose key is in this set render.
   * Caller typically pairs this with `<ColumnCustomizer>` in `extraActions`.
   */
  visibleColumnKeys?: Set<string>;
  /**
   * Optional sum-row rendered under the table (moysklad's "0,00" strip).
   * Keys map to column.key; values render right-aligned in the column's
   * own alignment. Forwarded to DataTable's `footerRow`.
   */
  footerRow?: Record<string, React.ReactNode>;
  /**
   * moysklad parity: a node rendered right-aligned on the pagination row
   * (e.g. the «Показать итоги»/«Скрыть итоги» totals toggle). Opt-in — large
   * lists collapse the «Итого» strip behind this link so the all-pages
   * aggregate isn't computed until the user asks for it.
   */
  footerToggle?: React.ReactNode;
  /**
   * moysklad parity: fill the viewport height so the table body scrolls
   * internally while the header stays pinned at the top and the `footerRow`
   * totals strip stays pinned at the bottom (always visible regardless of
   * row count). Forwarded to DataTable's `fillHeight`. Opt-in — off by
   * default so existing content-height list pages are untouched.
   */
  fillHeight?: boolean;
  /**
   * Click-to-sort headers — forwarded straight to DataTable. Pages that
   * want sortable columns set `sortable: true` on the relevant
   * DataTableColumn entries, then plumb `sortKey` + `sortDir` from
   * their useState and pipe `onSortChange` back into the API query
   * key + URL params. The DataTable renders the ▲/▼ indicator on the
   * active column and a hover affordance on every other sortable one.
   */
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
  /**
   * When true, the page-level title + subtitle row is hidden — matches
   * moysklad pages where the title is implicit (the active sub-nav tab
   * already labels the screen). The create button is still rendered
   * inside the toolbar via the create-action slot.
   */
  hideTitle?: boolean;
  /**
   * Rich empty state — moysklad's onboarding-style illustration +
   * heading + primary CTA + secondary resource links. Shown when the
   * list is empty AND no filter / search is active. When the user has
   * narrowed the result set with a filter, the simple `emptyTitle` /
   * `emptyDescription` strings render instead (so the view doesn't
   * show "create your first" when the data is just hidden).
   */
  richEmpty?: {
    illustration?: React.ReactNode; // SVG / image node, ~280px wide
    heading: React.ReactNode;
    cta: { label: React.ReactNode; href?: string; onClick?: () => void };
    /** Optional helper link under the CTA ("приемку создайте"). */
    helper?: { label: React.ReactNode; href: string };
    /** Optional resource cards (Руководство / Обучающее видео / Подробный видеокурс). */
    resources?: Array<{ label: React.ReactNode; href: string; icon?: React.ReactNode }>;
  };
  /**
   * When the user has narrowed the list with search/filter and we want
   * the rich empty hidden in favour of a simpler "no results" message.
   * Caller passes true when search.length > 0 OR a filter is active.
   * Defaults to false.
   */
  hasActiveFilter?: boolean;
  /**
   * Typed moysklad-parity toolbar dropdowns.
   *
   * When provided, ListView renders the 4 standard moysklad dropdowns
   * (Изменить ▾ / Создать ▾ / Печать ▾ / Отправить ▾) in that exact
   * order BEFORE the `extraActions` slot. Pages just pass the items
   * config — no manual DropdownMenu wiring needed.
   *
   * The `editMenu` is auto-disabled when `selectionCount=0` because
   * moysklad's "Изменить" only applies to selected rows (bulk edit).
   *
   * For backward compat, pages can still pass dropdown JSX via
   * `extraActions` — they'll render AFTER the typed dropdowns.
   */
  editMenu?: ListToolbarMenu;
  /** moysklad «Статус ▾» — bulk FSM transitions (Провести / Снять / Отменить)
   *  on the selected rows. Rendered right after editMenu (Изменить · Статус ·
   *  Печать order). Like editMenu, shown disabled when nothing is selected. */
  statusMenu?: ListToolbarMenu;
  createDocMenu?: ListToolbarMenu;
  printMenu?: ListToolbarMenu;
  sendMenu?: ListToolbarMenu;
}

export function ListView<T extends object>({
  title,
  subtitle,
  onCreate,
  createLabel = 'Yangi',
  createHref,
  search,
  onSearchChange,
  searchPlaceholder = 'Qidirish...',
  searchTooltip = 'По умолчанию содержит',
  filters,
  columns,
  rows,
  keyField,
  onRowClick,
  onRowMouseEnter,
  onRowMouseLeave,
  rowTestId,
  rowActions,
  rowClassName,
  total,
  limit,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  onFirst,
  onLast,
  paginationOffset,
  loading,
  error,
  onRetry,
  emptyTitle = "Yozuvlar yo'q",
  emptyDescription,
  extraActions,
  extraActionsLeft,
  createPosition = 'end',
  moyskladToolbar = false,
  onRefresh,
  onHelp,
  selectionCount,
  headerSlot,
  sidebar,
  body,
  headerEndSlot,
  columnWidths,
  onColumnResize,
  testId,
  selectable,
  selectedIds,
  onSelectionChange,
  canSelect,
  bulkActionBar,
  visibleColumnKeys,
  footerRow,
  footerToggle,
  fillHeight,
  sortKey,
  sortDir,
  onSortChange,
  hideTitle,
  richEmpty,
  hasActiveFilter,
  editMenu,
  statusMenu,
  createDocMenu,
  printMenu,
  sendMenu,
}: ListViewProps<T>) {
  // moysklad parity: the «+ Document» create button uses a circled-plus (⊕),
  // matching the sprite on moysklad's toolbar create buttons.
  const CreateIcon = Icons.createCircle;
  const SearchIcon = Icons.search;

  /**
   * Render one of the 4 standard moysklad toolbar dropdowns.
   * Returns null if the config is missing or has no items (and isn't
   * an "always show" menu like editMenu which renders disabled).
   */
  const renderListToolbarMenu = (
    menu: ListToolbarMenu | undefined,
    defaultLabel: string,
    slotKey: string,
    forceShowEvenIfEmpty = false,
  ): React.ReactNode => {
    if (!menu) return null;
    if (menu.items.length === 0 && !forceShowEvenIfEmpty) return null;
    const isDisabled = menu.disabled === true || (menu.items.length === 0 && forceShowEvenIfEmpty);
    const testId = menu.testId ?? `toolbar-${slotKey}`;
    return (
      <DropdownMenu
        key={slotKey}
        align="end"
        trigger={
          <Button
            variant="secondary"
            disabled={isDisabled}
            data-test-id={`${testId}-trigger`}
            className="gap-1"
          >
            {/* moysklad parity: the «Печать» toolbar button carries a printer
                icon (measured live #purchaseorder — hasImg). Изменить/Создать
                have none. */}
            {slotKey === 'print' && <Icons.print aria-hidden className="h-4 w-4" />}
            {menu.label ?? defaultLabel}
            <span aria-hidden className="text-[var(--ms-text-muted)] text-xs">
              ▾
            </span>
          </Button>
        }
        testId={testId}
      >
        {menu.items.map((item, idx) => (
          <React.Fragment key={item.id}>
            {item.dividerBefore && idx > 0 && <DropdownMenu.Separator />}
            <DropdownMenu.Item
              onSelect={item.onSelect}
              disabled={item.disabled}
              destructive={item.destructive}
              icon={item.icon}
            >
              {item.label}
            </DropdownMenu.Item>
          </React.Fragment>
        ))}
        {/* moysklad-parity «Запросить форму» footer block — a header +
            subtitle + «Как запросить» button, separated from the print
            items above. Plain (non-DM.Item) content so it isn't a
            keyboard-navigable menu row, matching moysklad's promo block. */}
        {menu.requestForm && (
          <div
            className="mt-1 border-[var(--ms-border-default)] border-t px-2 pt-2 pb-1"
            data-test-id={`${testId}-request-form`}
          >
            <div className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
              {menu.requestForm.header}
            </div>
            <p className="mt-0.5 max-w-[230px] text-[11px] text-[var(--ms-text-muted)] leading-snug">
              {menu.requestForm.subtitle}
            </p>
            <button
              type="button"
              onClick={menu.requestForm.onRequest}
              className="mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 text-[11px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
              data-test-id={`${testId}-request-form-btn`}
            >
              {menu.requestForm.buttonLabel}
            </button>
          </div>
        )}
      </DropdownMenu>
    );
  };

  /**
   * Standard moysklad dropdowns in their canonical order:
   *   Изменить ▾ → Создать ▾ → Печать ▾ → Отправить ▾
   *
   * editMenu is treated specially: shown even when items=[] (renders
   * disabled) IF selectionCount is a number — moysklad always renders
   * the "Изменить" trigger so the user sees the affordance.
   */
  // moysklad parity labels — UZ defaults so non-overriding callers don't leak
  // Russian into the toolbar. Pages can still pass `label={...}` to override.
  const toolbarDropdownNodes = [
    renderListToolbarMenu(editMenu, "O'zgartirish", 'edit', typeof selectionCount === 'number'),
    renderListToolbarMenu(statusMenu, 'Holat', 'status', typeof selectionCount === 'number'),
    renderListToolbarMenu(createDocMenu, 'Yaratish', 'create-doc'),
    renderListToolbarMenu(printMenu, 'Chop etish', 'print'),
    renderListToolbarMenu(sendMenu, 'Yuborish', 'send'),
  ].filter(Boolean);
  // moysklad-parity: the Изменить/Создать/Печать/Отправить triggers render as ONE
  // joined SEGMENTED group (shared outer border + radius, thin dividers between,
  // no per-button border/radius). The container clips the inner triggers; the
  // dropdown panels are portaled (Radix), so `overflow-hidden` never clips them.
  const toolbarDropdowns =
    toolbarDropdownNodes.length > 0 ? (
      <div
        className="inline-flex items-center divide-x divide-[var(--ms-border-default)] overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] [&_button]:rounded-none [&_button]:border-0"
        data-test-id="toolbar-action-group"
      >
        {toolbarDropdownNodes}
      </div>
    ) : null;

  const createBtn =
    onCreate || createHref ? (
      createHref ? (
        <a
          href={createHref}
          data-test-id="entity-create"
          // moysklad parity (RE-GROUNDED 2026-06-28 — pixel-sampled the live
          // captures of BOTH #purchaseorder AND #invoicein): the list "+ Document"
          // button is a GRAY-bordered WHITE button (b-popup-button-gray:
          // transparent fill, ~1px #ccc border, #222 text) with the leading "⊕"
          // circle-plus icon coloured BLUE (sampled avg #428cc3 ≈ --ms-brand-400),
          // NOT green. The earlier "green +icon" claim (2026-06-16) was a
          // mis-grounding — moysklad's create ⊕ is the same sky-blue on every
          // list; green stays reserved for Save/Найти (apply) actions only.
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--ms-radius-default)] border border-[#cccccc] bg-[var(--ms-bg-surface)] px-4 font-medium text-[var(--ms-text-primary)] text-sm transition-colors hover:bg-[var(--ms-bg-muted)]"
        >
          <CreateIcon className="h-4 w-4 text-[var(--ms-brand-400)]" />
          {createLabel}
        </a>
      ) : (
        <Button onClick={onCreate} variant="secondary" data-test-id="entity-create">
          <CreateIcon className="h-4 w-4 text-[var(--ms-brand-400)]" />
          {createLabel}
        </Button>
      )
    ) : null;

  return (
    <Container
      size="full"
      className="flex min-h-0 flex-1 flex-col gap-4 py-4"
      data-test-id={testId}
    >
      {moyskladToolbar ? (
        /* moysklad single-row toolbar — exact order from i-default.png:
           [?] Title [↻]    [+ Create] [▲ Filter-toggle (in extraActions)]
           [search 280px] [0 counter] [Изменить ▾] [Статус ▾] [Создать ▾]
           [Печать ▾] [Столбцы]
           Search and counter live BETWEEN the filter-toggle and the
           bulk-action dropdowns — not at the end. The page renders
           extraActions in two groups via slots:
             extraActionsLeft  — the filter-toggle button only
             extraActions      — everything after the counter (dropdowns) */
        <div className="flex flex-wrap items-center gap-2" data-test-id="toolbar-moysklad">
          {onHelp && (
            <button
              type="button"
              onClick={onHelp}
              aria-label="help"
              className="rounded-full p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
              data-test-id="toolbar-help"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">
                ?
              </span>
            </button>
          )}
          <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl leading-none">
            {title}
          </h1>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              aria-label="refresh"
              className="rounded-full p-1 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)]"
              data-test-id="toolbar-refresh"
            >
              <Icons.refresh className="h-4 w-4" />
            </button>
          )}
          {/* moysklad parity: primary create button sits IMMEDIATELY right
              of the title. No spacer — all toolbar items flow close
              together (cf. «Заказы поставщикам ↻ + Заказ Фильтр […]»
              in i-default.png). The earlier `flex-1` between create and
              Filter pushed the action group to the right edge, which
              didn't match moysklad. */}
          {createPosition === 'start' && createBtn}
          {/* Filter toggle goes here — page passes it as extraActionsLeft. */}
          {extraActionsLeft}
          {onSearchChange && (
            <Input
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              // moysklad parity: hover help «По умолчанию содержит» on the
              // search box (grounded live #customerorder + #counterparty).
              title={searchTooltip}
              // moysklad parity (measured live #purchaseorder): the list
              // search box is a plain text field with NO leading magnifier
              // icon — just the placeholder. Width ~206px.
              trailing={
                search ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Tozalash"
                    title="Tozalash"
                    className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]"
                    data-test-id="search-clear"
                  >
                    ×
                  </button>
                ) : undefined
              }
              // Mobile: full-row search (its own wrapped line) — the fixed
              // 206px box left an awkward stub next to wrapped toolbar items.
              //
              // Kenglik O'RAMDA (2026-08-17): `trailing` uzatilgani uchun Input
              // doim `<div class="relative">` bilan o'raladi va aynan O'SHA div
              // toolbar flex-item'i bo'ladi. Kenglik inputda qolsa, o'ram
              // kontent bo'yicha qisqarib, mobil «to'liq qator» buzilardi
              // (bu ilgari matn terilgan holatda allaqachon yuz berardi).
              wrapperClassName="w-[206px] max-md:w-full max-md:min-w-0"
              data-test-id="search-input"
            />
          )}
          {typeof selectionCount === 'number' && (
            // moysklad parity (measured live #purchaseorder): the toolbar
            // selection counter is PLAIN text (class selected-count-label,
            // rgb(34,34,34) #222, 12px) between the search input and the
            // bulk-action dropdowns — NOT a bordered box with a checkbox icon
            // or a brand tint.
            <span
              className="inline-flex h-9 items-center px-2 text-[12px] text-[var(--ms-text-primary)] tabular-nums"
              data-test-id="toolbar-selection-count"
              title={
                selectionCount > 0
                  ? `${selectionCount} ta qator tanlangan`
                  : 'Hech narsa tanlanmagan'
              }
              aria-label={`${selectionCount} ta qator tanlangan`}
            >
              {selectionCount}
            </span>
          )}
          {/* moysklad canonical order is Изменить → Создать → Печать →
              Отправить, with Печать (printMenu) appearing LAST. Pages
              that pass bulk dropdowns via the `extraActions` slot
              expect those (e.g. O'zgartirish/Yaratish) BEFORE the
              typed printMenu — so render extraActions first, then
              toolbarDropdowns. */}
          {extraActions}
          {toolbarDropdowns}
          {createPosition === 'end' && createBtn}
        </div>
      ) : hideTitle ? (
        // moysklad-parity toolbar — single row of: extras + create. The
        // page title is conveyed by the active sub-nav tab on the line
        // above (rendered by AppLayout), so no separate <PageHeader>
        // is needed.
        (extraActions || createBtn || editMenu || createDocMenu || printMenu || sendMenu) && (
          <div className="flex flex-wrap items-center justify-end gap-2" data-test-id="toolbar">
            {createPosition === 'start' && createBtn}
            {toolbarDropdowns}
            {extraActions}
            {createPosition === 'end' && createBtn}
          </div>
        )
      ) : (
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={
            <>
              {createPosition === 'start' && createBtn}
              {toolbarDropdowns}
              {extraActions}
              {createPosition === 'end' && createBtn}
            </>
          }
        />
      )}

      {/* moysklad-parity FSM filter tabs (Все | Черновик | Проведён |
          Оплачен) — rendered ABOVE the inline filter panel in moysklad
          mode and as part of the filters-bar row in legacy mode.
          Verified against /invoices-out screenshot (climart.biznesjon.uz)
          where the tabs sit between the toolbar and the search input. */}
      {moyskladToolbar && filters && filters.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1 rounded-[var(--ms-radius-default)] bg-[var(--ms-bg-surface)] p-1"
          data-test-id="filters-tabs"
        >
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={f.onClick}
              className={cn(
                'rounded-[var(--ms-radius-default)] px-3 py-1.5 font-medium text-sm transition-colors',
                f.active
                  ? 'bg-[var(--ms-text-brand)] text-white'
                  : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]',
              )}
              data-test-id={`filter-${f.key}`}
              aria-pressed={f.active}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* moysklad-parity inline filter panel slot — rendered between
          the toolbar and the search/table area, lets the caller host
          a full <InlineFilterPanel> with all filter fields. */}
      {headerSlot}

      {/* In moysklad mode, search is already in the toolbar above —
          suppress the separate filters-bar row. */}
      {!moyskladToolbar && (onSearchChange || filters) && (
        <div className="flex flex-wrap items-center gap-2" data-test-id="filters-bar">
          {onSearchChange && (
            <Input
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              // moysklad parity: hover help «По умолчанию содержит» on the search box.
              title={searchTooltip}
              leading={<SearchIcon className="h-4 w-4" />}
              className="max-w-md"
              data-test-id="search-input"
            />
          )}
          {filters && (
            <div className="flex overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
              {filters.map((f, i) => (
                <Button
                  key={f.key}
                  variant={f.active ? 'primary' : 'tertiary'}
                  size="sm"
                  onClick={f.onClick}
                  className={cn(
                    'rounded-none border-0',
                    i > 0 && 'border-[var(--ms-border-default)] border-l',
                  )}
                  data-test-id={`filter-${f.key}`}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {(() => {
        // moysklad «Столбцы» kanban (or any caller-owned body) replaces the whole
        // table + pagination region; the toolbar + filters above still render. A
        // sidebar (folder tree) rail, if any, is preserved beside the body.
        if (body !== undefined) {
          return sidebar ? (
            <div
              className="flex min-h-0 flex-1 items-stretch gap-0 max-md:flex-col max-md:[&>*:first-child]:w-full"
              data-test-id="listview-body-with-sidebar"
            >
              {sidebar}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</div>
            </div>
          ) : (
            body
          );
        }
        const tableBody = error ? (
          <ErrorState
            title="Ma'lumotni yuklashda xato"
            description={error.message}
            onRetry={onRetry}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {bulkActionBar}
            <DataTable
              columns={columns}
              rows={rows}
              keyField={keyField}
              onRowClick={onRowClick}
              onRowMouseEnter={onRowMouseEnter}
              onRowMouseLeave={onRowMouseLeave}
              // moysklad parity: every list row opens its document on click anywhere
              // in the row (not just the № link). ListView is the list-page pattern,
              // so this is always on; DataTable falls back to the row's primary <a>
              // when the page passes no explicit onRowClick (which is every page).
              rowClickOpensPrimaryLink
              rowTestId={rowTestId}
              rowActions={rowActions}
              rowClassName={rowClassName}
              loading={loading}
              selectable={selectable}
              selectedIds={selectedIds}
              onSelectionChange={onSelectionChange}
              canSelect={canSelect}
              visibleColumnKeys={visibleColumnKeys}
              footerRow={footerRow}
              fillHeight={fillHeight}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={onSortChange}
              headerEndSlot={headerEndSlot}
              columnWidths={columnWidths}
              onColumnResize={onColumnResize}
              empty={
                richEmpty && !hasActiveFilter ? (
                  // moysklad-style onboarding empty: 2-col grid (left =
                  // copy + CTA, right = illustration). Matches the
                  // /purchaseorder, /demand, /supply ... screens 1:1.
                  <div className="grid grid-cols-1 gap-6 px-8 py-12 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="max-w-xl space-y-4">
                      <h2 className="font-semibold text-2xl text-[var(--ms-text-primary)] leading-tight">
                        {richEmpty.heading}
                      </h2>
                      <div className="pt-2">
                        {richEmpty.cta.href ? (
                          <a
                            href={richEmpty.cta.href}
                            className="inline-flex h-12 items-center gap-2 rounded-[var(--ms-radius-md)] bg-[var(--ms-text-success)] px-6 font-medium text-base text-white shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ms-text-success)_85%,black)]"
                          >
                            <span aria-hidden className="text-xl leading-none">
                              +
                            </span>
                            {richEmpty.cta.label}
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={richEmpty.cta.onClick}
                            className="inline-flex h-12 items-center gap-2 rounded-[var(--ms-radius-md)] bg-[var(--ms-text-success)] px-6 font-medium text-base text-white shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--ms-text-success)_85%,black)]"
                          >
                            <span aria-hidden className="text-xl leading-none">
                              +
                            </span>
                            {richEmpty.cta.label}
                          </button>
                        )}
                      </div>
                      {richEmpty.helper && (
                        <p className="text-[var(--ms-text-muted)] text-sm">
                          <a
                            href={richEmpty.helper.href}
                            className="text-[var(--ms-text-brand)] underline-offset-2 hover:underline"
                          >
                            {richEmpty.helper.label}
                          </a>
                        </p>
                      )}
                      {richEmpty.resources && richEmpty.resources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
                          {richEmpty.resources.map((res) => (
                            <a
                              key={res.href}
                              href={res.href}
                              className="inline-flex items-center gap-2 text-[var(--ms-text-brand)] text-sm hover:underline"
                            >
                              {res.icon}
                              <span>{res.label}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                    {richEmpty.illustration && (
                      <div className="hidden lg:block">{richEmpty.illustration}</div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={createBtn}
                  />
                )
              }
            />

            {((total > 0 && onPrevious && onNext) || footerToggle) && (
              <div className="flex items-center justify-between gap-2 max-md:flex-wrap">
                {total > 0 && onPrevious && onNext ? (
                  <Pagination
                    total={total}
                    limit={limit}
                    hasPrevious={hasPrevious}
                    hasNext={hasNext}
                    onPrevious={onPrevious}
                    onNext={onNext}
                    /* Offset («page») callers pass real `onFirst`/`onLast` (jump to
                 the first/last page) + a `paginationOffset` for the absolute
                 "M-N" range. Cursor-only lists fall back to the approximations:
                 onFirst = reset-to-page-1 (onPrevious), onLast = +1 page
                 (onNext) — a true last-page jump needs an offset the cursor API
                 doesn't expose. */
                    onFirst={onFirst ?? (moyskladToolbar && hasPrevious ? onPrevious : undefined)}
                    onLast={onLast ?? (moyskladToolbar && hasNext ? onNext : undefined)}
                    offset={paginationOffset}
                    visibleCount={rows.length}
                    /* Always the moysklad-parity icon-only pager («1-N из total»
                 + chevron buttons). moysklad.uz renders pagination as
                 image buttons with NO «Предыдущая/Следующая» text (capture:
                 `<td class="pages">1-1 из 0</td>` + `next-page` <img>), so
                 the old text style ("Oldingi/Keyingi") was both a parity gap
                 AND a Latin-uz i18n leak in the RU UI. The range connector
                 «из»/«dan» + button aria-labels come from
                 PaginationLabelsProvider (app root). */
                    moyskladStyle
                  />
                ) : (
                  <span />
                )}
                {footerToggle}
              </div>
            )}
          </div>
        );
        // moysklad parity: when a sidebar (folder tree) is supplied, it sits
        // BESIDE the table area only — the toolbar + filter above stay full
        // width. Without a sidebar, the table area renders exactly as before.
        // Either way the body region is a flex-1 column so the grid fills the
        // remaining viewport height and the pagination footer pins.
        return sidebar ? (
          <div
            className="flex min-h-0 flex-1 items-stretch gap-0 max-md:flex-col max-md:[&>*:first-child]:w-full"
            data-test-id="listview-body-with-sidebar"
          >
            {sidebar}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{tableBody}</div>
          </div>
        ) : (
          tableBody
        );
      })()}
    </Container>
  );
}
