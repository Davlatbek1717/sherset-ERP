import { describe, expect, it } from 'vitest';
import {
  type OriginalLine,
  type OriginalPricedLine,
  priceRefundFromOriginal,
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
    expect(validateRefundAmount(100n, 50n, 51n)).toMatch(/exceeds refunded value/);
    expect(validateRefundAmount(100n, 50n, 50n)).toBeNull();
  });
});

/**
 * SALES-01 (CRITICAL) — the refund used to be priced from the CLIENT's
 * `priceMinor`, so `validateRefundAmount` capped the payout against a number
 * the attacker supplied. `priceRefundFromOriginal` removes the client from the
 * money path entirely: the refund value comes from the original receipt's own
 * (already discounted) `sumMinor`, prorated by the refunded quantity.
 *
 * Invariant this function must never break:
 *   Σ(refund lineMinor per product) ≤ Σ(original sumMinor per product)
 * — which, summed over products, is `Σ refund ≤ original.sumMinor`.
 */
describe('priceRefundFromOriginal — refund value comes from the ORIGINAL receipt', () => {
  const discounted: OriginalPricedLine[] = [
    // 1 000 000 tiyin × 1 dona, 10% chegirma → mijoz 900 000 to'lagan.
    { productId: 'A', quantity: '1', priceMinor: 1_000_000n, discount: '10', sumMinor: 900_000n },
  ];

  it('prices a full refund at the DISCOUNTED sum the customer actually paid (FE-01)', () => {
    const priced = priceRefundFromOriginal(discounted, [{ productId: 'A', quantity: '1' }]);
    expect(priced.totalMinor).toBe(900_000n);
    expect(priced.rows).toHaveLength(1);
    expect(priced.rows[0]?.lineMinor).toBe(900_000n);
  });

  it('carries the original priceMinor/discount onto the mirror row', () => {
    const priced = priceRefundFromOriginal(discounted, [{ productId: 'A', quantity: '1' }]);
    expect(priced.rows[0]?.priceMinor).toBe(1_000_000n);
    expect(priced.rows[0]?.discount).toBe('10');
    expect(priced.rows[0]?.quantity).toBe('1');
  });

  it('prorates a partial refund by quantity', () => {
    const ten: OriginalPricedLine[] = [
      { productId: 'A', quantity: '10', priceMinor: 100_000n, discount: '10', sumMinor: 900_000n },
    ];
    expect(priceRefundFromOriginal(ten, [{ productId: 'A', quantity: '3' }]).totalMinor).toBe(
      270_000n,
    );
  });

  it('aggregates original split lines of the SAME product at DIFFERENT prices', () => {
    // 1 dona 100 tiyinga + 1 dona 10 tiyinga sotilgan → jami 110.
    const mixed: OriginalPricedLine[] = [
      { productId: 'A', quantity: '1', priceMinor: 100n, discount: '0', sumMinor: 100n },
      { productId: 'A', quantity: '1', priceMinor: 10n, discount: '0', sumMinor: 10n },
    ];
    // Har birini alohida narxlash 200 berardi (first-line-wins) — jami 110 bo'lishi shart.
    expect(priceRefundFromOriginal(mixed, [{ productId: 'A', quantity: '2' }]).totalMinor).toBe(
      110n,
    );
  });

  it('never exceeds the original sum when rounding (floor, split lines)', () => {
    // 3 dona = 100 tiyin: har dona 33.33 — uchta 34 tiyin 102 berardi.
    const odd: OriginalPricedLine[] = [
      { productId: 'A', quantity: '3', priceMinor: 34n, discount: '0', sumMinor: 100n },
    ];
    const priced = priceRefundFromOriginal(odd, [
      { productId: 'A', quantity: '1' },
      { productId: 'A', quantity: '1' },
      { productId: 'A', quantity: '1' },
    ]);
    expect(priced.totalMinor).toBeLessThanOrEqual(100n);
    expect(priced.totalMinor).toBe(99n);
  });

  it('handles fractional (weighed) quantities exactly', () => {
    const weighed: OriginalPricedLine[] = [
      { productId: 'A', quantity: '1.5', priceMinor: 100n, discount: '0', sumMinor: 150n },
    ];
    expect(priceRefundFromOriginal(weighed, [{ productId: 'A', quantity: '0.5' }]).totalMinor).toBe(
      50n,
    );
  });

  it('prices a product missing from the original as 0 (never a payout)', () => {
    // validateRefundPositions rejects this first; belt-and-braces so a future
    // caller reordering the guards cannot turn it into free cash.
    const priced = priceRefundFromOriginal(discounted, [{ productId: 'Z', quantity: '1' }]);
    expect(priced.totalMinor).toBe(0n);
  });

  it('ignores null-product (service) original lines', () => {
    const withService: OriginalPricedLine[] = [
      { productId: null, quantity: '1', priceMinor: 500n, discount: '0', sumMinor: 500n },
      { productId: 'A', quantity: '2', priceMinor: 100n, discount: '0', sumMinor: 200n },
    ];
    expect(
      priceRefundFromOriginal(withService, [{ productId: 'A', quantity: '2' }]).totalMinor,
    ).toBe(200n);
  });
});
