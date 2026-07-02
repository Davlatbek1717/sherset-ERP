/**
 * «Изменить цены» (bulk price change) — pure money engine. Mirrors moysklad's
 * «Изменить цены» drawer: set the target price type on each product by one of
 * three modes, with an optional ± adjustment (in currency units or %) and
 * optional rounding to whole currency units.
 *
 * All money is BigInt MINOR units (tiyin). Pure + deterministic → unit-tested.
 */

export type BulkPriceMode = 'fixed' | 'cost' | 'other';
export type AdjustSign = '+' | '-';
export type AdjustUnit = 'currency' | 'percent';
export type Rounding = 'none' | 'integer';

export interface BulkPriceSpec {
  mode: BulkPriceMode;
  /** fixed mode: explicit new price (minor). */
  valueMinor?: bigint | null;
  /** cost/other mode: adjustment magnitude. For 'currency' it is MINOR units;
   *  for 'percent' it is a percentage (e.g. 10 = +10%). */
  adjustSign?: AdjustSign;
  adjustValue?: string | null;
  adjustUnit?: AdjustUnit;
  rounding?: Rounding;
}

/** Round a minor-unit amount to whole currency units (no tiyin) — moysklad's
 *  «Округлить»: round-half-up to the nearest 100 minor. */
function roundToWhole(minor: bigint): bigint {
  const rem = ((minor % 100n) + 100n) % 100n; // non-negative remainder
  const down = minor - rem;
  return rem >= 50n ? down + 100n : down;
}

/**
 * Compute the new target price (minor) for ONE product.
 * @param base the base amount in minor — for 'cost' the product's buyPrice, for
 *   'other' the product's price for the base price type. Ignored for 'fixed'.
 * Returns null when the inputs can't yield a price (e.g. cost/other with no base),
 * so the caller can skip writing rather than store a wrong 0.
 */
export function computeBulkPrice(spec: BulkPriceSpec, base: bigint | null): bigint | null {
  let result: bigint;
  if (spec.mode === 'fixed') {
    if (spec.valueMinor == null) return null;
    result = spec.valueMinor;
  } else {
    if (base == null) return null;
    const sign = spec.adjustSign === '-' ? -1n : 1n;
    const raw = (spec.adjustValue ?? '').trim();
    if (spec.adjustUnit === 'percent') {
      // base * pct / 100, percent may be fractional → scale by 100 then divide.
      const pctScaled = parsePercentToHundredths(raw); // e.g. "10.5" -> 1050 (= 10.50%)
      const deltaScaled = base * pctScaled * sign; // base * (pct*100) ...
      // deltaScaled is base*pct*100; divide by 10_000 (100 for pct, 100 for the ×100 scale)
      result = base + roundDivSigned(deltaScaled, 10_000n);
    } else {
      // currency units: adjustValue is already MINOR.
      const deltaMinor = parseMinor(raw);
      result = base + deltaMinor * sign;
    }
  }
  if (result < 0n) result = 0n;
  if (spec.rounding === 'integer') result = roundToWhole(result);
  return result;
}

/** Parse a non-negative integer minor string ("12345"); invalid → 0n. */
function parseMinor(s: string): bigint {
  if (!/^\d+$/.test(s)) return 0n;
  return BigInt(s);
}

/** Parse a percent like "10", "10.5", "7.25" into hundredths-of-a-percent
 *  (×100): "10" -> 1000, "10.5" -> 1050. Two decimals max. */
function parsePercentToHundredths(s: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return 0n;
  const whole = BigInt(m[1] ?? '0');
  const frac = (m[2] ?? '').padEnd(2, '0');
  return whole * 100n + BigInt(frac || '0');
}

/** Divide preserving sign with round-half-away-from-zero. */
function roundDivSigned(num: bigint, den: bigint): bigint {
  const neg = num < 0n;
  const a = neg ? -num : num;
  const q = a / den;
  const r = a % den;
  const rounded = r * 2n >= den ? q + 1n : q;
  return neg ? -rounded : rounded;
}
