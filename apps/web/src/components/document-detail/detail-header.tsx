'use client';

/**
 * Generic document-detail page header — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   <doc-type>/screenshots/d-default.png
 *
 * Layout:
 *   <Title prefix> № <name> от <DD.MM.YYYY HH:MM>
 *   [pill row]                                                [✓ Проведено]   <author block>
 *
 * Pill row content varies per document type and is supplied via `pillsSlot`.
 * The colored state pill comes from the `stateLabel` + `stateTone` props
 * (parent does the translation since the `states.*` namespace differs
 * per entity). The Проведено checkbox is a controlled toggle that flips
 * `applicable` via the parent's `onToggleApplicable` callback.
 */

import { Badge, Checkbox, DropdownMenu, formatDate } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

// Full Badge tone vocabulary (mirrors @moysklad/ui Badge `tone`). `info` was
// added 2026-06-10 so the shared canonical document-state→tone map
// (lib/document-state-tone.ts) — which uses `info` for states like `accepted`
// / `in_progress` — can satisfy this type. Strictly widening; detail headers
// that never emit `info` are unaffected.
export type StateTone = 'neutral' | 'brand' | 'success' | 'warning' | 'destructive' | 'info';

/** One selectable workflow state in the inline state-change dropdown. */
export interface DetailHeaderStateItem {
  /** State slug emitted to onSelect. */
  slug: string;
  /** Localised label shown in the menu. */
  label: string;
  /** Optional hex colour swatch (tenant State.color). */
  color?: string | null;
  disabled?: boolean;
}

export interface DetailHeaderProps {
  /** Localised title prefix, e.g. "Заказ покупателя", "Отгрузка". */
  titlePrefix: string;
  /** Document name (number) — e.g. "04796". */
  name: string;
  /** Document moment (ISO datetime). */
  moment: string;
  /** Localised state label (parent translates from states.* namespace). */
  stateLabel: string;
  /** Tone for the state pill. */
  stateTone: StateTone;
  /** State slug for the testId (e.g. "draft", "posted"). */
  stateSlug: string;
  /** Whether the Provedeno checkbox is checked. */
  applicable: boolean;
  onToggleApplicable?(next: boolean): void;
  /** Disable the Provedeno toggle while a transition is in flight. */
  applicableBusy?: boolean;
  /** Author block on the right (rendered by parent). */
  authorSlot?: ReactNode;
  /** Optional pill row content (e.g. "Не оплачено", "Не отгружено", buttons). */
  pillsSlot?: ReactNode;
  /** Optional override for the title (e.g. for documents without a numeric prefix). */
  customTitle?: ReactNode;
  /** Hide the Provedeno checkbox entirely. Catalog items (counterparty,
   *  product) have an archived flag rather than an FSM-driven applicable
   *  state, so the checkbox doesn't apply. */
  hideApplicable?: boolean;
  /** Optional read-only flag(s) rendered next to the Provedeno
   *  checkbox. moysklad-parity for "Ожидание" on PurchaseOrder which
   *  sits as a disabled checkbox in the header signalling that the
   *  document is awaiting receipt. */
  extraHeaderSlot?: ReactNode;
  /**
   * moysklad parity: inline state-change dropdown in the title row
   * (the «Новый ▾» control). When provided, the static state Badge is
   * replaced with a clickable badge-styled dropdown that lists these
   * states; selecting one calls `onStateChange(slug)`. When omitted,
   * the read-only Badge renders as before.
   */
  stateMenuItems?: DetailHeaderStateItem[];
  onStateChange?(slug: string): void;
  /** Disable the state dropdown while a transition is in flight. */
  stateBusy?: boolean;
  /** Optional hex colour for the dropdown TRIGGER background (account-defined
   *  custom statuses have arbitrary colours, not a fixed StateTone). When set,
   *  it overrides TONE_BG[stateTone] and the text colour is auto-picked (YIQ).
   *  Omit for FSM states that map to a tone. */
  stateColor?: string;
}

/** Readable text on a coloured pill: dark on light bg, white on dark (YIQ). */
function pillTextColor(hex?: string): string {
  if (!hex) return '#ffffff';
  const c = hex.replace('#', '');
  if (c.length < 6) return '#ffffff';
  const r = Number.parseInt(c.slice(0, 2), 16);
  const g = Number.parseInt(c.slice(2, 4), 16);
  const b = Number.parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 160 ? '#1c2030' : '#ffffff';
}

export function DetailHeader({
  titlePrefix,
  name,
  moment,
  stateLabel,
  stateTone,
  stateSlug,
  applicable,
  onToggleApplicable,
  applicableBusy,
  authorSlot,
  pillsSlot,
  customTitle,
  hideApplicable,
  extraHeaderSlot,
  stateMenuItems,
  onStateChange,
  stateBusy,
  stateColor,
}: DetailHeaderProps) {
  const tDetail = useTranslations('detail_header');
  const TONE_BG: Record<StateTone, string> = {
    neutral: 'var(--ms-bg-muted)',
    brand: 'var(--ms-text-brand)',
    success: 'var(--ms-text-success)',
    warning: '#F59E0B',
    destructive: 'var(--ms-text-destructive)',
    info: 'var(--ms-info-700)',
  };

  return (
    <div
      className="flex flex-wrap items-start gap-x-4 gap-y-2 border-[var(--ms-border-default)] border-b px-4 py-3"
      data-test-id="detail-header"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1
          className="font-semibold text-[var(--ms-text-primary)] text-lg leading-tight"
          data-test-id="detail-header-title"
        >
          {customTitle ?? (
            <>
              {titlePrefix} № {name} {tDetail('from')} {formatDate(moment)}
            </>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {pillsSlot}
          {/* moysklad parity: inline state-change dropdown («Новый ▾»).
              When stateMenuItems is provided, the state pill becomes a
              clickable colored dropdown; otherwise it's a read-only
              Badge. */}
          {stateMenuItems && stateMenuItems.length > 0 && onStateChange ? (
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  disabled={stateBusy}
                  data-test-id={`detail-header-state-dropdown-${stateSlug}`}
                  className="inline-flex items-center gap-1 rounded-[var(--ms-radius-sm)] px-2 py-0.5 font-medium text-xs disabled:opacity-50"
                  style={{
                    backgroundColor: stateColor ?? TONE_BG[stateTone],
                    color: stateColor ? pillTextColor(stateColor) : '#ffffff',
                  }}
                >
                  {stateLabel}
                  <span aria-hidden className="text-[10px]">
                    ▾
                  </span>
                </button>
              }
              testId="detail-header-state-menu"
            >
              {stateMenuItems.map((s) => (
                <DropdownMenu.Item
                  key={s.slug}
                  disabled={s.disabled || s.slug === stateSlug}
                  onSelect={() => onStateChange(s.slug)}
                  testId={`detail-header-state-option-${s.slug}`}
                  icon={
                    s.color ? (
                      <span
                        aria-hidden
                        className="block h-3 w-3 rounded-sm border border-[var(--ms-border-default)]"
                        style={{ backgroundColor: s.color }}
                      />
                    ) : null
                  }
                >
                  {s.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu>
          ) : (
            <Badge tone={stateTone} data-test-id={`detail-header-state-${stateSlug}`}>
              {stateLabel}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!hideApplicable && (
          <label
            className="flex select-none items-center gap-1.5 text-[var(--ms-text-primary)] text-sm"
            data-test-id="detail-header-applicable-label"
          >
            <Checkbox
              checked={applicable}
              disabled={!onToggleApplicable || applicableBusy}
              onCheckedChange={(v) => onToggleApplicable?.(v === true)}
              data-test-id="detail-header-applicable-checkbox"
            />
            {tDetail('applicable')}
          </label>
        )}
        {extraHeaderSlot}
        {authorSlot}
      </div>
    </div>
  );
}
