import { describe, expect, it } from 'vitest';
import {
  type OriginalLine,
  validateRefundAmount,
  validateRefundPositions,
} from './retail-refund-validation.js';

const sale: OriginalLine[] = [
  { productId: 'A', quantity: '3' },
  { productId: 'B', quantity: '1.5' },
];

describe('validateRefundPositions — enforces the documented subset contract', () => {
  it('accepts a valid subset (qty <= sold)', () => {
    expect(validateRefundPositions(sale, [{ productId: 'A', quantity: '2' }])).toBeNull();
    expect(
      validateRefundPositions(sale, [
        { productId: 'A', quantity: '3' },
        { productId: 'B', quantity: '1.5' },
      ]),
    ).toBeNull();
  });

  it('REJECTS over-refund: qty > sold (the §105 bug)', () => {
    expect(validateRefundPositions(sale, [{ productId: 'A', quantity: '4' }])).toMatch(
      /exceeds sold qty/,
    );
  });

  it('REJECTS split refund lines that COLLECTIVELY over-refund', () => {
    // 2 + 2 = 4 > 3 sold, even though each line < 3.
    expect(
      validateRefundPositions(sale, [
        { productId: 'A', quantity: '2' },
        { productId: 'A', quantity: '2' },
      ]),
    ).toMatch(/exceeds sold qty/);
  });

  it('accepts split refund lines that collectively stay within sold', () => {
    expect(
      validateRefundPositions(sale, [
        { productId: 'A', quantity: '1' },
        { productId: 'A', quantity: '2' },
      ]),
    ).toBeNull();
  });

  it('REJECTS a product never in the original sale', () => {
    expect(validateRefundPositions(sale, [{ productId: 'Z', quantity: '1' }])).toMatch(
      /not in the original sale/,
    );
  });

  it('REJECTS zero / negative refund qty', () => {
    expect(validateRefundPositions(sale, [{ productId: 'A', quantity: '0' }])).toMatch(
      /must be > 0/,
    );
  });

  it('aggregates original split lines (sold qty summed across lines)', () => {
    const split: OriginalLine[] = [
      { productId: 'A', quantity: '2' },
      { productId: 'A', quantity: '2' },
    ];
    expect(validateRefundPositions(split, [{ productId: 'A', quantity: '4' }])).toBeNull();
    expect(validateRefundPositions(split, [{ productId: 'A', quantity: '4.000001' }])).toMatch(
      /exceeds sold qty/,
    );
  });

  it('ignores null-product (service) original lines', () => {
    const withService: OriginalLine[] = [
      { productId: null, quantity: '1' },
      { productId: 'A', quantity: '2' },
    ];
    expect(validateRefundPositions(withService, [{ productId: 'A', quantity: '2' }])).toBeNull();
  });

  it('exact at the 6th decimal (Decimal(20,6) boundary)', () => {
    const s: OriginalLine[] = [{ productId: 'A', quantity: '1.000000' }];
    expect(validateRefundPositions(s, [{ productId: 'A', quantity: '1.000000' }])).toBeNull();
    expect(validateRefundPositions(s, [{ productId: 'A', quantity: '1.000001' }])).toMatch(
      /exceeds sold qty/,
    );
  });
});

describe('validateRefundAmount — cannot pay back more than refunded value', () => {
  it('accepts payout == refunded value', () => {
    expect(validateRefundAmount(1_000_00n, 600_00n, 400_00n)).toBeNull();
  });

  it('accepts payout < refunded value (partial cash settlement)', () => {
    expect(validateRefundAmount(1_000_00n, 500_00n, 0n)).toBeNull();
  });

  it('REJECTS payout > refunded value (over-refunded cash)', () => {
    expect(validateRefundAmount(1_000_00n, 800_00n, 300_00n)).toMatch(/exceeds refunded value/);
  });

  it('REJECTS negative cash/card', () => {
    expect(validateRefundAmount(1_000_00n, -1n, 0n)).toMatch(/non-negative/);
  });

  it('exact BigInt at the boundary (no off-by-one)', () => {
    expect(validateRefundAmount(100n, 50n, 50n)).toBeNull();
    expect(validateRefundAmount(100n, 50n, 51n)).toMatch(/exceeds refunded value/);
  });
});
