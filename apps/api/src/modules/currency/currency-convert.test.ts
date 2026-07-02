import { describe, expect, it } from 'vitest';
import {
  type CurrencyRate,
  convertMinor,
  divRoundHalfAway,
  toBaseMinor,
} from './currency-convert.js';

const BASE: CurrencyRate = { rateValue: 100_000_000n, multiplicity: 1n, indirect: false };
// 1 USD = 12750.50 UZS (rateValue = 12750.5 × 1e8)
const USD: CurrencyRate = { rateValue: 1_275_050_000_000n, multiplicity: 1n, indirect: false };
// rate quoted per 100 units: 1000 JPY = 8500 UZS ⇒ 1 JPY = 85 UZS
const JPY: CurrencyRate = { rateValue: 850_000_000_000n, multiplicity: 100n, indirect: false };
// indirect: 1 base = 0.5 foreign ⇒ 1 foreign = 2 base (rateValue 0.5×1e8)
const INV: CurrencyRate = { rateValue: 50_000_000n, multiplicity: 1n, indirect: true };

describe('divRoundHalfAway', () => {
  it('rounds half away from zero, symmetric for negatives', () => {
    expect(divRoundHalfAway(5n, 2n)).toBe(3n); // 2.5 → 3
    expect(divRoundHalfAway(-5n, 2n)).toBe(-3n); // -2.5 → -3
    expect(divRoundHalfAway(4n, 2n)).toBe(2n);
    expect(divRoundHalfAway(1n, 3n)).toBe(0n); // 0.333 → 0
    expect(divRoundHalfAway(2n, 3n)).toBe(1n); // 0.666 → 1
    expect(divRoundHalfAway(-1n, 2n)).toBe(-1n); // -0.5 → -1
  });
  it('throws on division by zero (money safety boundary)', () => {
    expect(() => divRoundHalfAway(1n, 0n)).toThrow();
  });
});

describe('convertMinor — exact, money-critical', () => {
  it('identity (same currency) is exact for any amount incl. negative & huge', () => {
    for (const a of [0n, 1n, 999_999n, -250_000n, 9_999_999_999_999_999n]) {
      expect(convertMinor(a, USD, USD)).toBe(a);
      expect(convertMinor(a, JPY, JPY)).toBe(a);
      expect(convertMinor(a, INV, INV)).toBe(a);
    }
  });

  it('base currency conversion is identity (ratio 1)', () => {
    expect(convertMinor(123_456n, BASE, BASE)).toBe(123_456n);
    expect(toBaseMinor(123_456n, BASE)).toBe(123_456n);
  });

  // NOTE: all amounts are integer MINOR units and every UZ-relevant
  // currency (UZS, USD, EUR, RUB) is 2-decimal, so the minor scales
  // cancel and `foreignMinor × rate = baseMinor` is exact. Currencies
  // with a different decimal count (JPY 0dp, KWD 3dp) are outside the
  // UZ-market scope — documented, not silently mishandled.
  it('direct: 100.00 USD (10 000 minor) → base (×12750.50)', () => {
    // 10_000 USD-minor × 12750.50 = 127_505_000 base-minor (tiyin)
    expect(toBaseMinor(10_000n, USD)).toBe(127_505_000n);
  });

  it('direct with multiplicity: JPY rate per 100 ⇒ 1 JPY-minor = 85 base-minor', () => {
    expect(toBaseMinor(1_000n, JPY)).toBe(85_000n); // 1000 × 8500/100
  });

  it('indirect: 1 foreign-minor = 2 base-minor', () => {
    expect(toBaseMinor(500n, INV)).toBe(1_000n);
  });

  it('round-trips base→USD→base within the base-value of one USD-minor', () => {
    const oneUsdMinorInBase = convertMinor(1n, USD, BASE); // ≈ 12751
    for (const base of [1n, 7n, 1_275_049n, 1_275_050n, 50_000_000n]) {
      const usd = convertMinor(base, BASE, USD);
      const back = convertMinor(usd, USD, BASE);
      const diff = back - base < 0n ? base - back : back - base;
      expect(diff <= oneUsdMinorInBase + 1n).toBe(true);
    }
  });

  it('cross-currency USD→JPY ≈ USD→base→JPY (double-round ≤ 1 JPY-minor)', () => {
    const amount = 1_000_000n;
    const direct = convertMinor(amount, USD, JPY);
    const viaBase = convertMinor(convertMinor(amount, USD, BASE), BASE, JPY);
    const diff = direct - viaBase < 0n ? viaBase - direct : direct - viaBase;
    expect(diff <= 1n).toBe(true);
  });

  it('negative amounts (refunds) convert symmetrically', () => {
    expect(toBaseMinor(-10_000n, USD)).toBe(-127_505_000n);
    expect(convertMinor(-1_000n, JPY, JPY)).toBe(-1_000n);
  });

  it('zero is always zero', () => {
    expect(convertMinor(0n, USD, JPY)).toBe(0n);
  });

  it('rejects a non-positive rateValue / multiplicity (corrupt data guard)', () => {
    expect(() => toBaseMinor(1n, { rateValue: 0n, multiplicity: 1n, indirect: false })).toThrow();
    expect(() => toBaseMinor(1n, { rateValue: 1n, multiplicity: 0n, indirect: false })).toThrow();
  });
});
