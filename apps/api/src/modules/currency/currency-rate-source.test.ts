import { describe, expect, it } from 'vitest';
import { cbuRateToRateValue } from './currency-rate-source.js';

describe('cbuRateToRateValue — money-critical (Decimal, no float)', () => {
  it('plain rate, nominal 1, no margin → rate × 1e8', () => {
    expect(cbuRateToRateValue('12750.5', 1, null)).toBe(1_275_050_000_000n);
    expect(cbuRateToRateValue('1', 1, 0)).toBe(100_000_000n);
  });

  it('nominal divisor (rate quoted per 100)', () => {
    // 100 JPY = 8500 UZS ⇒ 1 JPY = 85 UZS ⇒ 85 × 1e8
    expect(cbuRateToRateValue('8500', 100, null)).toBe(8_500_000_000n);
  });

  it('applies margin percent exactly (no float drift)', () => {
    // 12000 × (1 + 2.5/100) = 12300 ⇒ ×1e8
    expect(cbuRateToRateValue('12000', 1, 2.5)).toBe(1_230_000_000_000n);
    // 0.1-style drift trap: 1000 × (1 + 0.1/100) = 1001
    expect(cbuRateToRateValue('1000', 1, 0.1)).toBe(100_100_000_000n);
  });

  it('rounds half-up away from zero at 1e8 precision', () => {
    // 1/3 ≈ 0.33333333 → ×1e8 = 33333333.33 → 33333333
    expect(cbuRateToRateValue('1', 3, null)).toBe(33_333_333n);
    // exactly .5 at the 1e8 boundary rounds up
    expect(cbuRateToRateValue('0.000000005', 1, null)).toBe(1n);
  });

  it('guards a bad nominal (≤0 / NaN) by treating it as 1', () => {
    expect(cbuRateToRateValue('500', 0, null)).toBe(50_000_000_000n);
    expect(cbuRateToRateValue('500', Number.NaN, null)).toBe(50_000_000_000n);
  });

  it('throws on a non-numeric CBU rate (corrupt feed)', () => {
    expect(() => cbuRateToRateValue('abc', 1, null)).toThrow();
  });
});
