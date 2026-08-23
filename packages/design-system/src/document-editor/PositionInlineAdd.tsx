'use client';

import * as Popover from '@radix-ui/react-popover';
import * as React from 'react';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { Button } from '../primitives/Button.tsx';
import { DropdownMenu } from '../primitives/DropdownMenu.tsx';
import { ProductPickModal, type ProductPickModalLabels } from './ProductPickModal.tsx';

/** A product matched from a CSV import line, ready for the parent to append
 *  as a position. `item` is the full catalog hit the parent's `onSearch`
 *  returned (id + label + raw), so the parent has everything it needs to
 *  build a position in its own shape. Price is intentionally NOT imported —
 *  it comes from the product's own price list (avoids any CSV unit/decimal
 *  ambiguity); the user edits prices after import if needed. */
export interface ImportedPosition {
  item: CatalogResult;
  /** Quantity as typed in the CSV (parent validates/normalises). */
  quantity: string;
}

/** Rows shown in the suggestion dropdown before the «Ещё N товаров» footer takes
 *  over. moysklad shows ~10 hits then a remaining-count hint (NO inner scrollbar) —
 *  capping the list lets it size to its content so the footer (create-product) is
 *  always visible without an inner scroll. Narrow the search to see fewer/other hits. */
const DISPLAY_CAP = 10;

type RawIdent = { code?: string | null; article?: string | null; barcodes?: string[] | null };

/** Suggestion shape returned by `onSearch`. */
export interface CatalogResult {
  id: string;
  primary: string;
  secondary?: string;
  /** Product code, shown muted before the name in the rich product dropdown
   *  (moysklad: «06673 Автоматический воздухоотводчик …»). */
  code?: string;
  /** Available stock — rendered as a colour-coded badge (green > 0, red = 0),
   *  right-aligned (moysklad's «Доступно» column inside the suggestion list). */
  available?: number;
  /** Optional thumbnail URL (moysklad shows a product image when one exists). */
  imageUrl?: string | null;
  /** Default/original sale price in MINOR units — shown read-only in the
   *  Band-1 pick modal as «Цена». Filled by the page's onSearch mapping. */
  priceMinor?: string;
  /** Unit label (e.g. «шт») — shown next to «Остаток» in the pick modal. */
  uomLabel?: string;
  raw?: unknown;
}

/** onSearch may return a bare array, or `{ items, total }` so the rich product
 *  dropdown can show «Ещё N товаров» for the hits beyond the page. */
export type CatalogSearchResult = CatalogResult[] | { items: CatalogResult[]; total: number };

/**
 * Resolve one CSV import key against catalog search results: prefer an exact
 * match on code / article / barcode / name (case-insensitive); otherwise, if
 * the search returned exactly one product, take it; else no match (ambiguous
 * → reported as not-found rather than guessing). Pure + exported for tests.
 */
export function findCatalogMatch(results: CatalogResult[], key: string): CatalogResult | undefined {
  const k = key.trim().toLowerCase();
  const exact = results.find((r) => {
    const raw = r.raw as RawIdent | undefined;
    return (
      raw?.code?.toLowerCase() === k ||
      raw?.article?.toLowerCase() === k ||
      raw?.barcodes?.some((b) => b.toLowerCase() === k) ||
      r.primary.toLowerCase() === k
    );
  });
  return exact ?? (results.length === 1 ? results[0] : undefined);
}

/**
 * Inline «Добавить позицию» bar that lives in the footer of every
 * moysklad position table. Mirrors the b-delivery-actionbar:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [Добавить позицию — введите название, код, штрихкод...] │
 *   │ [Добавить из справочника] [Проверить комплектацию]      │
 *   │                                          [Импорт ▾]      │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Type-to-add UX: the user types a product name / code / barcode in
 * the search input and the matching products appear as suggestions
 * (rendered by the parent via `onSearch` + `onPick`). Pressing Enter
 * on an empty input scans the buffer as a barcode (parent handles).
 *
 * Auxiliary buttons:
 *   - «Добавить из справочника» opens the full catalog picker
 *   - «Проверить комплектацию» runs the stock-availability check
 *   - «Импорт ▾» reveals Excel/CSV import options
 *
 * This is a controlled component — it owns only the input value and
 * dropdown-open state. All side effects flow up through the props.
 */
export interface PositionInlineAddProps {
  /** Inline search input placeholder. Defaults to the moysklad string. */
  placeholder?: string;
  /** «Добавить из справочника» button label (localize from the page). */
  addFromCatalogLabel?: string;
  /** «Проверить комплектацию» button label (localize from the page). */
  checkCompletenessLabel?: string;
  /** @deprecated Inline CSV import was removed for moysklad parity (moysklad's
   *  position row has no «Импорт CSV» button, user 2026-06-24). Kept so existing
   *  callers still type-check; the value is ignored — no button renders. */
  importCsvLabel?: string;
  /** Async typeahead — fetches suggestions for the typed query.
   *  Return [] (or `{ items: [], total: 0 }`) to suppress the dropdown. */
  onSearch?: (query: string) => Promise<CatalogSearchResult>;
  /** Fired when the user selects a suggestion or presses Enter on a
   *  unique match (e.g. a scanned barcode). `entry` is present only when the
   *  Band-1 pick modal is enabled (`pickModal`) — it carries the qty + sale
   *  price the user entered. Without the modal, `onPick` fires with `item`
   *  alone (all existing callers).
   *
   *  RETURN VALUE (owner 2026-07-18, modal → table chain): return the id of
   *  the row the pick landed in (new or merged-into) and the bar hands focus
   *  to that row's «Кол-во» cell (selected) so the in-table entry chain
   *  continues (Кол-во → Enter → Цена → Enter → back to this search input).
   *  Return nothing to keep the legacy behavior (focus returns to the search
   *  input right away). */
  onPick?: (
    item: { id: string; primary: string; raw?: unknown },
    entry?: { quantity: string; priceMinor: string; permanent?: boolean },
    // biome-ignore lint/suspicious/noConfusingVoidType: the row id is an OPTIONAL return — `void` keeps legacy no-return handlers assignable while `string | undefined` alone would reject them.
  ) => string | undefined | void;
  /** Band 1 (sales docs): when provided, picking a product opens a small
   *  qty/price modal instead of appending immediately. On save the page's
   *  `onPick` fires with `(item, { quantity, priceMinor })`. `currency`
   *  formats the read-only original price + converts the entered sale price.
   *  `permanentPriceOption: false` hides the sale-only/permanent price scope
   *  checkboxes (purchase/warehouse docs — writing a permanent SALE price from
   *  a buy price would corrupt the product card). */
  pickModal?: {
    labels: ProductPickModalLabels;
    currency: string;
    permanentPriceOption?: boolean;
  };
  /** moysklad rich product dropdown — «Создать новый товар «<query>»» footer
   *  link. When provided, the dropdown renders the rich product layout
   *  (thumbnail · code · highlighted name · «Доступно» badge · sort toggle ·
   *  «Ещё N» / create footer). Without it the dropdown is the plain
   *  primary/secondary list (counterparty pickers etc.). */
  onCreateProduct?: (query: string) => void;
  /** «Сортировать по "Доступно"» toggle label (rich mode). */
  sortAvailableLabel?: string;
  /** Footer «Ещё {count} товаров» — receives the count beyond the shown page. */
  moreItemsLabel?: (count: number) => string;
  /** Footer «Создать новый товар «{query}»» — receives the live query. */
  createProductLabel?: (query: string) => string;
  /** Click handler for «Добавить из справочника» — opens the catalog
   *  modal. Required; without it the button is hidden. */
  onAddFromCatalog?: () => void;
  /** Click handler for «Проверить комплектацию» — runs stock check.
   *  Optional; hidden when undefined (most doc types don't need it). */
  onCheckCompleteness?: () => void;
  /** Extra buttons rendered right after the catalog/completeness buttons —
   *  document-specific bar actions (e.g. Инвентаризация's «Дополнить из
   *  остатков» / «Дополнить из номенклатуры»). Callers own styling/handlers. */
  extraActions?: React.ReactNode;
  /** Items for the «Импорт ▾» dropdown. Empty array hides the button.
   *  Each item: { label, onClick }. */
  importItems?: Array<{ label: React.ReactNode; onClick: () => void }>;
  /** Clear the search input after a pick, instead of keeping the typed text
   *  selected for overwrite (the legacy default). Opt-in per page (supply wants
   *  a clean input so the leftover query doesn't linger). */
  clearQueryOnPick?: boolean;
  /** @deprecated Inline CSV import removed for moysklad parity (2026-06-24) — the
   *  «Импорт CSV» button no longer renders. Kept so existing callers type-check;
   *  the handler is never invoked. (`findCatalogMatch` stays exported for reuse.) */
  onImportPositions?: (rows: ImportedPosition[]) => void;
  /** Disable everything (e.g. document is posted/locked). */
  disabled?: boolean;
  /** Test id base; suffixed with `-input`, `-catalog`, etc. */
  testId?: string;
  className?: string;
}

const DEFAULT_PLACEHOLDER = "Pozitsiya qo'shish — nom, kod, shtrix-kod yoki artikul kiriting";

/** Highlight every (case-insensitive) occurrence of `q` in `text` — mirrors
 *  moysklad's yellow match-highlight inside the product suggestion list. */
function highlightMatch(text: string, q: string): React.ReactNode {
  const query = q.trim();
  if (!query) return text;
  const lower = text.toLowerCase();
  const ql = query.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let idx = lower.indexOf(ql);
  let key = 0;
  while (idx >= 0) {
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <mark
        key={`m${key}`}
        className="rounded-[2px] bg-[var(--ms-warning-100,#ffe9a8)] text-inherit"
      >
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    key += 1;
    i = idx + query.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

export function PositionInlineAdd({
  placeholder = DEFAULT_PLACEHOLDER,
  addFromCatalogLabel = "Katalogdan qo'shish",
  checkCompletenessLabel = 'Komplektni tekshirish',
  onSearch,
  onPick,
  pickModal,
  onCreateProduct,
  sortAvailableLabel,
  moreItemsLabel,
  createProductLabel,
  onAddFromCatalog,
  onCheckCompleteness,
  extraActions,
  importItems = [],
  clearQueryOnPick = false,
  disabled,
  testId,
  className,
}: PositionInlineAddProps) {
  const [query, setQuery] = React.useState('');
  // Rich product dropdown (moysklad parity) is enabled when the parent supplies
  // a create-product handler. «Сортировать по "Доступно"» defaults ON (checked),
  // matching moysklad.
  const richProduct = !!onCreateProduct;
  const [sortByAvailable, setSortByAvailable] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [suggestions, setSuggestions] = React.useState<CatalogResult[]>([]);
  const [open, setOpen] = React.useState(false);
  // Keyboard navigation over the DISPLAYED rows (moysklad parity, owner
  // 2026-07-11): ↓/↑ move the highlight, Enter picks it. -1 = nothing chosen.
  const [activeIdx, setActiveIdx] = React.useState(-1);
  // Band 1: the product awaiting its qty/price in the pick modal (sales docs
  // only — set from `pick` when `pickModal` is supplied). null = modal closed.
  const [pendingPick, setPendingPick] = React.useState<CatalogResult | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const suppressOpenRef = React.useRef(false);
  // moysklad parity (owner 2026-07-11): after a pick the query TEXT STAYS in
  // the input, selected. The parent re-renders on every keystroke/pick and
  // `onSearch` is usually an inline arrow (new identity each render), so the
  // debounce effect re-fires with the SAME query — this ref pins the picked
  // query so those re-fires don't reopen the dropdown until the text changes.
  const pickedQueryRef = React.useRef<string | null>(null);

  // Which query the CURRENT `suggestions` belong to. Enter must never act on a
  // list that belongs to older text: a scanner types the whole code and fires
  // Enter inside the 200ms debounce, so the previous query's single hit was
  // getting added instead (POS fixed this on 2026-08-16; this is the shared
  // document-side twin of that fix).
  const [settledQuery, setSettledQuery] = React.useState<string | null>(null);
  /** Latest typed text — lets an in-flight response detect it is stale. */
  const latestQueryRef = React.useRef(query);
  /** Enter pressed before its results landed; applied when THAT query settles. */
  const pendingEnterRef = React.useRef<string | null>(null);

  // Debounced typeahead. 200ms keeps the input feeling instant on local
  // searches (counterparty list) but doesn't hammer the API for every
  // keystroke when the source is a remote products catalog.
  React.useEffect(() => {
    latestQueryRef.current = query;
    if (!onSearch) return;
    if (query.trim().length < 1) {
      setSuggestions([]);
      setSettledQuery(null);
      pendingEnterRef.current = null;
      setOpen(false);
      return;
    }
    // Post-pick freeze: the picked text intentionally stays in the input —
    // don't re-search/reopen until the user actually edits it.
    if (pickedQueryRef.current !== null) {
      if (query === pickedQueryRef.current) return;
      pickedQueryRef.current = null;
    }
    if (suppressOpenRef.current) {
      suppressOpenRef.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      const q = query;
      try {
        const res = await onSearch(q);
        // A response that lost the race to newer text must not repopulate the
        // list — otherwise Enter could act on it a moment later.
        if (latestQueryRef.current !== q) return;
        const items = Array.isArray(res) ? res : res.items;
        setSuggestions(items);
        setTotal(Array.isArray(res) ? items.length : res.total);
        setActiveIdx(-1);
        setSettledQuery(q);
        // Rich product mode keeps the panel open even with 0 hits so the
        // «Создать новый товар «<query>»» footer is always reachable.
        setOpen(items.length > 0 || richProduct);
        // An Enter that arrived before these results is spent HERE — the
        // keystroke is not lost, it simply waits for its own query. It is
        // consumed on ANY settle (mirrors POS): a park left over from text the
        // user has since edited must not fire later if they type it again.
        const parked = pendingEnterRef.current;
        if (parked !== null) {
          pendingEnterRef.current = null;
          const only = items.length === 1 ? items[0] : undefined;
          if (parked === q && only) pick(only);
        }
      } catch {
        if (latestQueryRef.current !== q) return;
        pendingEnterRef.current = null;
        setSuggestions([]);
        setSettledQuery(q);
        setTotal(0);
        setOpen(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, onSearch, richProduct]);

  // Rich mode sorts by «Доступно» desc when the toggle is on (moysklad parity).
  const shownSuggestions = React.useMemo(() => {
    if (!richProduct || !sortByAvailable) return suggestions;
    return [...suggestions].sort((a, b) => (b.available ?? 0) - (a.available ?? 0));
  }, [suggestions, richProduct, sortByAvailable]);

  // Cap the rendered rows so the dropdown sizes to its content (no inner scroll —
  // moysklad shows ~10 then «Ещё N товаров»). `total` counts ALL server matches, so
  // the footer reports how many remain beyond what's shown.
  const richDisplayed = React.useMemo(
    () => shownSuggestions.slice(0, DISPLAY_CAP),
    [shownSuggestions],
  );
  const plainDisplayed = React.useMemo(() => suggestions.slice(0, DISPLAY_CAP), [suggestions]);
  const hiddenCount = total - (richProduct ? richDisplayed.length : plainDisplayed.length);

  // Row id returned by the page's `onPick` during a MODAL save — consumed by
  // the modal's onCloseAutoFocus (fires after the 150ms close animation, when
  // Radix would otherwise restore focus to the search input) to hand focus to
  // that row's «Кол-во» instead. null = cancel/plain close → focus the input.
  const modalPickedRowIdRef = React.useRef<string | null>(null);

  const focusSearchInput = () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  /** Focus + select the picked row's «Кол-во» cell (owner 2026-07-18: after a
   *  pick the entry continues IN THE TABLE — Кол-во → Enter → Цена → Enter →
   *  back to the search input). Falls back to the search input when the row
   *  isn't in the DOM (e.g. the page didn't append — validation toast). */
  const focusRowQty = (rowId: string | null | undefined) => {
    if (rowId) {
      const qty = document.querySelector(`[data-test-id="pos-${rowId}-qty"]`);
      if (qty instanceof HTMLInputElement && !qty.disabled && !qty.readOnly) {
        qty.focus();
        qty.select();
        return;
      }
    }
    focusSearchInput();
  };

  const finishPick = (
    item: CatalogResult,
    entry?: { quantity: string; priceMinor: string; permanent?: boolean },
    via: 'direct' | 'modal' = 'direct',
  ) => {
    const returned = onPick?.(item, entry);
    const rowId = typeof returned === 'string' ? returned : null;
    suppressOpenRef.current = true;
    // Default (owner 2026-07-11): the query text STAYS, selected — typing replaces
    // it from scratch. `clearQueryOnPick` (supply): wipe it so the leftover search
    // text doesn't linger in the box after the product is added.
    if (clearQueryOnPick) {
      setQuery('');
      pickedQueryRef.current = '';
    } else {
      pickedQueryRef.current = query;
    }
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    if (via === 'modal') {
      // The dialog is still unmounting (150ms close animation) — focusing now
      // would be undone by Radix's own close-autofocus. Stash the target; the
      // onCloseAutoFocus handler below runs at exactly the right moment.
      modalPickedRowIdRef.current = rowId;
      return;
    }
    requestAnimationFrame(() => focusRowQty(rowId));
  };

  const pick = (item: CatalogResult) => {
    if (pickModal) {
      // Band 1 (sales docs): defer the append — open the qty/price modal and
      // let finishPick run on its save. The dropdown closes meanwhile.
      setPendingPick(item);
      setOpen(false);
      setActiveIdx(-1);
      return;
    }
    finishPick(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const displayed = richProduct ? richDisplayed : plainDisplayed;
    if (e.key === 'Enter') {
      // An explicitly highlighted row is always what the user meant.
      const chosen = open && activeIdx >= 0 ? displayed[activeIdx] : undefined;
      if (chosen) {
        e.preventDefault();
        pick(chosen);
        return;
      }
      // No highlight → fall back to a single hit, but ONLY when the list belongs
      // to the text as it stands now. While a search is still in flight (scanner
      // typing + instant Enter) the keystroke is parked and applied when that
      // query's own results land — see the debounce effect.
      if (settledQuery !== query) {
        e.preventDefault();
        pendingEnterRef.current = query;
        return;
      }
      const only = suggestions.length === 1 ? suggestions[0] : undefined;
      if (only) {
        e.preventDefault();
        pick(only);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    } else if (e.key === 'ArrowDown' && displayed.length > 0) {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp' && displayed.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border-[var(--ms-border-default)] border-t bg-[var(--ms-bg-muted)] px-2 py-2',
        className,
      )}
      data-test-id={testId ?? 'position-inline-add'}
    >
      {onSearch && (
        // Radix Popover renders the suggestion list in a PORTAL so it floats
        // above any overflow-clipped ancestor (the position-table scroll area).
        // The old `absolute` list was trapped inside that scroll box and showed
        // an inner scrollbar instead of dropping over the page — moysklad's
        // suggestion list overlays the whole document.
        <Popover.Root
          open={open && (shownSuggestions.length > 0 || richProduct)}
          onOpenChange={(o) => {
            if (!o) setOpen(false);
          }}
        >
          <Popover.Anchor asChild>
            <div className="relative min-w-[300px] flex-1">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder}
                disabled={disabled}
                className="h-9 max-md:h-[36px] w-full rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 text-sm placeholder:text-[var(--ms-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-text-brand)]"
                data-test-id={testId ? `${testId}-input` : 'position-inline-add-input'}
              />
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={4}
              // Keep focus on the search input (typing continues uninterrupted)
              // and never auto-focus the dropdown on open/close.
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              // Clicking back into the input must not be treated as "outside"
              // (which would close the list mid-search).
              onInteractOutside={(e) => {
                if (
                  inputRef.current &&
                  e.target instanceof Node &&
                  inputRef.current.contains(e.target)
                ) {
                  e.preventDefault();
                }
              }}
              className={cn(
                // No inner scroll: the list is capped to DISPLAY_CAP rows so the
                // panel sizes to its content (moysklad parity — ~10 rows + «Ещё N»).
                'z-[var(--ms-z-popover)] rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-elevated)]',
                // moysklad parity: the product suggestion list is much wider than
                // the (often narrow) search input — it shows the full «code · name»
                // on one line. Anchor width is the floor, a comfortable target
                // width the body, the viewport the ceiling. The plain
                // (counterparty) list stays anchor-width: it's just a short
                // label + secondary line.
                richProduct
                  ? 'w-max min-w-[var(--radix-popover-trigger-width)] max-w-[min(46rem,95vw)]'
                  : 'w-[var(--radix-popover-trigger-width)]',
              )}
              data-test-id="position-inline-add-suggestions"
            >
              {richProduct ? (
                <div className="flex flex-col">
                  {/* moysklad header: «Сортировать по "Доступно"» sort toggle. */}
                  {sortAvailableLabel && (
                    <label className="flex cursor-pointer items-center gap-2 border-[var(--ms-border-default)] border-b px-3 py-2 text-[12px] text-[var(--ms-text-muted)]">
                      <input
                        type="checkbox"
                        checked={sortByAvailable}
                        onMouseDown={(e) => e.preventDefault()}
                        onChange={(e) => setSortByAvailable(e.target.checked)}
                        data-test-id="position-inline-add-sort-available"
                      />
                      {sortAvailableLabel}
                    </label>
                  )}
                  <ul>
                    {richDisplayed.map((item, idx) => {
                      const avail = item.available ?? 0;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            // mousedown fires before blur — without it the blur
                            // closes the dropdown before the click registers.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              pick(item);
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]',
                              // ↓/↑ keyboard highlight (moysklad parity): the BLUE
                              // selected tint, never the grey hover tint — the two must
                              // stay distinguishable, and a plain `bg-` loses to the
                              // `hover:` rule on whichever row the pointer rests over.
                              idx === activeIdx
                                ? 'bg-[var(--ms-bg-selected)]'
                                : 'hover:bg-[var(--ms-bg-muted)]',
                            )}
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-5 w-5 shrink-0 rounded-[2px] object-cover"
                              />
                            ) : (
                              <span className="h-5 w-5 shrink-0 rounded-[2px] bg-[var(--ms-bg-muted)]" />
                            )}
                            {item.code && (
                              <span className="shrink-0 text-[var(--ms-text-muted)] tabular-nums">
                                {highlightMatch(item.code, query)}
                              </span>
                            )}
                            <span className="flex-1 truncate">
                              {highlightMatch(item.primary, query)}
                            </span>
                            <span
                              className={cn(
                                'ml-auto shrink-0 rounded-[2px] px-1.5 py-0.5 text-center font-medium text-[11px] text-white tabular-nums',
                                avail > 0
                                  ? 'bg-[var(--ms-success-500)]'
                                  : 'bg-[var(--ms-action-destructive)]',
                              )}
                            >
                              {avail}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {/* moysklad footer: «Ещё N товаров» + «Создать новый товар «q»». */}
                  <div className="flex flex-col border-[var(--ms-border-default)] border-t">
                    {moreItemsLabel &&
                      hiddenCount > 0 &&
                      (onAddFromCatalog ? (
                        // moysklad shows a grey «Ещё N товаров» hint; we keep that look but make
                        // it a clickable shortcut to «Добавить из справочника» (the full catalog)
                        // so the user can actually reach the remaining matches.
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            onAddFromCatalog();
                          }}
                          className="px-3 py-1.5 text-left text-[12px] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]"
                          data-test-id="position-more-items"
                        >
                          {moreItemsLabel(hiddenCount)}
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 text-[12px] text-[var(--ms-text-muted)]">
                          {moreItemsLabel(hiddenCount)}
                        </span>
                      ))}
                    {onCreateProduct && query.trim() && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const q = query.trim();
                          setOpen(false);
                          onCreateProduct(q);
                        }}
                        className="px-3 py-1.5 text-left text-[12px] text-[var(--ms-text-brand)] hover:underline"
                        data-test-id="position-inline-add-create-product"
                      >
                        {createProductLabel ? createProductLabel(query.trim()) : query.trim()}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <ul>
                  {plainDisplayed.map((item, idx) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        // mousedown fires before blur — without it the blur
                        // closes the dropdown before the click registers.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(item);
                        }}
                        className={cn(
                          'flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm',
                          // ↓/↑ keyboard highlight — see the rich list above.
                          idx === activeIdx
                            ? 'bg-[var(--ms-bg-selected)]'
                            : 'hover:bg-[var(--ms-bg-muted)]',
                        )}
                      >
                        <span className="flex-1 truncate font-medium">{item.primary}</span>
                        {item.secondary && (
                          <span className="text-[var(--ms-text-muted)] text-xs">
                            {item.secondary}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {onAddFromCatalog && (
        <Button
          type="button"
          variant="secondary"
          onClick={onAddFromCatalog}
          disabled={disabled}
          data-test-id={testId ? `${testId}-catalog` : 'position-inline-add-catalog'}
        >
          {addFromCatalogLabel}
        </Button>
      )}
      {onCheckCompleteness && (
        <Button
          type="button"
          variant="secondary"
          onClick={onCheckCompleteness}
          disabled={disabled}
          data-test-id={testId ? `${testId}-completeness` : 'position-inline-add-completeness'}
        >
          {checkCompletenessLabel}
        </Button>
      )}
      {extraActions}
      {importItems.length > 0 && (
        <DropdownMenu
          trigger={
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              data-test-id={testId ? `${testId}-import` : 'position-inline-add-import'}
            >
              Import
              <Icons.down className="h-3 w-3" />
            </Button>
          }
        >
          {importItems.map((item, i) => (
            <DropdownMenu.Item
              key={`${i}-${typeof item.label === 'string' ? item.label : ''}`}
              onSelect={item.onClick}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu>
      )}
      {pickModal && (
        // Band 1 (sales docs): the qty/price entry modal. `finishPick` on save
        // appends the row with the entered qty + sale price; cancel/close drops
        // the pending pick without adding anything.
        <ProductPickModal
          open={!!pendingPick}
          onOpenChange={(o) => {
            if (!o) setPendingPick(null);
          }}
          productName={pendingPick?.primary ?? ''}
          available={pendingPick?.available}
          uomLabel={pendingPick?.uomLabel}
          originalPriceMinor={pendingPick?.priceMinor}
          currency={pickModal.currency}
          labels={pickModal.labels}
          permanentPriceOption={pickModal.permanentPriceOption}
          onSave={(entry) => {
            const it = pendingPick;
            setPendingPick(null);
            if (it) finishPick(it, entry, 'modal');
          }}
          onCloseAutoFocus={(e) => {
            // Radix restores focus AFTER the close animation — exactly when the
            // appended row is in the DOM. Save → the new row's «Кол-во» (the
            // in-table chain continues); cancel/Esc → back to the search input.
            e.preventDefault();
            const rowId = modalPickedRowIdRef.current;
            modalPickedRowIdRef.current = null;
            focusRowQty(rowId);
          }}
        />
      )}
    </div>
  );
}
