'use client';

/**
 * Period picker with moysklad-style shortcut row — `вч · сег · нед · мес`.
 *
 * Source: moysklad's filter panel — the label row is
 *   `● Период:   вч · сег · нед · мес`
 * and below it sits the date-range pair
 *   `[📅 from] — [📅 to]`
 *
 * To compose this layout the picker is split into two named exports:
 *   - `<PeriodShortcuts>` — just the shortcut links (pass as
 *     InlineFilterPanel.Field's `inlineSuffix` so they sit inline with
 *     the field label).
 *   - `<PeriodInputs>`   — just the two native date inputs (the field's
 *     children).
 *
 * The legacy `<PeriodPicker>` combines both vertically and is kept
 * for callers that render a period picker outside a filter panel.
 *
 * Shortcuts:
 *   вч  (yesterday)         from = today-1,  to = today-1
 *   сег (today)             from = today,    to = today
 *   нед (week-to-date)      from = today-7,  to = today
 *   мес (month-to-date)     from = today-30, to = today
 */

import * as React from 'react';
import { DatePicker, todayIso } from '../primitives/DatePicker.tsx';

export interface PeriodPickerLabels {
  /** "вчера" abbreviated. */
  yesterday: string;
  /** "сегодня" abbreviated. */
  today: string;
  /** "неделя" abbreviated. */
  week: string;
  /** "месяц" abbreviated. */
  month: string;
}

const DEFAULT_LABELS: PeriodPickerLabels = {
  yesterday: 'вч',
  today: 'сег',
  week: 'нед',
  month: 'мес',
};

// Local calendar «today» — the old local-midnight → toISOString version was
// ALWAYS one day behind in UTC+5 (owner bug 2026-07-11: «Сегодня» = yesterday
// on every filter shortcut). shiftIso below stays UTC-internal: it does pure
// string date arithmetic on an ISO day, which is timezone-free.

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PeriodShortcutsProps {
  onChange(next: { from?: string; to?: string }): void;
  labels?: Partial<PeriodPickerLabels>;
}

export function PeriodShortcuts({ onChange, labels }: PeriodShortcutsProps) {
  const lbls = { ...DEFAULT_LABELS, ...labels };
  const setShortcut = (kind: 'yesterday' | 'today' | 'week' | 'month') => {
    const today = todayIso();
    if (kind === 'yesterday') {
      const y = shiftIso(today, -1);
      onChange({ from: y, to: y });
    } else if (kind === 'today') {
      onChange({ from: today, to: today });
    } else if (kind === 'week') {
      onChange({ from: shiftIso(today, -6), to: today });
    } else if (kind === 'month') {
      onChange({ from: shiftIso(today, -29), to: today });
    }
  };
  return (
    <span className="flex items-center gap-1 text-[11px] text-[var(--ms-text-brand)]">
      <button
        type="button"
        onClick={() => setShortcut('yesterday')}
        className="hover:underline"
        data-test-id="period-yesterday"
      >
        {lbls.yesterday}
      </button>
      <span className="text-[var(--ms-text-muted)]">·</span>
      <button
        type="button"
        onClick={() => setShortcut('today')}
        className="hover:underline"
        data-test-id="period-today"
      >
        {lbls.today}
      </button>
      <span className="text-[var(--ms-text-muted)]">·</span>
      <button
        type="button"
        onClick={() => setShortcut('week')}
        className="hover:underline"
        data-test-id="period-week"
      >
        {lbls.week}
      </button>
      <span className="text-[var(--ms-text-muted)]">·</span>
      <button
        type="button"
        onClick={() => setShortcut('month')}
        className="hover:underline"
        data-test-id="period-month"
      >
        {lbls.month}
      </button>
    </span>
  );
}

export interface PeriodInputsProps {
  /** ISO yyyy-mm-dd */
  from?: string;
  /** ISO yyyy-mm-dd */
  to?: string;
  onChange(next: { from?: string; to?: string }): void;
  testId?: string;
}

/** «12 июля» — ru long month renders the genitive moysklad shows. */
function fmtDayLong(iso: string): string {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  );
}

export function PeriodInputs({ from, to, onChange, testId }: PeriodInputsProps) {
  // moysklad parity (owner 2026-07-12, grounded on his «Волны отбора»
  // screenshots): once a period is APPLIED the two date inputs COLLAPSE into
  // one display — «◀ Сегодня, 12 июля ▶» — whose arrows shift the whole range
  // by one day. Clicking the text reopens the two inputs for editing; picking
  // a date collapses again.
  const [editing, setEditing] = React.useState(false);
  const bothSet = !!(from && to);

  if (bothSet && !editing) {
    const label =
      from === to
        ? from === todayIso()
          ? `Сегодня, ${fmtDayLong(from)}`
          : from === shiftIso(todayIso(), -1)
            ? `Вчера, ${fmtDayLong(from)}`
            : fmtDayLong(from)
        : `${fmtDayLong(from as string)} — ${fmtDayLong(to as string)}`;
    const shiftBoth = (days: number) =>
      onChange({ from: shiftIso(from as string, days), to: shiftIso(to as string, days) });
    return (
      <div
        className="flex h-[24px] items-center justify-between gap-1 text-[13px]"
        data-test-id={testId}
      >
        <button
          type="button"
          aria-label="prev day"
          onClick={() => shiftBoth(-1)}
          className="px-1 text-[15px] text-[var(--ms-text-brand)] leading-none hover:opacity-70"
          data-test-id="period-shift-prev"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-center text-[var(--ms-text-primary)] hover:underline"
          data-test-id="period-collapsed-label"
        >
          {label}
        </button>
        <button
          type="button"
          aria-label="next day"
          onClick={() => shiftBoth(1)}
          className="px-1 text-[15px] text-[var(--ms-text-brand)] leading-none hover:opacity-70"
          data-test-id="period-shift-next"
        >
          ▶
        </button>
      </div>
    );
  }

  // moysklad parity: the filter date fields are a CUSTOM widget that always
  // renders dd.MM.yyyy (with a calendar popover), NOT a native <input
  // type="date"> — the native control's display format follows the browser's
  // UI locale (mm/dd/yyyy on en-US Chromium), which diverges from moysklad.
  // DatePicker.formatPretty uses Intl 2-digit/2-digit/numeric (= dd.MM.yyyy
  // under the default uz-UZ/ru locale), matching online.moysklad.uz.
  return (
    <div className="flex items-center gap-1" data-test-id={testId}>
      <div className="min-w-0 flex-1">
        <DatePicker
          value={from ?? null}
          onChange={(v) => {
            onChange({ from: v ?? undefined, to });
            if (v && to) setEditing(false);
          }}
          clearable
          showToday={false}
          placeholder=""
          testId="period-from"
          ariaLabel="from"
        />
      </div>
      <span aria-hidden className="text-[var(--ms-text-muted)]">
        —
      </span>
      <div className="min-w-0 flex-1">
        <DatePicker
          value={to ?? null}
          onChange={(v) => {
            onChange({ from, to: v ?? undefined });
            if (from && v) setEditing(false);
          }}
          clearable
          showToday={false}
          placeholder=""
          testId="period-to"
          ariaLabel="to"
        />
      </div>
    </div>
  );
}

export interface PeriodPickerProps {
  /** ISO yyyy-mm-dd */
  from?: string;
  /** ISO yyyy-mm-dd */
  to?: string;
  onChange(next: { from?: string; to?: string }): void;
  labels?: Partial<PeriodPickerLabels>;
  testId?: string;
}

/**
 * Combined picker — shortcuts row stacked above the date inputs. Use this
 * outside of an InlineFilterPanel.Field. Inside a Field, prefer the split
 * <PeriodShortcuts>/<PeriodInputs> pair so the shortcuts sit inline with
 * the label (matching moysklad's compact label header).
 */
export function PeriodPicker({ from, to, onChange, labels, testId }: PeriodPickerProps) {
  return (
    <div className="flex flex-col gap-1" data-test-id={testId}>
      <PeriodShortcuts onChange={onChange} labels={labels} />
      <PeriodInputs from={from} to={to} onChange={onChange} />
    </div>
  );
}
