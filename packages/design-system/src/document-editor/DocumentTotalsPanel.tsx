'use client';
import { cn } from '../lib/cn.ts';
import { formatMoney } from '../lib/format.ts';

/**
 * Right-aligned totals panel that sits under the position table.
 * Mirrors moysklad's footer with:
 *   Промежуточный итог: 1 234,56
 *   ☑ НДС:               123,45
 *   ☑ Цена включает НДС
 *   Итого:              1 358,01
 *   (optional) Прибыль:    234,00
 *   (optional) Вес: 12  Объем: 0.5
 *   (optional) Кол-во: 25
 *
 * VAT и «Цена включает НДС» — checkboxes (toggle behavior on the
 * document level — affects how the parent computes line totals). The
 * panel itself doesn't do math; it just renders the values the parent
 * already calculated, so totals stay BigInt-safe.
 */
export interface DocumentTotalsPanelProps {
  /** Subtotal before VAT and discount. */
  subtotalMinor: bigint | string | number;
  /** VAT amount. */
  vatMinor: bigint | string | number;
  /** Final total. */
  totalMinor: bigint | string | number;
  /** Optional profit row (Demand only — moysklad shows Прибыль for sales). */
  profitMinor?: bigint | string | number;
  /** Optional «Комиссия» row (commission report «Выданный» — total per-line
   *  commission/reward). Rendered under Итого. */
  commissionMinor?: bigint | string | number;
  /** Optional «Сумма комитента» row (commission report — Итого − Комиссия, the
   *  amount payable to the consigner). Rendered under «Комиссия». */
  commitentMinor?: bigint | string | number;
  /** Optional aggregate weight. */
  weight?: number | null;
  /** Optional aggregate volume. */
  volume?: number | null;
  /** Optional aggregate quantity. */
  quantity?: number | null;
  /** ISO currency for formatting. Defaults to UZS. */
  currency?: string;

  /** VAT enabled toggle (controlled). When unchecked, VAT row is hidden. */
  vatEnabled: boolean;
  onVatEnabledChange?: (value: boolean) => void;
  /** «Цена включает НДС» toggle. */
  vatIncluded: boolean;
  onVatIncludedChange?: (value: boolean) => void;

  className?: string;
  testId?: string;
}

function fmt(v: bigint | string | number, currency: string): string {
  return formatMoney(v, currency, { displayAs: 'none' });
}

export function DocumentTotalsPanel({
  subtotalMinor,
  vatMinor,
  totalMinor,
  profitMinor,
  commissionMinor,
  commitentMinor,
  weight,
  volume,
  quantity,
  currency = 'UZS',
  vatEnabled,
  onVatEnabledChange,
  vatIncluded,
  onVatIncludedChange,
  className,
  testId,
}: DocumentTotalsPanelProps) {
  return (
    <div
      // moysklad parity (OLD design): the totals sit as PLAIN text on the page —
      // no border, surface fill, rounding or card padding (grounded against the
      // live position-table+totals capture). Just right-aligned.
      className={cn('flex justify-end py-1', className)}
      data-test-id={testId ?? 'doc-totals'}
    >
      <dl className="min-w-[280px] space-y-1.5 text-sm">
        {/* moysklad bolds «Промежуточный итог» (and «Итого» below) — the section
            totals. The НДС / «Цена включает НДС» / Прибыль rows stay regular. */}
        <div className="flex justify-between font-semibold">
          <dt className="text-[var(--ms-text-primary)]">Промежуточный итог:</dt>
          <dd className="tabular-nums" data-test-id="totals-subtotal">
            {fmt(subtotalMinor, currency)}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[var(--ms-text-primary)]">
            <input
              type="checkbox"
              checked={vatEnabled}
              onChange={(e) => onVatEnabledChange?.(e.target.checked)}
              disabled={!onVatEnabledChange}
              className="h-4 w-4"
              data-test-id="totals-vat-enabled"
            />
            НДС:
          </label>
          <span className="tabular-nums" data-test-id="totals-vat">
            {vatEnabled ? fmt(vatMinor, currency) : '—'}
          </span>
        </div>
        {/* moysklad shows «Цена включает НДС» only while НДС is on (hidden with VAT
            off — keeps /new identical to /[id]'s DetailTotalsSidebar). */}
        {vatEnabled && (
          <div className="flex justify-between">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[var(--ms-text-primary)]">
              <input
                type="checkbox"
                checked={vatIncluded}
                onChange={(e) => onVatIncludedChange?.(e.target.checked)}
                disabled={!onVatIncludedChange}
                className="h-4 w-4"
                data-test-id="totals-vat-included"
              />
              Цена включает НДС
            </label>
          </div>
        )}
        <div className="flex justify-between border-[var(--ms-border-default)] border-t pt-2 font-semibold text-base">
          <dt>Итого:</dt>
          <dd className="tabular-nums" data-test-id="totals-total">
            {fmt(totalMinor, currency)}
          </dd>
        </div>
        {profitMinor !== undefined && (
          <div className="flex justify-between text-[var(--ms-text-success)] text-sm">
            <dt>Прибыль:</dt>
            <dd className="tabular-nums" data-test-id="totals-profit">
              {fmt(profitMinor, currency)}
            </dd>
          </div>
        )}
        {/* Commission report «Выданный» — moysklad shows «Комиссия» + «Сумма
            комитента» under Итого (plain text, not bold). */}
        {commissionMinor !== undefined && (
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--ms-text-primary)]">Комиссия:</dt>
            <dd className="tabular-nums" data-test-id="totals-commission">
              {fmt(commissionMinor, currency)}
            </dd>
          </div>
        )}
        {commitentMinor !== undefined && (
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--ms-text-primary)]">Сумма комитента:</dt>
            <dd className="tabular-nums" data-test-id="totals-commitent">
              {fmt(commitentMinor, currency)}
            </dd>
          </div>
        )}
        {(weight != null || volume != null) && (
          <div className="flex justify-between gap-3 text-[var(--ms-text-muted)] text-xs">
            {weight != null && <span>Вес: {weight.toLocaleString('ru-RU')}</span>}
            {volume != null && <span>Объем: {volume.toLocaleString('ru-RU')}</span>}
          </div>
        )}
        {quantity != null && (
          <div className="flex justify-between text-[var(--ms-text-muted)] text-xs">
            <span>Кол-во: {quantity.toLocaleString('ru-RU')}</span>
          </div>
        )}
      </dl>
    </div>
  );
}
