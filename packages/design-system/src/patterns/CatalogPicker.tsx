'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { Pencil, X } from 'lucide-react';
import * as React from 'react';
import { EmptyState } from '../feedback/EmptyState.tsx';
import { Icons } from '../icons/action-icons.ts';
import { cn } from '../lib/cn.ts';
import { parkInitialFocus } from '../lib/dialog-guards.ts';
import { Button } from '../primitives/Button.tsx';
import { Input } from '../primitives/Input.tsx';

/**
 * Universal catalog picker modal — used to select one or many items
 * from any entity catalog (Product, Counterparty, ProductFolder, ...).
 *
 * Design: search-driven list, keyboard-navigable, optional quick-create.
 * Mirrors Moysklad's "Выбрать из справочника" modal pattern.
 */

export interface PickerItem {
  id: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  meta?: React.ReactNode;
  disabled?: boolean;
}

export interface CatalogPickerProps<T = unknown> {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Source of items — async search */
  fetcher: (search: string) => Promise<Array<PickerItem & { raw?: T }>>;
  onSelect: (item: PickerItem & { raw?: T }) => void;
  onCreate?: () => void;
  createLabel?: string;
  searchPlaceholder?: string;
  emptyTitle?: React.ReactNode;
  emptyDescription?: React.ReactNode;
  /** Show when no selection should clear */
  clearable?: boolean;
  onClear?: () => void;
  testId?: string;
}

/**
 * App-root injector for CatalogPicker's localized defaults. Without it the
 * picker's Uzbek string defaults («Qidirish...», «Topilmadi», «Yuklanmoqda...»,
 * «Bekor qilish», «Tozalash», «Yopish», «Tanlash», «Tanlang...») leak into the
 * RU UI — the same design-system-default-leak bug-class already fixed for
 * Modal (ModalLabelsProvider), ConfirmDialog, EditForm and PositionEditor.
 *
 * Resolve order for every string is: explicit per-call-site prop → this
 * injected value → Uzbek hard fallback (kept so callers outside the provider,
 * e.g. tests/storybook, still render). Six of the strings (loading text, the
 * close/clear/pick aria-labels and the footer clear/cancel buttons) have NO
 * prop at all and ALWAYS leaked before this — they read from the context here.
 */
export interface CatalogPickerLabels {
  searchPlaceholder?: string;
  createLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  loadingLabel?: string;
  clearLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  pickLabel?: string;
  fieldPlaceholder?: string;
}

const CatalogPickerLabelsContext = React.createContext<CatalogPickerLabels>({});

export function CatalogPickerLabelsProvider({
  labels,
  children,
}: {
  labels: CatalogPickerLabels;
  children: React.ReactNode;
}) {
  const {
    searchPlaceholder,
    createLabel,
    emptyTitle,
    emptyDescription,
    loadingLabel,
    clearLabel,
    cancelLabel,
    closeLabel,
    pickLabel,
    fieldPlaceholder,
  } = labels;
  const value = React.useMemo<CatalogPickerLabels>(
    () => ({
      searchPlaceholder,
      createLabel,
      emptyTitle,
      emptyDescription,
      loadingLabel,
      clearLabel,
      cancelLabel,
      closeLabel,
      pickLabel,
      fieldPlaceholder,
    }),
    [
      searchPlaceholder,
      createLabel,
      emptyTitle,
      emptyDescription,
      loadingLabel,
      clearLabel,
      cancelLabel,
      closeLabel,
      pickLabel,
      fieldPlaceholder,
    ],
  );
  return (
    <CatalogPickerLabelsContext.Provider value={value}>
      {children}
    </CatalogPickerLabelsContext.Provider>
  );
}

function useCatalogPickerLabels(): CatalogPickerLabels {
  return React.useContext(CatalogPickerLabelsContext);
}

export function CatalogPicker<T = unknown>({
  open,
  onClose,
  title,
  fetcher,
  onSelect,
  onCreate,
  createLabel,
  searchPlaceholder,
  emptyTitle,
  emptyDescription,
  clearable,
  onClear,
  testId,
}: CatalogPickerProps<T>) {
  // Resolve each string: explicit prop → app-root injected default → Uzbek fallback.
  const labels = useCatalogPickerLabels();
  const resolvedCreateLabel = createLabel ?? labels.createLabel ?? "Yangi qo'shish";
  const resolvedSearchPlaceholder = searchPlaceholder ?? labels.searchPlaceholder ?? 'Qidirish...';
  const resolvedEmptyTitle = emptyTitle ?? labels.emptyTitle ?? 'Topilmadi';
  const resolvedEmptyDescription =
    emptyDescription ??
    labels.emptyDescription ??
    "Qidiruv so'rovni o'zgartiring yoki yangi yozuv qo'shing";
  const resolvedLoadingLabel = labels.loadingLabel ?? 'Yuklanmoqda...';
  const resolvedClearLabel = labels.clearLabel ?? 'Tozalash';
  const resolvedCancelLabel = labels.cancelLabel ?? 'Bekor qilish';
  const resolvedCloseLabel = labels.closeLabel ?? 'Yopish';
  const [search, setSearch] = React.useState('');
  const [items, setItems] = React.useState<Array<PickerItem & { raw?: T }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Fetch on search change (debounced)
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await fetcher(search);
        if (!cancelled) {
          setItems(rows);
          setHighlight(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, search, fetcher]);

  // Focus input when opened
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = items[highlight];
      if (picked && !picked.disabled) {
        onSelect(picked);
        onClose();
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[400] bg-black/40 data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content
          data-test-id={testId ?? 'catalog-picker'}
          aria-describedby={undefined}
          // Accidental-close guard (same contract as <Modal>): a picker holds a
          // typed search and a half-made selection, so only the ✕ / footer
          // buttons close it — never Escape, never a click on the dimmer.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          // Boshlang'ich fokus ✕ da qolmasin (skanerning Enter'i yopib
          // yubormasin); ichkarida `autoFocus` bo'lsa u yutadi.
          onOpenAutoFocus={parkInitialFocus}
          className={cn(
            '-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-[400]',
            'w-full max-w-xl bg-[var(--ms-bg-surface)]',
            'rounded-[var(--ms-radius-md)] shadow-[var(--ms-shadow-lg)]',
            'flex max-h-[85vh] flex-col',
          )}
        >
          <header className="flex items-center justify-between border-[var(--ms-border-default)] border-b px-4 py-3">
            <Dialog.Title className="font-semibold text-base">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[var(--ms-radius-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
                aria-label={resolvedCloseLabel}
                data-test-id="catalog-picker-close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="border-[var(--ms-border-default)] border-b px-4 py-3">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              leading={<Icons.search className="h-4 w-4" />}
              onKeyDown={handleKeyDown}
              data-test-id="catalog-picker-search"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-[var(--ms-text-muted)] text-sm">
                {resolvedLoadingLabel}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title={resolvedEmptyTitle}
                description={resolvedEmptyDescription}
                action={
                  onCreate ? (
                    <Button size="sm" onClick={onCreate}>
                      <Icons.create className="h-4 w-4" />
                      {resolvedCreateLabel}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div
                // biome-ignore lint/a11y/useSemanticElements: async search picker — a native <select>/<option> can't carry the two-line item layout (primary + secondary + meta) or the hover/keyboard highlight; role="listbox"/"option" is the correct ARIA here
                role="listbox"
                tabIndex={-1}
                className="py-1"
              >
                {items.map((item, i) => (
                  <div key={item.id}>
                    <button
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: see the listbox container above — option role on a styled button (cannot be a native <option>)
                      role="option"
                      aria-selected={i === highlight}
                      disabled={item.disabled}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => {
                        if (!item.disabled) {
                          onSelect(item);
                          onClose();
                        }
                      }}
                      data-test-id={`catalog-picker-option-${item.id}`}
                      className={cn(
                        'flex w-full flex-col gap-0.5 px-4 py-2 text-left text-sm',
                        'transition-colors duration-[var(--ms-duration-fast)]',
                        item.disabled
                          ? 'cursor-not-allowed opacity-50'
                          : i === highlight
                            ? 'bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                            : 'hover:bg-[var(--ms-bg-hover)]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{item.primary}</span>
                        {item.meta && (
                          <span className="shrink-0 text-[var(--ms-text-muted)] text-xs">
                            {item.meta}
                          </span>
                        )}
                      </div>
                      {item.secondary && (
                        <span className="text-[var(--ms-text-muted)] text-xs">
                          {item.secondary}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-[var(--ms-border-default)] border-t px-4 py-3">
            <div>
              {clearable && onClear && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onClear();
                    onClose();
                  }}
                  data-test-id="catalog-picker-clear"
                >
                  {resolvedClearLabel}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {onCreate && items.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCreate}
                  data-test-id="catalog-picker-create"
                >
                  <Icons.create className="h-4 w-4" />
                  {resolvedCreateLabel}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={onClose}>
                {resolvedCancelLabel}
              </Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Convenience wrapper: input-like button that opens a CatalogPicker
 * when clicked. Use inside forms when user needs to pick a reference.
 */
export interface CatalogPickerFieldProps {
  value: { id: string; label: string } | null;
  placeholder?: string;
  onPick: () => void;
  onClear?: () => void;
  /**
   * Optional «+» quick-create handler. When provided, a tiny `+`
   * button appears between the picker text and the search icon
   * (mirrors moysklad's `add-button` next to Контрагент / Проект /
   * Договор pickers — clicking it opens a quick-create modal or
   * navigates to the entity's /new page). Hidden when undefined.
   */
  onCreate?: () => void;
  /** Tooltip / aria-label for the «+» button. */
  createLabel?: string;
  /**
   * Optional «✎» edit handler. When provided AND a value is selected, a pencil
   * button appears (mirrors moysklad's edit-pencil next to Организация /
   * Контрагент / Склад that opens the linked entity for editing). Hidden when
   * undefined or when no value is selected.
   */
  onEdit?: () => void;
  /** Tooltip / aria-label for the «✎» button. */
  editLabel?: string;
  disabled?: boolean;
  /**
   * Tooltip shown on hover when the field is disabled. Used by
   * dependent filters (e.g. «Kontragent hisobi» tells the user
   * «Avval kontragentni tanlang»). Falls back to no tooltip.
   */
  disabledHint?: string;
  invalid?: boolean;
  testId?: string;
  /**
   * Extra classes on the field wrapper — lets a caller override the resting box
   * (e.g. an in-grid country cell goes borderless: `border-transparent bg-transparent
   * hover:border-…`). Appended last so it wins the cn() merge.
   */
  fieldClassName?: string;
  /**
   * moysklad-parity INLINE type-to-search. When provided, the field becomes an
   * editable input: typing fires this debounced fetcher and shows an inline
   * autocomplete dropdown (anchored + portaled, so it never gets clipped by a
   * scrolling parent). The chevron still opens the full picker modal (`onPick`)
   * as the "browse from catalogue" secondary path. When omitted, the field keeps
   * its legacy button→modal behaviour (backward compatible for all call sites).
   */
  inlineFetcher?: (search: string) => Promise<PickerItem[]>;
  /** Called when a row in the inline dropdown is chosen. Required for inline mode. */
  onInlineSelect?: (item: PickerItem) => void;
  /** Placeholder for the inline search input while focused (defaults to field placeholder). */
  searchPlaceholder?: string;
}

export function CatalogPickerField(props: CatalogPickerFieldProps) {
  // moysklad parity: when a fetcher is supplied, render the inline type-to-search
  // variant; otherwise keep the legacy button-opens-modal field.
  if (props.inlineFetcher && props.onInlineSelect) {
    return <InlineCatalogPickerField {...props} />;
  }
  return <LegacyCatalogPickerField {...props} />;
}

function LegacyCatalogPickerField({
  value,
  onPick,
  onClear,
  onCreate,
  createLabel,
  onEdit,
  editLabel,
  disabled,
  disabledHint,
  invalid,
  testId,
  fieldClassName,
}: CatalogPickerFieldProps) {
  // Resolve each string: explicit prop → app-root injected default → Uzbek fallback.
  // moysklad parity: reference fields show NO placeholder when empty (the field's
  // left label names it), so the `placeholder` prop is intentionally not rendered.
  const labels = useCatalogPickerLabels();
  const resolvedCreateLabel = createLabel ?? labels.createLabel ?? "Yangi qo'shish";
  const resolvedClearLabel = labels.clearLabel ?? 'Tozalash';
  const resolvedPickLabel = labels.pickLabel ?? 'Tanlash';
  const resolvedEditLabel = editLabel ?? 'Tahrirlash';
  return (
    <div
      className={cn(
        'flex h-[var(--ms-control-h)] w-full min-w-0 items-center gap-1 pr-0.5 pl-2',
        'border bg-[var(--ms-bg-surface)]',
        'transition-colors duration-[var(--ms-duration-fast)]',
        disabled
          ? 'cursor-not-allowed bg-[var(--ms-bg-muted)] text-[var(--ms-text-disabled)]'
          : invalid
            ? 'border-[color:var(--ms-action-destructive)]'
            : // moysklad parity: #bfbfbf resting control border. "color:" tag so a
              // caller's `border-transparent` (borderless grid cell) can override it.
              'border-[color:var(--ms-border-input)]',
        fieldClassName,
      )}
      data-test-id={testId}
      title={disabled ? disabledHint : undefined}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="min-w-0 flex-1 truncate text-left text-[13px] focus:outline-none"
        data-test-id={testId ? `${testId}-pick` : undefined}
      >
        {/* moysklad parity: empty reference field shows nothing (no placeholder). */}
        {value ? <span>{value.label}</span> : <span>&nbsp;</span>}
      </button>
      {value && onClear && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
          aria-label={resolvedClearLabel}
          data-test-id={testId ? `${testId}-clear` : undefined}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {value && onEdit && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]"
          aria-label={resolvedEditLabel}
          title={resolvedEditLabel}
          data-test-id={testId ? `${testId}-edit` : undefined}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      {onCreate && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onCreate}
          className="h-4 w-4 shrink-0 text-[var(--ms-text-brand)]"
          aria-label={resolvedCreateLabel}
          title={resolvedCreateLabel}
          data-test-id={testId ? `${testId}-create` : undefined}
        >
          <Icons.create className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onPick}
        disabled={disabled}
        className="h-4 w-4 shrink-0"
        aria-label={resolvedPickLabel}
      >
        {/* moysklad parity: picker fields visually present as dropdowns
            with a chevron — even though the click opens a search picker
            dialog. */}
        <Icons.down className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * moysklad-parity inline reference field: the control IS an editable search
 * input. Typing fires `inlineFetcher` (debounced) and shows an anchored,
 * portaled autocomplete dropdown (name + secondary line, e.g. phone/code).
 * The chevron opens the full `CatalogPicker` modal (`onPick`) as the browse
 * path. Portaling the dropdown fixes the "parent has overflow → dropdown gets
 * clipped / pushed down" bug present in the old inline list.
 */
function InlineCatalogPickerField({
  value,
  onClear,
  onCreate,
  createLabel,
  onEdit,
  editLabel,
  disabled,
  disabledHint,
  invalid,
  testId,
  inlineFetcher,
  onInlineSelect,
}: CatalogPickerFieldProps) {
  // moysklad parity: no placeholder on reference fields (left label names them).
  const labels = useCatalogPickerLabels();
  const resolvedCreateLabel = createLabel ?? labels.createLabel ?? "Yangi qo'shish";
  const resolvedClearLabel = labels.clearLabel ?? 'Tozalash';
  const resolvedPickLabel = labels.pickLabel ?? 'Tanlash';
  const resolvedEditLabel = editLabel ?? 'Tahrirlash';
  const resolvedLoadingLabel = labels.loadingLabel ?? 'Yuklanmoqda...';
  const resolvedEmptyTitle = labels.emptyTitle ?? 'Topilmadi';

  const [focused, setFocused] = React.useState(false);
  // null = not typing yet (show the selected label, select-all on focus so a
  // keystroke replaces it); string = the user's live query.
  const [query, setQuery] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<PickerItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const term = query ?? '';
  React.useEffect(() => {
    if (!focused || !inlineFetcher) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await inlineFetcher(term);
        if (!cancelled) {
          setItems(rows);
          setHighlight(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [focused, term, inlineFetcher]);

  const open = focused && !disabled && (loading || items.length > 0);
  const displayValue = query === null ? (value?.label ?? '') : query;

  const select = (item: PickerItem) => {
    if (item.disabled) return;
    onInlineSelect?.(item);
    setQuery(null);
    setFocused(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = items[highlight];
      if (picked) select(picked);
    } else if (e.key === 'Escape') {
      setQuery(null);
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={(o) => !o && setFocused(false)}>
      <Popover.Anchor asChild>
        <div
          className={cn(
            'flex h-[var(--ms-control-h)] w-full min-w-0 items-center gap-1 pr-0.5 pl-2',
            'border bg-[var(--ms-bg-surface)]',
            'transition-colors duration-[var(--ms-duration-fast)]',
            disabled
              ? 'cursor-not-allowed bg-[var(--ms-bg-muted)] text-[var(--ms-text-disabled)]'
              : invalid
                ? 'border-[var(--ms-action-destructive)]'
                : // moysklad parity: #bfbfbf resting control border.
                  'border-[var(--ms-border-input)] focus-within:border-[var(--ms-border-focus)]',
          )}
          data-test-id={testId}
          title={disabled ? disabledHint : undefined}
        >
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            placeholder=""
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
            onFocus={() => {
              setFocused(true);
              setQuery(null);
              requestAnimationFrame(() => inputRef.current?.select());
            }}
            onBlur={() => {
              // keep query=null on revert so the selected label re-shows
              setQuery(null);
              setFocused(false);
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'min-w-0 flex-1 truncate border-0 bg-transparent text-[13px] outline-none',
              'placeholder:text-[var(--ms-text-placeholder)]',
              'disabled:cursor-not-allowed',
            )}
            data-test-id={testId ? `${testId}-input` : undefined}
          />
          {value && onClear && !disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClear}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--ms-radius-default)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-hover)]"
              aria-label={resolvedClearLabel}
              data-test-id={testId ? `${testId}-clear` : undefined}
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {value && onEdit && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onEdit}
              className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]"
              aria-label={resolvedEditLabel}
              title={resolvedEditLabel}
              data-test-id={testId ? `${testId}-edit` : undefined}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onCreate && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCreate}
              className="h-4 w-4 shrink-0 text-[var(--ms-text-brand)]"
              aria-label={resolvedCreateLabel}
              title={resolvedCreateLabel}
              data-test-id={testId ? `${testId}-create` : undefined}
            >
              <Icons.create className="h-4 w-4" />
            </Button>
          )}
          {/* moysklad parity: the chevron opens the INLINE dropdown (anchored list) — NOT
              a modal. It toggles the same focus-driven suggest list as clicking/typing in
              the field. (`onPick`/the CatalogPicker modal is the legacy field's path only.) */}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (disabled) return;
              if (open) {
                setFocused(false);
                inputRef.current?.blur();
              } else {
                inputRef.current?.focus();
              }
            }}
            disabled={disabled}
            className="h-4 w-4 shrink-0"
            aria-label={resolvedPickLabel}
            data-test-id={testId ? `${testId}-pick` : undefined}
          >
            <Icons.down className="h-4 w-4" />
          </Button>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn(
            // moysklad parity: the dropdown is at least as wide as the field but
            // grows to fit the option text, so a NARROW reference input (e.g.
            // «Организация») still shows full names — capped to a comfortable
            // width / the viewport. The inner scroll box carries the sizing so
            // `w-max` is computed from its content (Content just clips corners).
            'z-[var(--ms-z-popover)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(36rem,95vw)]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-md)]',
            'overflow-hidden',
          )}
          data-test-id={testId ? `${testId}-dropdown` : undefined}
        >
          <div className="max-h-[260px] w-max min-w-[var(--radix-popover-trigger-width)] max-w-[min(36rem,95vw)] overflow-y-auto py-1">
            {loading && items.length === 0 ? (
              <p className="px-3 py-3 text-center text-[var(--ms-text-muted)] text-xs">
                {resolvedLoadingLabel}
              </p>
            ) : items.length === 0 ? (
              <p className="px-3 py-3 text-center text-[var(--ms-text-muted)] text-xs">
                {resolvedEmptyTitle}
              </p>
            ) : (
              items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(item)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-1.5 text-left text-[13px]',
                    'transition-colors duration-[var(--ms-duration-fast)]',
                    item.disabled
                      ? 'cursor-not-allowed opacity-50'
                      : i === highlight
                        ? 'bg-[var(--ms-bg-selected)] text-[var(--ms-text-brand)]'
                        : 'hover:bg-[var(--ms-bg-hover)]',
                  )}
                  data-test-id={testId ? `${testId}-option-${item.id}` : undefined}
                >
                  <span className="flex items-center justify-between gap-2">
                    {/* nowrap (not truncate) so the option text drives the
                        dropdown's `w-max` width — the whole name stays visible. */}
                    <span className="whitespace-nowrap">{item.primary}</span>
                    {item.meta && (
                      <span className="shrink-0 text-[11px] text-[var(--ms-text-muted)]">
                        {item.meta}
                      </span>
                    )}
                  </span>
                  {item.secondary && (
                    <span className="truncate text-[11px] text-[var(--ms-text-muted)]">
                      {item.secondary}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
