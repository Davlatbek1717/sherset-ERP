'use client';

import { formatMoney } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * Faza Q16 — report visibility banners.
 *
 * Two backend flags existed for a while but no page read them, so both
 * failures were INVISIBLE on screen — the worst kind, because the numbers
 * still looked complete:
 *
 *  - `truncated` (Faza 27a / Faza Q5): the query hit its row cap. The list is
 *    a PREFIX of the real answer, and without a banner it reads as the whole
 *    answer.
 *  - `unconvertedByCurrency` (Faza 17, M-12): money in a currency with no
 *    usable rate is deliberately EXCLUDED from the consolidated total (adding
 *    it at face value was the bug M-12 fixed). Excluding it silently just
 *    moves the lie: the total is now too small and nothing says why.
 *
 * Both render `null` when there is nothing to say. A banner that is always on
 * screen is noise users learn to skip, which is the same as no banner at all.
 *
 * Styling mirrors the existing `currency_mixed_warn` banner the report pages
 * already carry (same warning tokens, same size) so a page can show two of
 * them without looking like two different products.
 */

const BANNER_CLASS =
  'mt-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-warning,#d97706)] bg-[var(--ms-bg-warning,#fffbeb)] px-3 py-1.5 text-[var(--ms-text-warning,#92400e)] text-xs';

/**
 * "Not all rows are shown" banner. `truncated` is optional so a page can pass
 * `data?.truncated` straight through — an older response without the field
 * (or a still-loading query) is treated as "nothing to warn about".
 */
export function TruncatedNotice({
  truncated,
  testId,
}: {
  truncated: boolean | undefined;
  testId: string;
}) {
  const t = useTranslations('report_notices');
  if (!truncated) return null;
  return (
    <output className={`block ${BANNER_CLASS}`} data-test-id={testId}>
      {t('truncated')}
    </output>
  );
}

/** One `unconvertedByCurrency` entry as it comes off the wire. */
export interface UnconvertedAmountRow {
  currency: string;
  /** Minor units (tiyin/cents) in the row's OWN currency — never base. */
  amountMinor: string;
}

/**
 * "Some amounts had no rate" banner: the title plus one line per currency.
 *
 * Amounts are formatted in their own currency with the ISO code forced on
 * (`displayAs: 'iso'`) — the currency code IS the message here, so it must not
 * be swapped for a localized symbol the way ordinary money cells do.
 */
export function UnconvertedNotice({
  rows,
  testId,
}: {
  rows: UnconvertedAmountRow[] | undefined;
  testId: string;
}) {
  const t = useTranslations('report_notices');
  if (!rows || rows.length === 0) return null;
  return (
    <output className={`block ${BANNER_CLASS}`} data-test-id={testId}>
      <div>{t('unconverted_title')}</div>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((r) => (
          <li key={r.currency} className="tabular-nums" data-test-id={`${testId}-row`}>
            {t('unconverted_row', {
              currency: r.currency,
              amount: formatMoney(r.amountMinor, r.currency, { displayAs: 'none' }),
            })}
          </li>
        ))}
      </ul>
    </output>
  );
}
