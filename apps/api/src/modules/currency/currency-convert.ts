/**
 * Currency conversion — money-critical, EXACT BigInt arithmetic.
 *
 * No IEEE-754 anywhere: a currency's "base units per 1 foreign unit"
 * is kept as an exact rational num/den (rateValue is already an
 * integer ×1e8), and a from→to conversion is a single rational
 * multiply with ONE round-half-away-from-zero at the very end (no
 * double-rounding drift, symmetric for refunds/negative amounts).
 *
 * moysklad/1C semantics:
 *   - direct  (indirect=false): 1 foreign = rate / multiplicity base
 *   - indirect (indirect=true): 1 base    = rate / multiplicity foreign
 *   (rateValue = rate × 1e8; the accounting currency is rateValue=1e8,
 *    multiplicity=1, indirect=false ⇒ ratio 1, identity-exact.)
 *
 * Scope: amounts are integer minor units. Every UZ-market currency
 * (UZS, USD, EUR, RUB) is 2-decimal, so the from/to minor scales
 * cancel and the conversion is exact. Currencies with a different
 * decimal count (JPY 0dp, KWD 3dp) are out of the UZ scope and are
 * not minor-scale-adjusted here — a documented boundary, not a
 * silent cut.
 */

export interface CurrencyRate {
  /** rate × 1e8, integer (BigInt). Must be > 0. */
  rateValue: bigint;
  /** Кратность — the rate is quoted per `multiplicity` units. ≥ 1. */
  multiplicity: bigint;
  indirect: boolean;
}

const E8 = 100_000_000n;

/** Integer division rounded half away from zero (accounting rounding). */
export function divRoundHalfAway(numer: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new Error('currency-convert: division by zero');
  let n = numer;
  let d = denom;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = a / d;
  const r = a % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** Base-units-per-1-foreign-unit as an exact fraction {num, den}. */
function basePerForeign(r: CurrencyRate): { num: bigint; den: bigint } {
  if (r.rateValue <= 0n) throw new Error('currency-convert: rateValue must be > 0');
  if (r.multiplicity <= 0n) throw new Error('currency-convert: multiplicity must be > 0');
  return r.indirect
    ? { num: r.multiplicity * E8, den: r.rateValue }
    : { num: r.rateValue, den: r.multiplicity * E8 };
}

/**
 * Convert an integer minor-unit amount from one currency to another.
 * `amount × (from.bpf) / (to.bpf)` = `amount × fNum·tDen / (fDen·tNum)`
 * — a single exact rational, one final rounding.
 */
export function convertMinor(amountMinor: bigint, from: CurrencyRate, to: CurrencyRate): bigint {
  if (amountMinor === 0n) return 0n;
  const f = basePerForeign(from);
  const t = basePerForeign(to);
  return divRoundHalfAway(amountMinor * f.num * t.den, f.den * t.num);
}

/** Convenience: convert a foreign minor amount into the accounting (base) currency. */
export function toBaseMinor(amountMinor: bigint, from: CurrencyRate): bigint {
  return convertMinor(amountMinor, from, {
    rateValue: E8,
    multiplicity: 1n,
    indirect: false,
  });
}
