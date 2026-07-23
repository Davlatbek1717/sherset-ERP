'use client';

import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface ComboboxItem<V extends string = string> {
  value: V;
  label: React.ReactNode;
  /** Optional secondary line shown beneath the label in dropdown OPTIONS only
   *  (not the trigger chip) — e.g. a counterparty's phone under its name, like
   *  moysklad's «Поставщик» filter. Rendered small + muted. */
  sublabel?: React.ReactNode;
  /** Search-friendly text — used by the local filter when `onSearch` is not provided. */
  searchText?: string;
  /** Disabled options can't be picked. */
  disabled?: boolean;
}

export interface ComboboxProps<V extends string = string> {
  value: V | undefined;
  onChange: (next: V | null) => void;
  /** Items to render — caller provides them all (local mode) or fetches on the fly. */
  items: ComboboxItem<V>[];
  /** Async fetcher called as the user types. Replaces local filtering when present. */
  onSearch?: (query: string) => Promise<ComboboxItem<V>[]>;
  /** Placeholder shown in the trigger when no value is selected. */
  placeholder?: string;
  /** Placeholder shown in the search box. */
  searchPlaceholder?: string;
  /** Hint shown below the empty state. */
  emptyText?: string;
  /** Disable the control. */
  disabled?: boolean;
  /** Allow clearing the selection. Default true. */
  clearable?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  /**
   * Classes for the dropdown chevron. Opt-in — borderless in-grid cells (moysklad
   * parity) pass `opacity-0 group-hover:opacity-100` so the caret shows only on row
   * hover/focus. Default keeps it always visible (all other usages unaffected).
   */
  chevronClassName?: string;
  testId?: string;
  ariaLabel?: string;
  /**
   * Controlled open state (opt-in). When provided, the caller owns the dropdown's
   * open/close — e.g. a trailing «+» quick-add button that opens the picker. When
   * omitted the Combobox keeps its own internal state (all existing usages unchanged).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Searchable single-select with async support — sits between `Select`
 * (≤30 fixed options) and `CatalogPicker` (full-page picker for pickable
 * documents). Handles the common "type to find a counterparty / product"
 * pattern.
 *
 * Modes:
 *   • local — `items` is the full list; we filter by `searchText ?? label`
 *     against the typed query.
 *   • async — pass `onSearch`; we debounce 200 ms and call your fetcher.
 *     `items` is then ignored except as the initial render.
 */
export function Combobox<V extends string = string>({
  value,
  onChange,
  items,
  onSearch,
  placeholder = '—',
  searchPlaceholder,
  emptyText,
  disabled,
  clearable = true,
  invalid,
  id,
  className,
  chevronClassName,
  testId,
  ariaLabel,
  open: controlledOpen,
  onOpenChange,
}: ComboboxProps<V>) {
  // Open is controlled when the caller passes `open`; otherwise internal state.
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [asyncItems, setAsyncItems] = React.useState<ComboboxItem<V>[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Debounced async fetch
  React.useEffect(() => {
    if (!onSearch) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const next = await onSearch(query);
        if (!cancelled) {
          setAsyncItems(next);
          setActiveIndex(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, onSearch]);

  const filtered = React.useMemo(() => {
    if (onSearch) return asyncItems ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const text = (item.searchText ?? toText(item.label)).toLowerCase();
      return text.includes(q);
    });
  }, [items, query, onSearch, asyncItems]);

  const selected =
    items.find((it) => it.value === value) ?? asyncItems?.find((it) => it.value === value);

  const handleSelect = (item: ComboboxItem<V>) => {
    onChange(item.value);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item && !item.disabled) handleSelect(item);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          data-testid={testId}
          disabled={disabled}
          className={cn(
            'inline-flex h-[var(--ms-control-h)] w-full items-center justify-between gap-2 px-2 text-[13px]',
            'border bg-[var(--ms-bg-surface)] text-left text-[var(--ms-text-primary)]',
            'transition-colors duration-[var(--ms-duration-fast)]',
            'focus-visible:border-[var(--ms-border-focus)] focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
            // the "color:" arbitrary tag (visually identical) so a caller's
            // `border-transparent` (borderless in-grid cells) dedupes via twMerge.
            invalid
              ? 'border-[var(--ms-action-destructive)]'
              : 'border-[color:var(--ms-border-input)]',
            className,
          )}
        >
          <span
            className={cn('min-w-0 flex-1 truncate', !selected && 'text-[var(--ms-text-muted)]')}
          >
            {selected ? selected.label : placeholder}
          </span>
          {selected && clearable && !disabled && (
            // biome-ignore lint/a11y/useSemanticElements: this clear affordance renders INSIDE the Combobox trigger <button> (which carries `disabled`); a nested <button> is invalid HTML, so role=button + Enter/Space key handlers is the correct ARIA here
            <span
              role="button"
              aria-label="Clear"
              tabIndex={-1}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  handleClear(e as unknown as React.MouseEvent);
              }}
              className="rounded p-0.5 text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)] hover:text-[var(--ms-text-destructive)]"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-[var(--ms-text-muted)]', chevronClassName)}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-[var(--ms-z-popover)] w-[var(--radix-popover-trigger-width)]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]',
            'overflow-hidden',
          )}
        >
          <div className="border-[var(--ms-border-default)] border-b p-2">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder ?? 'Qidirish...'}
              className="h-8 w-full border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] px-2 text-sm focus:border-[var(--ms-border-focus)] focus:outline-none"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-3 text-center text-[var(--ms-text-muted)] text-xs">…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[var(--ms-text-muted)] text-xs">
                {emptyText ?? 'Hech narsa topilmadi'}
              </p>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={item.value}
                  type="button"
                  disabled={item.disabled}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => handleSelect(item)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                    'transition-colors',
                    activeIndex === i && 'bg-[var(--ms-bg-hover)]',
                    item.disabled && 'cursor-not-allowed opacity-50',
                    item.value === value && 'font-medium',
                  )}
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      item.value === value ? 'text-[var(--ms-text-brand)]' : 'opacity-0',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function toText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join(' ');
  if (node && typeof node === 'object' && 'props' in node) {
    return toText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}
