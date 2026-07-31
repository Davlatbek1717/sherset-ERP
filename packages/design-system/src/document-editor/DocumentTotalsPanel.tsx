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
  /**
   * Render the «Прибыль» row with «—» because the cost basis is not known yet
   * (an unposted draft has no FIFO cost). moysklad always shows the row, so
   * hiding it shifts the whole totals block; but inventing a number would
   * present revenue as profit. This keeps the row and states «unknown».
   * Ignored when `profitMinor` is provided.
   */
  profitUnknown?: boolean;
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

  /**
   * Row captions. The design-system has no i18n of its own, so the app passes
   * translated strings in; the defaults below are the Russian originals so the
   * ru locale (and any caller not yet wired) renders exactly as before.
   *
   * Without this the block was hardcoded Russian in EVERY locale — the uz UI
   * showed «Промежуточный итог / НДС / Итого / Прибыль / Кол-во» (found on prod
   * 2026-07-31). Colons are added by the component, not carried in the values.
   */
  labels?: Partial<DocumentTotalsLabels>;

  className?: string;
  testId?: string;
}

/** Caption set for {@link DocumentTotalsPanel}. Values carry NO trailing colon. */
export interface DocumentTotalsLabels {
  subtotal: string;
  vat: string;
  vatIncluded: string;
  total: string;
  profit: string;
  commission: string;
  commitent: string;
  weight: string;
  volume: string;
  quantity: string;
}

const DEFAULT_LABELS: DocumentTotalsLabels = {
  subtotal: 'Промежуточный итог',
  vat: 'НДС',
  vatIncluded: 'Цена включает НДС',
  total: 'Итого',
  profit: 'Прибыль',
  commission: 'Комиссия',
  commitent: 'Сумма комитента',
  weight: 'Вес',
  volume: 'Объем',
  quantity: 'Кол-во',
};

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
  profitUnknown,
  weight,
  volume,
  quantity,
  currency = 'UZS',
  vatEnabled,
  onVatEnabledChange,
  vatIncluded,
  onVatIncludedChange,
  labels,
  className,
  testId,
}: DocumentTotalsPanelProps) {
  const L = { ...DEFAULT_LABELS, ...labels };
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
          <dt className="text-[var(--ms-text-primary)]">{L.subtotal}:</dt>
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
            {L.vat}:
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
              {L.vatIncluded}
            </label>
          </div>
        )}
        <div className="flex justify-between border-[var(--ms-border-default)] border-t pt-2 font-semibold text-base">
          <dt>{L.total}:</dt>
          <dd className="tabular-nums" data-test-id="totals-total">
            {fmt(totalMinor, currency)}
          </dd>
        </div>
        {(profitMinor !== undefined || profitUnknown) && (
          <div className="flex justify-between text-[var(--ms-text-success)] text-sm">
            <dt>{L.profit}:</dt>
            <dd className="tabular-nums" data-test-id="totals-profit">
              {profitMinor !== undefined ? fmt(profitMinor, currency) : '—'}
            </dd>
          </div>
        )}
        {/* Commission report «Выданный» — moysklad shows «Комиссия» + «Сумма
            комитента» under Итого (plain text, not bold). */}
        {commissionMinor !== undefined && (
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--ms-text-primary)]">{L.commission}:</dt>
            <dd className="tabular-nums" data-test-id="totals-commission">
              {fmt(commissionMinor, currency)}
            </dd>
          </div>
        )}
        {commitentMinor !== undefined && (
          <div className="flex justify-between text-sm">
            <dt className="text-[var(--ms-text-primary)]">{L.commitent}:</dt>
            <dd className="tabular-nums" data-test-id="totals-commitent">
              {fmt(commitentMinor, currency)}
            </dd>
          </div>
        )}
        {(weight != null || volume != null) && (
          <div className="flex justify-between gap-3 text-[var(--ms-text-muted)] text-xs">
            {weight != null && (
              <span>
                {L.weight}: {weight.toLocaleString('ru-RU')}
              </span>
            )}
            {volume != null && (
              <span>
                {L.volume}: {volume.toLocaleString('ru-RU')}
              </span>
            )}
          </div>
        )}
        {quantity != null && (
          <div className="flex justify-between text-[var(--ms-text-muted)] text-xs">
            <span>
              {L.quantity}: {quantity.toLocaleString('ru-RU')}
            </span>
          </div>
        )}
      </dl>
    </div>
  );
}
