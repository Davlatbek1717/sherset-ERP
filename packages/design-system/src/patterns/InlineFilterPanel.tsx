'use client';

/**
 * InlineFilterPanel — moysklad parity. Filter form rendered inline above
 * the row table, with action buttons living inside the **first grid cell**
 * (col 1 row 1) — NOT in a sidebar. This is critical: moysklad uses the
 * same column-width for the actions as for a filter field, so the filter
 * grid stays at a clean N columns across all rows.
 *
 * Layout:
 *   ┌───────────┬──────────┬─────────┬─────────┬──────────┐
 *   │ [Найти]   │ Period   │ Оплата  │ Приёмка │ Дата п.  │   ← row 1
 *   │ [Очистить]│   (pills)│         │         │  (pills) │
 *   │ ◯ ◯       │  📅 — 📅 │         │         │ 📅 — 📅  │
 *   ├───────────┼──────────┼─────────┼─────────┼──────────┤
 *   │ Товар     │ Тип возв │ Склад   │ Проект  │ Контраг. │   ← row 2
 *   │ ...                                                  │
 *
 * Field accepts an `inlineSuffix` so date filters can place
 * «вч·сег·нед·мес» pills on the same line as the label («● Период:
 * вч·сег·нед·мес»), matching moysklad's compact label header.
 */

import * as Popover from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '../lib/cn.ts';

export interface InlineFilterPanelProps {
  children: React.ReactNode;
  /** Apply / search button label (default "Найти"). */
  applyLabel?: string;
  /** Clear / reset button label (default "Очистить"). */
  clearLabel?: string;
  /** Triggered when the user clicks Apply. Not required for
   *  always-applied (auto-debounced) filters. */
  onApply?(): void;
  /** Triggered when the user clicks Clear; reset all field values. */
  onClear(): void;
  /** Right-rail content (e.g. the floating "+ Filter" button or
   *  a saved-filter dropdown). */
  rightRail?: React.ReactNode;
  /** Optional pill row — rendered under the action block as a
   *  saved-filter strip. */
  pills?: React.ReactNode;
  /** Hide entire panel — used when collapsed via the toolbar Фильтр toggle. */
  hidden?: boolean;
  /** Click handler for the bookmark icon (save-current-filter quick
   *  action). When omitted, the icon renders disabled with a tooltip. */
  onBookmarkClick?: () => void;
  /** Hide the 🔖 bookmark icon entirely — moysklad's in-document position
   *  filter panels (e.g. Инвентаризация grid «Фильтр») show only the ⚙ gear. */
  hideBookmark?: boolean;
  /** Click handler for the gear icon (filter settings). When omitted,
   *  the icon renders disabled with a tooltip. */
  onSettingsClick?: () => void;
  /** moysklad ⚙ field-visibility: when provided, the gear opens a checklist of
   *  every Field child (keyed by its `fieldKey`, else its string label) and any
   *  field whose key is in `hidden` is hidden. Default-empty `hidden` = all shown,
   *  which is also locale-switch-safe (a stale label key just won't match → the
   *  field shows). Takes precedence over `onSettingsClick`. */
  fieldVisibility?: { hidden: Set<string>; onToggle: (key: string) => void };
  /** Desktop column count. Default 5 (action cell + 4 filters on row 1). Pass 6
   *  for dense money filters whose moysklad grid is 6-wide (e.g. «Платежи»). */
  columns?: 5 | 6;
  testId?: string;
  className?: string;
}

export function InlineFilterPanel({
  children,
  applyLabel = 'Найти',
  clearLabel = 'Очистить',
  onApply,
  onClear,
  rightRail,
  pills,
  hidden,
  onBookmarkClick,
  hideBookmark,
  onSettingsClick,
  fieldVisibility,
  columns = 5,
  testId,
  className,
}: InlineFilterPanelProps) {
  // moysklad-parity: when the filter FIELDS are collapsed (Фильтр toggle off),
  // STILL render the saved-filter pill strip above the table — saving a filter
  // must show its pill even with the panel collapsed (the whole panel used to
  // disappear, hiding saved filters).
  if (hidden) {
    return pills ? (
      <div
        className="flex flex-wrap items-center gap-1.5 px-4 pb-1"
        data-test-id={`${testId ?? 'inline-filter-panel'}-pills`}
      >
        {pills}
      </div>
    ) : null;
  }
  // ⚙ field-visibility: enumerate the Field children (by `fieldKey`) for the
  // gear's checklist, and hide any whose key is not currently visible. Children
  // without a fieldKey (or non-elements) always render.
  const childArr = React.Children.toArray(children);
  // A field's stable key = its explicit `fieldKey`, else its (string) label.
  const fieldKeyOf = (c: React.ReactNode): string | undefined => {
    if (!React.isValidElement(c)) return undefined;
    const p = c.props as { fieldKey?: string; label?: React.ReactNode };
    return p.fieldKey ?? (typeof p.label === 'string' ? p.label : undefined);
  };
  const fieldList = childArr.flatMap((c) => {
    const key = fieldKeyOf(c);
    if (key == null) return [];
    const label = (c as React.ReactElement<{ label?: React.ReactNode }>).props.label;
    // moysklad's ⚙ checklist shows the bare field name — strip the «Период:»
    // date-label colon.
    return [{ key, label: typeof label === 'string' ? label.replace(/:$/, '') : key }];
  });
  const renderedChildren = fieldVisibility
    ? childArr.filter((c) => {
        const key = fieldKeyOf(c);
        return key == null || !fieldVisibility.hidden.has(key);
      })
    : children;
  return (
    <section
      className={cn(
        'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]',
        // moysklad parity: filter panel fill + padding measured live on
        // online.moysklad.uz #purchaseorder — bg #e3e3e3 (neutral gray, not
        // the bluish #ECEEF1), padding 4/15/10/20 (asymmetric: wider left).
        'bg-[#e3e3e3] pt-[4px] pr-[15px] pb-[10px] pl-[20px]',
        className,
      )}
      data-test-id={testId ?? 'inline-filter-panel'}
    >
      <div
        className={cn(
          'grid gap-x-3 gap-y-1.5',
          // moysklad parity — fixed columns at desktop widths so the action
          // cell + filters fill row 1, then N filters per row thereafter.
          // Below ~960px the layout collapses to 3 cols, then 2. «Платежи»
          // uses 6 (its moysklad filter grid is 6-wide); others default to 5.
          columns === 6
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
        )}
      >
        {/* Action block — occupies grid cell row 1 col 1 (same width
            as a filter field). Two stacked rows of buttons + optional
            pill strip below. */}
        {/* moysklad parity: a single horizontal row — [Найти][Очистить][🔖][⚙] —
            with the save + settings icons right after Очистить (not stacked
            below), each a 28px icon button. */}
        <div className="flex flex-wrap items-center gap-1" data-test-id="inline-filter-actions">
          <button
            type="button"
            // Filters are always-applied (reactive: field change → query key → refetch),
            // so «Найти» is a moysklad-parity confirm, not the apply trigger. It must
            // NEVER be disabled just because no explicit onApply is wired — that made
            // the button look broken on ~every list (the reported bug). Enabled always;
            // click blurs the focused field (commits any pending input) then calls
            // onApply when a page provides one.
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur();
              onApply?.();
            }}
            className="rounded-[var(--ms-radius-default)] bg-[var(--ms-text-success)] px-3 py-1 font-medium text-sm text-white hover:bg-[color-mix(in_srgb,var(--ms-text-success)_85%,black)]"
            data-test-id="inline-filter-apply"
          >
            {applyLabel}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-3 py-1 font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-muted)]"
            data-test-id="inline-filter-clear"
          >
            {clearLabel}
          </button>
          {/* Conditional render (NOT the `hidden` attr — the button's inline-flex
              class would override the UA display:none and keep it visible). */}
          {!hideBookmark && (
            <button
              type="button"
              aria-label="bookmark"
              onClick={onBookmarkClick}
              disabled={!onBookmarkClick}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50"
              data-test-id="inline-filter-bookmark"
              title={onBookmarkClick ? 'Filterni saqlash' : 'Tez orada'}
            >
              <svg
                role="img"
                aria-label="bookmark"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
              </svg>
            </button>
          )}
          {(() => {
            const gearIcon = (
              <svg
                role="img"
                aria-label="settings"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            );
            const gearClass =
              'inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-muted)] hover:bg-[var(--ms-bg-muted)] disabled:cursor-not-allowed disabled:opacity-50';
            // moysklad ⚙: opens a checklist of all filter fields (show/hide).
            if (fieldVisibility) {
              return (
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      aria-label="settings"
                      className={gearClass}
                      data-test-id="inline-filter-settings"
                      title="Поля фильтра"
                    >
                      {gearIcon}
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="start"
                      sideOffset={4}
                      // moysklad parity: the ⚙ checklist shows EVERY field at once
                      // (no fixed max-height / scroll). Radix's available-height var
                      // still caps it at the viewport edge as a safety net.
                      className="z-[var(--ms-z-popover)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] py-1 shadow-[var(--ms-shadow-md)]"
                    >
                      {fieldList.map((f) => {
                        const checked = !fieldVisibility.hidden.has(f.key);
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => fieldVisibility.onToggle(f.key)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--ms-bg-hover)]"
                            data-test-id={`inline-filter-field-toggle-${f.key}`}
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
                            <span className="truncate">{f.label}</span>
                          </button>
                        );
                      })}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              );
            }
            return (
              <button
                type="button"
                aria-label="settings"
                onClick={onSettingsClick}
                disabled={!onSettingsClick}
                className={gearClass}
                data-test-id="inline-filter-settings"
                title={onSettingsClick ? 'Sozlash' : 'Tez orada'}
              >
                {gearIcon}
              </button>
            );
          })()}
        </div>
        {renderedChildren}
        {rightRail && <div className="flex items-start gap-2">{rightRail}</div>}
      </div>
      {/* moysklad parity: saved-filter pill strip rendered BELOW the
          grid (the row right under the «Egasi-bo'lim» line in screenshots),
          NOT inside the actions column. Letting it span the full panel
          width keeps it consistent with moysklad — the user sees their
          saved filters as a horizontal strip detached from the action
          column. Empty when no saved filters. */}
      {pills && <div className="mt-2 flex flex-wrap items-center gap-1.5">{pills}</div>}
    </section>
  );
}

export interface InlineFilterFieldProps {
  label: string;
  children: React.ReactNode;
  /** Mark the label with a leading bullet — moysklad's "● Период" prefix.
   *  Default true; pass false for non-clickable filter labels. */
  expandable?: boolean;
  /** Content rendered INLINE with the label (right of the label text on
   *  the same line). Used by date-range filters to put the
   *  «вч · сег · нед · мес» shortcut row next to "● Период:". */
  inlineSuffix?: React.ReactNode;
  /** Hover tooltip on the field label — mirrors moysklad's field-help text
   *  (e.g. «По умолчанию содержит», «Попадает в период»). No visible icon;
   *  shown as the label's `title` on hover, matching moysklad. */
  tooltip?: string;
  /** Stable key for the ⚙ field-visibility checklist (and to hide the field
   *  when not visible). Fields without a fieldKey always render + aren't listed. */
  fieldKey?: string;
  /** moysklad parity (owner 2026-07-12, «Волны отбора» ground): a filter cell
   *  with an APPLIED value is tinted light blue — label, shortcuts and control
   *  together. Pages pass `active` when the field currently filters the list. */
  active?: boolean;
}

function Field({
  label,
  children,
  expandable = true,
  inlineSuffix,
  tooltip,
  active,
}: InlineFilterFieldProps) {
  // <div> rather than <label> — the inner control is unknown at the
  // type level, so a bare <label> would fail noLabelWithoutControl.
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 text-[11px]',
        active && '-mx-2 -my-1 rounded-[var(--ms-radius-sm)] bg-[#cfe8f8] px-2 py-1',
      )}
      data-test-id="inline-filter-field"
    >
      <div className="flex items-baseline gap-2 leading-tight">
        {/* moysklad parity (measured live #purchaseorder): filter field labels
            are dark #222 (--ms-text-primary), 12px — NOT a light muted gray.
            Verified on Период / Организация / Оплата, all rgb(34,34,34) 12px. */}
        <span className="font-normal text-[12px] text-[var(--ms-text-primary)]" title={tooltip}>
          {expandable && (
            <span aria-hidden className="mr-0.5 text-[9px] text-[var(--ms-text-muted)]">
              ●
            </span>
          )}
          {label}
        </span>
        {inlineSuffix && (
          <span className="flex items-center gap-1 text-[11px] text-[var(--ms-text-brand)]">
            {inlineSuffix}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

InlineFilterPanel.Field = Field;
