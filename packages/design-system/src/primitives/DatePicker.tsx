'use client';

import * as Popover from '@radix-ui/react-popover';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface DatePickerProps {
  /** ISO date string `YYYY-MM-DD` or null. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Earliest allowed date (inclusive), `YYYY-MM-DD`. */
  min?: string;
  /** Latest allowed date (inclusive), `YYYY-MM-DD`. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  /** First day of the week — 1 = Monday (default), 0 = Sunday. */
  weekStartsOn?: 0 | 1;
  /** Locale used to label months/weekdays. Default 'uz-UZ'. */
  locale?: string;
  /** Renders a trailing "Today" shortcut. Default true. */
  showToday?: boolean;
  id?: string;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  /** Custom trigger element, replacing the default date-button. Lets callers
   *  render e.g. an icon-only or combined date+time trigger (moysklad «от»
   *  single field) while reusing this calendar popover. */
  trigger?: React.ReactNode;
}

/**
 * Date picker with a 7-column calendar grid. No external dep — all date
 * math is inline.
 *
 * Why not date-fns directly? `@moysklad/ui` deliberately keeps zero
 * runtime data deps; the consuming app already has date-fns and uses it
 * for parsing. This component speaks the canonical YYYY-MM-DD wire format
 * and lets callers convert.
 *
 * Keyboard support: arrow keys move the focused day, PageUp/Down change
 * month, Shift+PageUp/Down change year, Enter picks, Escape closes.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'дд.мм.гггг',
  disabled,
  invalid,
  clearable = true,
  weekStartsOn = 1,
  locale = 'uz-UZ',
  showToday = true,
  id,
  className,
  testId,
  ariaLabel,
  trigger,
}: DatePickerProps) {
  const today = startOfDay(new Date());
  const valueDate = value ? parseIso(value) : null;
  const [open, setOpen] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState<Date>(() => valueDate ?? today);
  const [focusedDay, setFocusedDay] = React.useState<Date>(() => valueDate ?? today);

  React.useEffect(() => {
    // Resync the calendar viewport when the value changes externally.
    // Depend on the wire-format `value` string (stable across renders) —
    // depending on `valueDate` would re-fire every render since parseIso()
    // creates a new Date each time, causing an infinite popover→focus
    // re-render loop in tests + dev StrictMode.
    if (value) {
      const d = parseIso(value);
      setViewMonth(d);
      setFocusedDay(d);
    }
  }, [value]);

  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(viewMonth);

  const weekdays = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const ref = new Date(2024, 0, 1); // Monday 2024-01-01
    const out: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(ref);
      d.setDate(ref.getDate() + ((weekStartsOn + i) % 7) - 1);
      out.push(fmt.format(d));
    }
    return out;
  }, [locale, weekStartsOn]);

  const grid = buildGrid(viewMonth, weekStartsOn);

  // moysklad parity: the «Сегодня»/«Очистить» shortcuts must follow the active
  // locale (the month/weekday labels already do via Intl). Hardcoded Latin-uz
  // «Bugun»/«Tozalash» leaked into the RU calendar popover. Derive from the
  // `locale` prop (default uz, preserving prior behaviour).
  const lang = locale.slice(0, 2).toLowerCase();
  const todayLabel = lang === 'ru' ? 'Сегодня' : lang === 'en' ? 'Today' : 'Bugun';
  const clearLabel = lang === 'ru' ? 'Очистить' : lang === 'en' ? 'Clear' : 'Tozalash';

  const isOutOfRange = (d: Date) => (minDate && d < minDate) || (maxDate && d > maxDate);

  const pick = (d: Date) => {
    if (isOutOfRange(d)) return;
    onChange(formatIso(d));
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const day = focusedDay;
    let next = day;
    if (e.key === 'ArrowLeft') next = addDays(day, -1);
    else if (e.key === 'ArrowRight') next = addDays(day, 1);
    else if (e.key === 'ArrowUp') next = addDays(day, -7);
    else if (e.key === 'ArrowDown') next = addDays(day, 7);
    else if (e.key === 'PageUp') next = e.shiftKey ? addMonths(day, -12) : addMonths(day, -1);
    else if (e.key === 'PageDown') next = e.shiftKey ? addMonths(day, 12) : addMonths(day, 1);
    else if (e.key === 'Enter') {
      e.preventDefault();
      pick(day);
      return;
    } else if (e.key === 'Escape') {
      setOpen(false);
      return;
    } else {
      return;
    }
    e.preventDefault();
    setFocusedDay(next);
    if (
      next.getMonth() !== viewMonth.getMonth() ||
      next.getFullYear() !== viewMonth.getFullYear()
    ) {
      setViewMonth(next);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            id={id}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            data-testid={testId}
            disabled={disabled}
            className={cn(
              'inline-flex h-[var(--ms-control-h)] w-full items-center justify-between gap-2 px-2 text-[12px]',
              'border bg-[var(--ms-bg-surface)] text-left text-[var(--ms-text-primary)]',
              'transition-colors duration-[var(--ms-duration-fast)]',
              'focus-visible:outline-none focus-visible:border-[var(--ms-border-focus)]',
              'disabled:cursor-not-allowed disabled:bg-[var(--ms-bg-muted)] disabled:text-[var(--ms-text-disabled)]',
              invalid
                ? 'border-[var(--ms-action-destructive)]'
                : // moysklad parity: #bfbfbf resting control border.
                  'border-[var(--ms-border-input)]',
              className,
            )}
          >
            <span className={cn(!value && 'text-[var(--ms-text-muted)]')}>
              {value ? formatPretty(parseIso(value), locale) : placeholder}
            </span>
            <Calendar className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onKeyDown={onKey}
          className={cn(
            'z-[var(--ms-z-popover)] w-[290px]',
            'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
            'bg-[var(--ms-bg-surface)] p-3 shadow-[var(--ms-shadow-md)]',
            'focus:outline-none',
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              aria-label="Previous month"
              className="rounded p-1 hover:bg-[var(--ms-bg-hover)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold text-[var(--ms-text-primary)] text-sm capitalize">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              aria-label="Next month"
              className="rounded p-1 hover:bg-[var(--ms-bg-hover)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-[var(--ms-text-muted)] uppercase">
            {weekdays.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {grid.map((d) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const selected = value ? isSameDay(d, parseIso(value)) : false;
              const isToday = isSameDay(d, today);
              const focused = isSameDay(d, focusedDay);
              const oor = isOutOfRange(d) ?? false;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={oor}
                  tabIndex={focused ? 0 : -1}
                  onClick={() => pick(d)}
                  className={cn(
                    'relative flex h-8 w-full items-center justify-center rounded-[var(--ms-radius-default)] text-sm',
                    'transition-colors',
                    !inMonth && 'text-[var(--ms-text-muted)]',
                    inMonth &&
                      !selected &&
                      'text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-hover)]',
                    selected &&
                      'bg-[var(--ms-action-primary)] font-semibold text-white hover:bg-[var(--ms-action-primary-hover)]',
                    isToday && !selected && 'ring-1 ring-[var(--ms-action-primary)] ring-inset',
                    oor && 'cursor-not-allowed opacity-30',
                    focused && !selected && 'ring-1 ring-[var(--ms-border-focus)] ring-inset',
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-[var(--ms-border-default)] border-t pt-2">
            {showToday ? (
              <button
                type="button"
                onClick={() => pick(today)}
                className="text-[var(--ms-text-brand)] text-xs hover:underline"
              >
                {todayLabel}
              </button>
            ) : (
              <span />
            )}
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[var(--ms-text-muted)] text-xs hover:text-[var(--ms-text-destructive)] hover:underline"
              >
                {clearLabel}
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// --- date helpers (no deps; exported for unit tests) ----------------------

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameDay(a: Date, b: Date | null): boolean {
  if (!b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + n);
  return next;
}

export function addMonths(d: Date, n: number): Date {
  const next = new Date(d);
  next.setMonth(d.getMonth() + n);
  return next;
}

export function parseIso(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return startOfDay(new Date());
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatPretty(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Build a 6-row × 7-col matrix that includes leading/trailing days from
 * the neighbouring months — same approach moysklad's calendar uses so the
 * grid never reflows between months.
 */
export function buildGrid(month: Date, weekStartsOn: 0 | 1): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -offset);
  const out: Date[] = [];
  for (let i = 0; i < 42; i += 1) out.push(addDays(start, i));
  return out;
}
