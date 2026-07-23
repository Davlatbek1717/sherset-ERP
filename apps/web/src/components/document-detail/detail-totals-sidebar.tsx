'use client';

/**
 * Generic document-detail page totals sidebar — moysklad parity.
 *
 * Source: docs/moysklad-reference/visual-captures/03-module/
 *   <doc-type>/screenshots/d-default.png (right column)
 *
 * Layout (right-aligned numbers):
 *   Промежуточный итог:           64 000,00
 *   ☐ НДС:                             0,00
 *   ☐ Цена включает НДС
 *   ───────────────────────────────────────
 *   Итого:                        64 000,00
 *   Кол-во:                              2
 */

import { Checkbox, formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface DetailTotalsSidebarProps {
  /** Subtotal in minor units (BigInt-string). */
  subtotalMinor: string;
  /** VAT amount in minor units. */
  vatMinor: string;
  /** Whether VAT row is shown / checkbox checked. */
  vatEnabled: boolean;
  /** Whether prices already include VAT. */
  vatIncluded: boolean;
  /** Final total = subtotal + vat (or = subtotal when vatIncluded). */
  totalMinor: string;
  /** Total line-item count (sum of all position quantities). */
  totalQty: number;
  /**
   * ISO currency of the document (e.g. 'USD'). Defaults to UZS so existing
   * UZS docs keep rendering «сум»; non-UZS docs render their own currency name
   * instead of hardcoding «сум».
   */
  currency?: string;
  /**
   * Gross profit (revenue − COGS) in minor units. Shown only when provided —
   * callers pass it solely once the cost is known (posted doc), so a draft never
   * shows full revenue as "profit". moysklad shows «Прибыль» on the totals.
   */
  profitMinor?: string;
  /** Toggle handlers — disabled when document is in `applicable` state. */
  onToggleVatEnabled?(next: boolean): void;
  onToggleVatIncluded?(next: boolean): void;
  /** Read-only when locked (provedeno) — checkboxes disabled, values shown. */
  readOnly?: boolean;
  /**
   * moysklad parity: the totals block is BARE text (no border, no surface card,
   * no padding) sitting just under the position table, right-aligned. Converged
   * detail pages (PO/CO/supply) pass `bare` so the block reads exactly like
   * moysklad's footer. Omitted on pages still on the old boxed shell → the
   * historical bordered card renders (unchanged).
   */
  bare?: boolean;
  /**
   * moysklad parity: supply («Приёмка») renders «Накладные расходы» as the LAST
   * row INSIDE the totals column, under «Кол-во» — help icon + label + compact
   * input + «Распределить» + mode select (grounded live 2026-07-06 on
   * #supply/edit). Other docs omit it.
   */
  footerSlot?: ReactNode;
}

export function DetailTotalsSidebar({
  subtotalMinor,
  vatMinor,
  vatEnabled,
  vatIncluded,
  totalMinor,
  totalQty,
  profitMinor,
  currency = 'UZS',
  onToggleVatEnabled,
  onToggleVatIncluded,
  readOnly,
  bare,
  footerSlot,
}: DetailTotalsSidebarProps) {
  const t = useTranslations('detail_totals');

  return (
    <aside
      className={
        bare
          ? 'min-w-[280px] text-sm'
          : 'rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 text-sm'
      }
      data-test-id="detail-totals-sidebar"
    >
      <Row
        label={t('subtotal')}
        value={formatMoney(subtotalMinor, currency)}
        testId="totals-subtotal"
      />
      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-[var(--ms-text-primary)]">
          <Checkbox
            checked={vatEnabled}
            disabled={readOnly || !onToggleVatEnabled}
            onCheckedChange={(v) => onToggleVatEnabled?.(v === true)}
            data-test-id="totals-vat-enabled-checkbox"
          />
          {t('vat')}:
        </label>
        <span className="tabular-nums" data-test-id="totals-vat-amount">
          {formatMoney(vatMinor, currency)}
        </span>
      </div>
      {/* moysklad shows «Цена включает НДС» ONLY while НДС is enabled — with VAT
          off the row is hidden entirely (live ref: PO with НДС off shows just the
          «НДС:» line + Итого, no «Цена включает НДС»). */}
      {vatEnabled && (
        <div className="mt-1">
          <label className="flex items-center gap-2 text-[var(--ms-text-primary)]">
            <Checkbox
              checked={vatIncluded}
              disabled={readOnly || !onToggleVatIncluded}
              onCheckedChange={(v) => onToggleVatIncluded?.(v === true)}
              data-test-id="totals-vat-included-checkbox"
            />
            {t('vat_included')}
          </label>
        </div>
      )}
      <hr className="my-3 border-[var(--ms-border-default)]" />
      <Row
        label={t('total')}
        value={formatMoney(totalMinor, currency)}
        bold
        testId="totals-total"
      />
      {profitMinor !== undefined && (
        <Row
          label={t('profit')}
          value={formatMoney(profitMinor, currency)}
          testId="totals-profit"
        />
      )}
      <Row label={t('qty')} value={String(totalQty)} muted testId="totals-qty" />
      {footerSlot && (
        <div className="mt-2 border-[var(--ms-border-default)] border-t pt-2">{footerSlot}</div>
      )}
    </aside>
  );
}

interface RowProps {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  testId?: string;
}

function Row({ label, value, bold, muted, testId }: RowProps) {
  return (
    <div className="flex items-center justify-between" data-test-id={testId}>
      <span className={muted ? 'text-[var(--ms-text-muted)]' : 'text-[var(--ms-text-primary)]'}>
        {label}:
      </span>
      <span
        className={`tabular-nums ${bold ? 'font-semibold' : ''} ${
          muted ? 'text-[var(--ms-text-muted)]' : 'text-[var(--ms-text-primary)]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
