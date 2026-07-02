import { describe, expect, it } from 'vitest';
import { computePositionTotal, scaleMinorByQty } from './position.js';

/** The legacy pattern this primitive replaces — kept here only to PROVE the
 * cases where the new math is intentionally different (more correct). */
function legacyScale(minorPerUnit: bigint, qtyStr: string): bigint {
  const qty = Number(qtyStr);
  return (minorPerUnit * BigInt(Math.round(qty * 1000))) / 1000n;
}

describe('scaleMinorByQty', () => {
  it('whole quantities match a plain multiply', () => {
    expect(scaleMinorByQty(100000n, '2')).toBe(200000n);
    expect(scaleMinorByQty(50000n, '3')).toBe(150000n);
  });

  it('agrees with the legacy 3-dp path for ≤3-decimal "nice" quantities', () => {
    for (const [price, qty] of [
      [100000n, '2'],
      [20000n, '5.5'],
      [250000n, '1.25'],
      [99999n, '10'],
    ] as Array<[bigint, string]>) {
      expect(scaleMinorByQty(price, qty)).toBe(legacyScale(price, qty));
    }
  });

  it('keeps the 4th–6th decimal the legacy path silently dropped', () => {
    // qty 0.0004 × 2500.00 sum (250000 tiyin) = 1.00 sum = 100 tiyin.
    expect(scaleMinorByQty(250000n, '0.0004')).toBe(100n);
    expect(legacyScale(250000n, '0.0004')).toBe(0n); // legacy billed nothing
    // 6-dp floor: 0.000001 × 10000 sum = 1 tiyin
    expect(scaleMinorByQty(1000000n, '0.000001')).toBe(1n);
  });

  it('rounds half-up instead of truncating toward zero', () => {
    // 100 tiyin × 0.335 = 33.5 tiyin → 34 (legacy truncated to 33)
    expect(scaleMinorByQty(100n, '0.335')).toBe(34n);
    expect(legacyScale(100n, '0.335')).toBe(33n);
  });

  it('handles zero, large, and negative inputs', () => {
    expect(scaleMinorByQty(999999n, '0')).toBe(0n);
    expect(scaleMinorByQty(0n, '12.5')).toBe(0n);
    // no float drift near the Decimal(20,6) ceiling
    expect(scaleMinorByQty(1n, '999999999999.999999')).toBe(1000000000000n);
    expect(scaleMinorByQty(100n, '-2.5')).toBe(-250n);
  });
});

describe('computePositionTotal', () => {
  it('basic qty × price, no VAT, no discount', () => {
    const r = computePositionTotal(
      { quantity: '2', priceMinor: '50000', discount: '0', vat: null },
      false,
      false,
    );
    // 2 × 500.00 sum = 1000.00 sum = 100000 tiyin
    expect(r.totalMinor).toBe(100000n);
    expect(r.vatAmountMinor).toBe(0n);
    expect(r.baseMinor).toBe(100000n);
  });

  it('decimal qty multiplies precisely', () => {
    const r = computePositionTotal(
      { quantity: '5.5', priceMinor: '20000', discount: '0', vat: null },
      false,
      false,
    );
    // 5.5 × 200.00 sum = 1100.00 sum = 110000 tiyin
    expect(r.totalMinor).toBe(110000n);
  });

  it('applies discount before VAT', () => {
    const r = computePositionTotal(
      { quantity: '1', priceMinor: '100000', discount: '10', vat: null },
      false,
      false,
    );
    // 1000 sum × (1 - 0.1) = 900 sum = 90000 tiyin
    expect(r.totalMinor).toBe(90000n);
  });

  it('VAT excluded — added on top of base', () => {
    const r = computePositionTotal(
      { quantity: '1', priceMinor: '100000', discount: '0', vat: 12 },
      true,
      false,
    );
    // base = 1000 sum = 100000 tiyin; vat = 12% = 12000; total = 112000 tiyin
    expect(r.baseMinor).toBe(100000n);
    expect(r.vatAmountMinor).toBe(12000n);
    expect(r.totalMinor).toBe(112000n);
  });

  it('VAT included — split out of total', () => {
    const r = computePositionTotal(
      { quantity: '1', priceMinor: '112000', discount: '0', vat: 12 },
      true,
      true,
    );
    // total 1120 sum (= 112000 tiyin); base = 1120 / 1.12 = 1000 sum = 100000 tiyin; vat = 12000
    expect(r.totalMinor).toBe(112000n);
    expect(r.baseMinor).toBe(100000n);
    expect(r.vatAmountMinor).toBe(12000n);
  });

  it('vatEnabled=false ignores vat field', () => {
    const r = computePositionTotal(
      { quantity: '1', priceMinor: '100000', discount: '0', vat: 12 },
      false,
      false,
    );
    expect(r.totalMinor).toBe(100000n);
    expect(r.vatAmountMinor).toBe(0n);
  });

  it('rounds half-up at tiyin boundary', () => {
    const r = computePositionTotal(
      { quantity: '1', priceMinor: '1', discount: '50', vat: null },
      false,
      false,
    );
    // 0.5 tiyin → rounds up to 1 tiyin
    expect(r.totalMinor).toBe(1n);
  });

  it('discount + VAT combined', () => {
    const r = computePositionTotal(
      { quantity: '2', priceMinor: '100000', discount: '10', vat: 12 },
      true,
      false,
    );
    // gross = 2000 sum; discount 10% = 1800 sum base; vat 12% = 216 sum; total = 2016 sum
    expect(r.baseMinor).toBe(180000n);
    expect(r.vatAmountMinor).toBe(21600n);
    expect(r.totalMinor).toBe(201600n);
  });

  it('accepts a fractional VAT rate (the doc grids feed a free-text «НДС», e.g. 7.5%)', () => {
    // The position grids pass `vat` straight from a free-text «НДС» input, so a
    // user can type 7.5. Scaling via Math.round(vat*10000) keeps it exact. The
    // old FE shortcut `BigInt(Number(vat))` threw a RangeError on 7.5 and
    // crashed the row's «Сумма» render — this locks that crash-class out.
    // 2 × 100.00 = 200.00 base; 7.5% = 15.00.
    const r = computePositionTotal(
      { quantity: '2', priceMinor: '10000', discount: '0', vat: 7.5 },
      true,
      false,
    );
    expect(r.baseMinor).toBe(20000n);
    expect(r.vatAmountMinor).toBe(1500n);
    expect(r.totalMinor).toBe(21500n);
  });

  it('handles 6-decimal quantity precision', () => {
    const r = computePositionTotal(
      { quantity: '0.000001', priceMinor: '1000000', discount: '0', vat: null },
      false,
      false,
    );
    // 0.000001 × 10000 sum = 0.01 sum = 1 tiyin
    expect(r.totalMinor).toBe(1n);
  });

  it('zero quantity yields zero total', () => {
    const r = computePositionTotal(
      { quantity: '0', priceMinor: '999999', discount: '0', vat: null },
      false,
      false,
    );
    expect(r.totalMinor).toBe(0n);
  });

  it('100% discount yields zero total', () => {
    const r = computePositionTotal(
      { quantity: '5', priceMinor: '100000', discount: '100', vat: null },
      false,
      false,
    );
    expect(r.totalMinor).toBe(0n);
  });

  it('single-rounds a discounted line (not the legacy double-round)', () => {
    // qty 3 × 33.34 tiyin = 100.02 tiyin gross; 10% off = 90.018 tiyin.
    // Single-round (correct, what the BE services + print now use): 9002.
    // Legacy double-round (round gross to tiyin THEN truncate the discount divide):
    //   scaleMinorByQty(3334,'3') = 10002 ; (10002 * 9000) / 10000 = 9001 (floored).
    const r = computePositionTotal(
      { quantity: '3', priceMinor: '3334', discount: '10', vat: null },
      false,
      false,
    );
    expect(r.totalMinor).toBe(9002n);
  });
});
