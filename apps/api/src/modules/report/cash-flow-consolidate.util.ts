import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';

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

export interface RateContext {
  baseCode: string;
  rates: Map<string, CurrencyRate>;
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
 * `seen` accumulates every distinct currency code encountered so the caller
 * can raise the `mixedCurrency` flag — same contract as the channel path.
 *
 * Fidelity note: a row whose currency has no Currency row in `rates` cannot
 * be consolidated faithfully; it is included at face value (its minor units
 * added as-if base) and its code still lands in `seen`, so the UI's
 * mixed-currency warning fires. This mirrors `aggregateChannel`'s fallback —
 * never silently drop money.
 */
export function foldCurrencyRows(
  rows: CurrencyAwareRow[],
  ctx: RateContext,
  seen: Set<string>,
): Map<string, ConsolidatedAmounts> {
  const out = new Map<string, ConsolidatedAmounts>();

  for (const row of rows) {
    const code = row.currency || ctx.baseCode;
    seen.add(code);

    const inflowBase = toBase(row.inflowSumMinor, code, ctx);
    const outflowBase = toBase(row.outflowSumMinor, code, ctx);

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

function toBase(amountMinor: bigint, code: string, ctx: RateContext): bigint {
  if (amountMinor === 0n) return 0n;
  if (code === ctx.baseCode) return amountMinor;
  const rate = ctx.rates.get(code);
  // Unknown currency ⇒ face-value fallback (warned via `seen`/mixedCurrency).
  return rate ? toBaseMinor(amountMinor, rate) : amountMinor;
}
