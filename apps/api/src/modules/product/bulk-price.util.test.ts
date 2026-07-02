import { describe, expect, it } from 'vitest';
import { type BulkPriceSpec, computeBulkPrice } from './bulk-price.util.js';

const spec = (o: Partial<BulkPriceSpec>): BulkPriceSpec => ({ mode: 'fixed', ...o });

describe('computeBulkPrice', () => {
  it('fixed: returns the explicit minor value', () => {
    expect(computeBulkPrice(spec({ mode: 'fixed', valueMinor: 500000n }), null)).toBe(500000n);
  });

  it('fixed: null value → null (skip, do not write 0)', () => {
    expect(computeBulkPrice(spec({ mode: 'fixed', valueMinor: null }), null)).toBeNull();
  });

  it('cost +absolute: base + delta (minor)', () => {
    // buyPrice 100.00 (10000) + 25.00 (2500) = 125.00
    const r = computeBulkPrice(
      spec({ mode: 'cost', adjustSign: '+', adjustValue: '2500', adjustUnit: 'currency' }),
      10000n,
    );
    expect(r).toBe(12500n);
  });

  it('cost -absolute: base - delta, clamped at 0', () => {
    const r = computeBulkPrice(
      spec({ mode: 'cost', adjustSign: '-', adjustValue: '999999', adjustUnit: 'currency' }),
      10000n,
    );
    expect(r).toBe(0n);
  });

  it('other +percent: base + base*pct/100 (10%)', () => {
    // 200.00 (20000) + 10% = 220.00 (22000)
    const r = computeBulkPrice(
      spec({ mode: 'other', adjustSign: '+', adjustValue: '10', adjustUnit: 'percent' }),
      20000n,
    );
    expect(r).toBe(22000n);
  });

  it('other +percent fractional: 10.5% of 20000 = 2100 → 22100', () => {
    const r = computeBulkPrice(
      spec({ mode: 'other', adjustSign: '+', adjustValue: '10.5', adjustUnit: 'percent' }),
      20000n,
    );
    expect(r).toBe(22100n);
  });

  it('cost -percent: 25% off 80000 = 60000', () => {
    const r = computeBulkPrice(
      spec({ mode: 'cost', adjustSign: '-', adjustValue: '25', adjustUnit: 'percent' }),
      80000n,
    );
    expect(r).toBe(60000n);
  });

  it('cost/other with null base → null (skip)', () => {
    expect(
      computeBulkPrice(
        spec({ mode: 'cost', adjustSign: '+', adjustValue: '10', adjustUnit: 'percent' }),
        null,
      ),
    ).toBeNull();
  });

  it('rounding integer: round-half-up to whole currency units', () => {
    // fixed 123.49 (12349) → 123.00 (12300); 123.50 (12350) → 124.00 (12400)
    expect(
      computeBulkPrice(spec({ mode: 'fixed', valueMinor: 12349n, rounding: 'integer' }), null),
    ).toBe(12300n);
    expect(
      computeBulkPrice(spec({ mode: 'fixed', valueMinor: 12350n, rounding: 'integer' }), null),
    ).toBe(12400n);
  });

  it('rounding none: keeps tiyin', () => {
    expect(
      computeBulkPrice(spec({ mode: 'fixed', valueMinor: 12349n, rounding: 'none' }), null),
    ).toBe(12349n);
  });

  it('percent on an odd base rounds the delta half-away-from-zero', () => {
    // 7% of 333 (3.33) = 23.31 minor → rounds to 23 → 356
    const r = computeBulkPrice(
      spec({ mode: 'other', adjustSign: '+', adjustValue: '7', adjustUnit: 'percent' }),
      333n,
    );
    expect(r).toBe(356n);
  });
});
