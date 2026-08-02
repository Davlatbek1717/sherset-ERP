/**
 * `report/metrics/` — analitika TZ §4: the single place every report metric is
 * defined, so two screens cannot answer one question two ways.
 *
 * The problem this replaces was real and measured (2026-08-02). Four separate
 * percent implementations lived in the report module at once:
 *
 *   profitability.service `pct()`      Number(a)/Number(b)*100, toFixed(2)
 *   pnl.service           inline       Number(a)/Number(b)*100, toFixed(2)
 *   unit-economics        inline       recomputed profit, then the same Float
 *   abc-analysis          inline       (a*10000n)/b truncated, 2 dp
 *
 * Three behaviours, so the same ratio printed as 30.65%, 30.6% or 31% depending
 * on the screen. Worse, three of them divided BigInts through `Number`, which
 * silently loses precision past 2^53 tiyin — reachable by a yearly aggregate.
 *
 * Everything here is PURE and BigInt-exact. The arithmetic core lives one level
 * down in `@moysklad/money` (`percentScaled`) because the POS cart needs the
 * identical division — a metric the cashier sees and a metric the owner's report
 * shows must not disagree.
 *
 * Money in, money out: `*Minor` values are tiyin. Percents come back as
 * `string | null` in the report-facing helpers, because `null` («no
 * denominator») has to survive to the UI rather than being flattened to «0%».
 */

import { percentScaled } from '@moysklad/money';

/** Report surfaces show two decimals. One place decides that. */
export const REPORT_PERCENT_DECIMALS = 2;

/**
 * Percent for a report cell: `numer ÷ denom × 100`, two decimals, or `null`
 * when there is no denominator.
 *
 * Callers that must keep the historical empty-string contract (several report
 * DTOs type this field as `string`) should use {@link percentText}.
 */
export function percent(numerMinor: bigint, denomMinor: bigint): number | null {
  return percentScaled(numerMinor, denomMinor, REPORT_PERCENT_DECIMALS);
}

/**
 * As {@link percent}, formatted the way the existing report DTOs expect:
 * a fixed-2 string, or '' when there is no denominator.
 *
 * The empty string is deliberate and pre-existing: these DTOs are consumed by
 * tables that render '' as a blank cell. Returning '0.00' there would assert a
 * measured zero where nothing was measurable.
 */
export function percentText(numerMinor: bigint, denomMinor: bigint): string {
  const p = percent(numerMinor, denomMinor);
  return p == null ? '' : p.toFixed(REPORT_PERCENT_DECIMALS);
}

/** Yalpi foyda = tushum − tan narx (analitika TZ §4). */
export function grossProfitMinor(revenueMinor: bigint, costMinor: bigint): bigint {
  return revenueMinor - costMinor;
}

/**
 * Marja % — foyda ÷ TUSHUM. «How much of what we took stayed with us.»
 *
 * Not to be confused with markup ({@link markupPercentText}), which divides by
 * cost. Both are legitimate and both get called «margin» in conversation, which
 * is precisely why they are two named functions here instead of one inline
 * division per report.
 */
export function marginPercentText(profitMinor: bigint, revenueMinor: bigint): string {
  return percentText(profitMinor, revenueMinor);
}

/** Ustama % — foyda ÷ TAN NARX. «How much we added on top of what it cost us.» */
export function markupPercentText(profitMinor: bigint, costMinor: bigint): string {
  return percentText(profitMinor, costMinor);
}

/**
 * O'rtacha chek = tushum ÷ hujjatlar soni, tiyinda, yarim-yuqoriga
 * yaxlitlangan. 0 hujjat → 0 (o'rtacha yo'q, lekin bu maydon pul ustuni —
 * bo'sh satr emas, nol ko'rsatiladi).
 */
export function averageCheckMinor(revenueMinor: bigint, documents: number): bigint {
  if (documents <= 0) return 0n;
  const n = BigInt(documents);
  const half = n / 2n;
  return revenueMinor >= 0n ? (revenueMinor + half) / n : -((-revenueMinor + half) / n);
}

/**
 * Qaytarish nisbati — qaytarilgan summa ÷ tushum (analitika TZ §4).
 * Tushum nol bo'lsa nisbat yo'q ('' qaytadi), «0%» EMAS: qaytarishsiz nol
 * savdo bilan qaytarish bo'lgan nol savdoni farqlash kerak.
 */
export function returnRatePercentText(returnsMinor: bigint, revenueMinor: bigint): string {
  return percentText(returnsMinor, revenueMinor);
}

/** As {@link returnRatePercentText} but numeric — for charts and `Math.min` caps. */
export function returnRatePercent(returnsMinor: bigint, revenueMinor: bigint): number | null {
  return percent(returnsMinor, revenueMinor);
}
