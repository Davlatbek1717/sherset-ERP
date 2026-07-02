'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';
import type { ComboboxItem } from './Combobox.tsx';

export interface MultiComboboxProps<V extends string = string> {
  /** Selected values. */
  value: V[];
  /** Called with the next selection whenever an option is toggled or cleared.
   *  Also receives the toggled item (so callers can keep an id→label map for
   *  rendering chips after a reload / saved-filter restore). */
  onChange: (next: V[], toggled?: ComboboxItem<V>) => void;
  /** Initial / currently-selected items — supplies labels for the trigger even
   *  before any search runs (e.g. restored from a saved filter). */
  items: ComboboxItem<V>[];
  /** Async fetcher called as the user types (debounced 200ms). */
  onSearch?: (query: string) => Promise<ComboboxItem<V>[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

/**
 * Multi-select searchable dropdown with checkboxes — moysklad parity for the
 * filter's «Владелец-отдел» / «Владелец-сотрудник» fields (a dropdown of
 * checkbox options that filters as you type; the panel stays open while you
 * tick several). The single-select sibling is `Combobox`; the full-page picker
 * is `CatalogPicker`.
 *
 * Modes mirror Combobox: local (`items` is the full list, filtered by
 * `searchText ?? label`) or async (`onSearch`, debounced 200ms — `items` then
 * only seeds the trigger labels for already-selected values).
 */
export function MultiCombobox<V extends string = string>({
  value,
  onChange,
  items,
  onSearch,
  placeholder = '—',
  emptyText,
  disabled,
  invalid,
  id,
  className,
  testId,
  ariaLabel,
}: MultiComboboxProps<V>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [asyncItems, setAsyncItems] = React.useState<ComboboxItem<V>[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!onSearch || !open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const next = await onSearch(query);
        if (!cancelled) setAsyncItems(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, onSearch, open]);

  const filtered = React.useMemo(() => {
    if (onSearch) return asyncItems ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const text = (item.searchText ?? toText(item.label)).toLowerCase();
      return text.includes(q);
    });
  }, [items, query, onSearch, asyncItems]);

  // Label lookup across the seed items + the latest async page (so the trigger
  // can render chips for values that aren't in the current search results).
  const labelFor = (v: V): React.ReactNode => {
    const hit = items.find((i) => i.value === v) ?? asyncItems?.find((i) => i.value === v);
    return hit?.label ?? v;
  };

  const toggle = (item: ComboboxItem<V>) => {
    if (item.disabled) return;
    const next = value.includes(item.value)
      ? value.filter((v) => v !== item.value)
      : [...value, item.value];
    onChange(next, item);
  };

  const clearAll = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      {/* moysklad-parity: the FIELD itself is the search box — selected values
          render as inline chips and you type directly in the field to filter the
          options (no separate search input inside the dropdown). */}
      <Popover.Anchor asChild>
        <div
          ref={boxRef}
          data-testid={testId}
          className={cn(
            'flex min-h-[var(--ms-control-h)] w-full flex-wrap items-center gap-1 px-1.5 py-0.5 text-[12px]',
            'border bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)]',
            'cursor-text transition-colors duration-[var(--ms-duration-fast)]',
            'focus-within:outline-none focus-within:border-[var(--ms-border-focus)]',
            disabled && 'cursor-not-allowed bg-[var(--ms-bg-muted)] text-[var(--ms-text-disabled)]',
            invalid ? 'border-[var(--ms-action-destructive)]' : 'border-[var(--ms-border-input)]',
            className,
          )}
          onMouseDown={(e) => {
            if (disabled) return;
            // clicking the box (not a chip's × button) focuses the input + opens
            if ((e.target as HTMLElement).closest('[data-chip-remove]')) return;
            if (e.target !== inputRef.current) {
              e.preventDefault();
              inputRef.current?.focus();
              setOpen(true);
            }
          }}
        >
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex max-w-full items-center gap-1 rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-muted)] py-0.5 pr-1 pl-1.5 text-[11px]"
            >
              <span className="truncate">{labelFor(v)}</span>
              <button
                type="button"
                data-chip-remove
                aria-label="O'chirish"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                className="shrink-0 rounded text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && query === '' && value.length > 0) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length === 0 ? placeholder : ''}
            className="min-w-[60px] flex-1 bg-transparent py-0.5 text-[12px] outline-none placeholder:text-[var(--ms-text-placeholder)] disabled:cursor-not-allowed"
          />
          {value.length > 0 && !disabled && (
            <button
              type="button"
              aria-label="Tozalash"
              onClick={clearAll}
              className="shrink-0 rounded p-0.5 text-[var(--ms-text-muted)] hover:text-[var(--ms-text-destructive)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className="h-4 w-4 shrink-0 cursor-pointer text-[var(--ms-text-muted)]"
            onMouseDown={(e) => {
              e.preventDefault();
              if (disabled) return;
              if (!open) inputRef.current?.focus();
              setOpen((o) => !o);
            }}
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // typing/clicking in the field (the Anchor box) must NOT close it
            if (boxRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className={cn(
            'z-[var(--ms-z-popover)] w-[var(--radix-popover-trigger-width)]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]',
            'overflow-hidden',
          )}
        >
          <div className="max-h-[260px] overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-3 text-center text-[var(--ms-text-muted)] text-xs">…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[var(--ms-text-muted)] text-xs">
                {emptyText ?? 'Hech narsa topilmadi'}
              </p>
            ) : (
              filtered.map((item) => {
                const checked = value.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    disabled={item.disabled}
                    // keep focus in the field's input while toggling (multi-select)
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(item)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      'hover:bg-[var(--ms-bg-hover)]',
                      item.disabled && 'cursor-not-allowed opacity-50',
                      checked && 'font-medium',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--ms-radius-sm)] border',
                        checked
                          ? 'border-[var(--ms-text-brand)] bg-[var(--ms-text-brand)] text-white'
                          : 'border-[var(--ms-border-strong)]',
                      )}
                    >
                      {checked && '✓'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      {item.sublabel != null && (
                        <span className="block truncate text-[11px] text-[var(--ms-text-muted)] leading-tight">
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
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
