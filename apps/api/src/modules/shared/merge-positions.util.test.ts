import { describe, expect, it } from 'vitest';
import {
  type MergeSourcePosition,
  combineMergePositions,
  microToQuantity,
  quantityToMicro,
} from './merge-positions.util.js';

function pos(p: Partial<MergeSourcePosition>): MergeSourcePosition {
  return {
    assortmentKind: 'product',
    assortmentId: 'prod-A',
    productId: 'prod-A',
    quantity: '1',
    priceMinor: 100_000n,
    discount: '0',
    vat: null,
    vatEnabled: true,
    ...p,
  };
}

describe('quantity micro-unit helpers', () => {
  it('round-trips integers and decimals without float drift', () => {
    for (const q of ['0', '1', '23', '0.1', '0.2', '1.5', '0.123456', '1000000.000001']) {
      expect(microToQuantity(quantityToMicro(q))).toBe(q.replace(/\.?0+$/, '') || '0');
    }
  });

  it('0.1 + 0.2 sums to exactly 0.3 (the classic float trap)', () => {
    expect(microToQuantity(quantityToMicro('0.1') + quantityToMicro('0.2'))).toBe('0.3');
  });

  it('clamps quantity precision to 6 fractional digits', () => {
    expect(quantityToMicro('1.1234567')).toBe(1_123_456n);
  });

  it('treats empty / nullish quantity as zero', () => {
    expect(quantityToMicro('')).toBe(0n);
    expect(quantityToMicro(null)).toBe(0n);
    expect(quantityToMicro(undefined)).toBe(0n);
  });
});

describe('combineMergePositions', () => {
  it('returns [] for no positions', () => {
    expect(combineMergePositions([])).toEqual([]);
    expect(combineMergePositions([{ positions: [] }, { positions: [] }])).toEqual([]);
  });

  it('keeps distinct products as separate lines, first-seen order preserved', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentId: 'A', productId: 'A' })] },
      { positions: [pos({ assortmentId: 'B', productId: 'B' })] },
    ]);
    expect(out.map((p) => p.assortmentId)).toEqual(['A', 'B']);
    expect(out).toHaveLength(2);
  });

  it('SUMS identical lines (same assortment + price + discount + vat) across orders', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentId: 'A', quantity: '5', priceMinor: 100_000n })] },
      { positions: [pos({ assortmentId: 'A', quantity: '3', priceMinor: 100_000n })] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe('8');
    expect(out[0].priceMinor).toBe(100_000n);
  });

  it('keeps the SAME product at DIFFERENT prices as separate lines (never loses price)', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentId: 'A', quantity: '5', priceMinor: 100_000n })] },
      { positions: [pos({ assortmentId: 'A', quantity: '3', priceMinor: 120_000n })] },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.priceMinor)).toEqual([100_000n, 120_000n]);
  });

  it('keeps the same product/price with DIFFERENT discount or vat separate', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentId: 'A', discount: '0', vat: 12 })] },
      { positions: [pos({ assortmentId: 'A', discount: '5', vat: 12 })] },
      { positions: [pos({ assortmentId: 'A', discount: '0', vat: 0 })] },
    ]);
    expect(out).toHaveLength(3);
  });

  it('sums decimal quantities of duplicates without drift', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentId: 'A', quantity: '0.1' })] },
      { positions: [pos({ assortmentId: 'A', quantity: '0.2' })] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe('0.3');
  });

  it('combines a realistic mixed set (duplicates summed, distinct kept, order stable)', () => {
    const out = combineMergePositions([
      {
        positions: [
          pos({ assortmentId: 'A', quantity: '2', priceMinor: 100_000n }),
          pos({ assortmentId: 'B', quantity: '1', priceMinor: 50_000n }),
        ],
      },
      {
        positions: [
          pos({ assortmentId: 'A', quantity: '4', priceMinor: 100_000n }), // dup of A
          pos({ assortmentId: 'C', quantity: '7', priceMinor: 70_000n }),
        ],
      },
    ]);
    expect(out.map((p) => [p.assortmentId, p.quantity])).toEqual([
      ['A', '6'],
      ['B', '1'],
      ['C', '7'],
    ]);
  });

  it('carries productId null for non-product assortments', () => {
    const out = combineMergePositions([
      { positions: [pos({ assortmentKind: 'service', assortmentId: 'S', productId: null })] },
    ]);
    expect(out[0]).toMatchObject({ assortmentKind: 'service', productId: null });
  });
});
