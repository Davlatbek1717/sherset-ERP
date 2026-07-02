import { describe, expect, it } from 'vitest';
import { computePositions } from './compute-positions.js';

const PRODUCT = '00000000-0000-0000-0000-000000000001';

describe('computePositions — basic arithmetic', () => {
  it('multiplies price × quantity for whole units', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '5', priceMinor: '120000', discount: '0' },
    ]);
    // 5 × 120,000 tiyin = 600,000 tiyin (= 6,000.00 UZS)
    expect(r.rows[0]!.lineMinor).toBe(600_000n);
    expect(r.totalMinor).toBe(600_000n);
  });

  it('handles fractional quantity (0.5 kg) without Float drift', () => {
    const r = computePositions([
      {
        productId: PRODUCT,
        quantity: '0.5',
        priceMinor: '300_000'.replace(/_/g, ''),
        discount: '0',
      },
    ]);
    // 0.5 × 300,000 = 150,000
    expect(r.rows[0]!.lineMinor).toBe(150_000n);
  });

  it('handles 0.1 + 0.2 across two lines without Float drift', () => {
    // Classic Float landmine: 0.1 + 0.2 !== 0.3 in JS Float64.
    // Each line: 0.1 × 1000 = 100; 0.2 × 1000 = 200. Total = 300.
    const r = computePositions([
      { productId: PRODUCT, quantity: '0.1', priceMinor: '1000', discount: '0' },
      { productId: PRODUCT, quantity: '0.2', priceMinor: '1000', discount: '0' },
    ]);
    expect(r.rows[0]!.lineMinor).toBe(100n);
    expect(r.rows[1]!.lineMinor).toBe(200n);
    expect(r.totalMinor).toBe(300n);
  });

  it('applies whole-percent discount (10% off)', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '1', priceMinor: '100000', discount: '10' },
    ]);
    // 100,000 × 0.9 = 90,000
    expect(r.rows[0]!.lineMinor).toBe(90_000n);
  });

  it('applies decimal-percent discount (10.5% off)', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '1', priceMinor: '100000', discount: '10.5' },
    ]);
    // 100,000 × 0.895 = 89,500
    expect(r.rows[0]!.lineMinor).toBe(89_500n);
  });

  it('skips discount math when discount is "0" (perf path)', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '7', priceMinor: '50000', discount: '0' },
    ]);
    expect(r.rows[0]!.lineMinor).toBe(350_000n);
  });
});

describe('computePositions — precision invariants', () => {
  it('preserves precision above 2^53 (Number.MAX_SAFE_INTEGER)', () => {
    // 9_007_199_254_740_993 = 2^53 + 1; Number rounds this to 2^53 (loses 1).
    // BigInt-only math must NOT drop the last digit.
    const huge = '9007199254740993';
    const r = computePositions([
      { productId: PRODUCT, quantity: '1', priceMinor: huge, discount: '0' },
    ]);
    expect(r.rows[0]!.lineMinor).toBe(BigInt(huge));
    // Sanity: multiply by 2 — Number(BigInt(huge)) * 2 would drift here.
    const r2 = computePositions([
      { productId: PRODUCT, quantity: '2', priceMinor: huge, discount: '0' },
    ]);
    expect(r2.rows[0]!.lineMinor).toBe(BigInt(huge) * 2n);
  });

  it('rounds quantity × price toward zero via BigInt division (integer math)', () => {
    // 0.001 × 1 minor = 0.001 minor → rounds to 0
    // We use Math.round on (qty × 1000) so 0.001 → qtyTimes1000 = 1
    // (1 × 1) / 1000 = 0 (integer division)
    const r = computePositions([
      { productId: PRODUCT, quantity: '0.001', priceMinor: '1', discount: '0' },
    ]);
    expect(r.rows[0]!.lineMinor).toBe(0n);
  });

  it('handles realistic POS receipt totals correctly', () => {
    // Real-world cart: 3 line items with mixed qty + discount
    const r = computePositions([
      { productId: PRODUCT, quantity: '2', priceMinor: '15000000', discount: '0' }, // 2 × 150k = 300k
      { productId: PRODUCT, quantity: '1.5', priceMinor: '8000000', discount: '5' }, // 1.5 × 80k × 0.95 = 114k
      { productId: PRODUCT, quantity: '10', priceMinor: '500000', discount: '0' }, // 10 × 5k = 50k
    ]);
    expect(r.rows[0]!.lineMinor).toBe(30_000_000n);
    expect(r.rows[1]!.lineMinor).toBe(11_400_000n);
    expect(r.rows[2]!.lineMinor).toBe(5_000_000n);
    expect(r.totalMinor).toBe(46_400_000n);
  });
});

describe('computePositions — defensive defaults', () => {
  it('treats missing discount as zero', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '1', priceMinor: '100000' } as never,
    ]);
    expect(r.rows[0]!.lineMinor).toBe(100_000n);
    expect(r.rows[0]!.discount).toBe('0');
  });

  it('returns zero totals for empty input', () => {
    const r = computePositions([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalMinor).toBe(0n);
  });

  it('preserves the productId and original quantity string in the row', () => {
    const r = computePositions([
      { productId: PRODUCT, quantity: '1.234', priceMinor: '1000', discount: '0' },
    ]);
    expect(r.rows[0]!.productId).toBe(PRODUCT);
    expect(r.rows[0]!.quantity).toBe('1.234');
  });
});
