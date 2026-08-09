import { type CurrencyTally, type RateContext, consolidateToBase } from './report-rate-ctx.util.js';

export type { RateContext };

/**
 * One raw aggregate row from a currency-aware GROUP BY: a single
 * (group-key, currency) bucket with its inflow/outflow sums in that
 * currency's own minor units.
 */
export interface CurrencyAwareRow {
  /** Group identity — a date bucket ISO, an FK uuid, etc. */
  key: string;
  /** ISO currency code of `inflowSumMinor`/`outflowSumMinor`. */
  currency: string;
  /**
   * The documents' own `rate_value` (×10^8) when the GROUP BY includes it —
   * the historical rate this bucket must be valued at (M-11). Absent ⇒ the
   * current context rate is used.
   */
  rateValue?: bigint;
  inflowCount: number;
  inflowSumMinor: bigint;
  outflowCount: number;
  outflowSumMinor: bigint;
}

export interface ConsolidatedAmounts {
  inflowCount: number;
  inflowSumMinor: bigint;
  outflowCount: number;
  outflowSumMinor: bigint;
}

/**
 * Fold currency-aware rows into per-key, base-consolidated amounts.
 *
 * Each row's money is converted to the account base (валюта учёта) via the
 * exact BigInt `toBaseMinor` (§Unit-C). Counts are currency-independent and
 * simply summed. The first occurrence of each key fixes insertion order so
 * the caller can rely on a stable iteration (date buckets stay chronological
 * when rows arrive sorted).
 *
 * `tally` accumulates every distinct currency code encountered so the caller
 * can raise the `mixedCurrency` flag — same contract as the channel path.
 *
 * Fidelity note (Faza 17): a row is valued at its own `rateValue` when the
 * GROUP BY carried one (M-11), else at the current context rate. A row whose
 * currency has neither cannot be consolidated faithfully — it is EXCLUDED
 * from the sums and recorded in `tally` as unconverted (M-12), so the caller
 * reports it on its own line. Money is never silently dropped, and never
 * silently added at face value either.
 */
export function foldCurrencyRows(
  rows: CurrencyAwareRow[],
  ctx: RateContext,
  tally: CurrencyTally,
): Map<string, ConsolidatedAmounts> {
  const out = new Map<string, ConsolidatedAmounts>();

  for (const row of rows) {
    const code = row.currency || ctx.baseCode;

    const inflowBase = consolidateToBase(row.inflowSumMinor, code, ctx, tally, row.rateValue);
    const outflowBase = consolidateToBase(row.outflowSumMinor, code, ctx, tally, row.rateValue);

    const existing = out.get(row.key);
    if (existing) {
      existing.inflowCount += row.inflowCount;
      existing.inflowSumMinor += inflowBase;
      existing.outflowCount += row.outflowCount;
      existing.outflowSumMinor += outflowBase;
    } else {
      out.set(row.key, {
        inflowCount: row.inflowCount,
        inflowSumMinor: inflowBase,
        outflowCount: row.outflowCount,
        outflowSumMinor: outflowBase,
      });
    }
  }

  return out;
}
