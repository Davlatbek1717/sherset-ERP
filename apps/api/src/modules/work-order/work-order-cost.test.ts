import { describe, expect, it } from 'vitest';
import {
  buildReversalDeltas,
  computeConsumptionCost,
  negateDecimalString,
} from './work-order-cost.js';

/**
 * Faza Q2 (`PP-05`) — WorkOrder weighted-average COGS, pure arithmetic.
 *
 * These lock the two halves of the contract independently of Prisma:
 *   A. consumption cost = per-store weighted average, `buyPrice` fallback,
 *      NULL (unknown) never collapsed into 0;
 *   B. reversal = EXACT negation of what the ledger recorded — never a
 *      recomputation from the current BOM / current average.
 */

const bal = (qty: string, costBalanceMinor?: string) => ({ qty, costBalanceMinor });

describe('computeConsumptionCost — weighted average (Faza Q2 / PP-05)', () => {
  it('books the per-store weighted average × consumed qty', () => {
    // flour: 100 units carrying 500_000 tiyin ⇒ 5_000/unit; consume 10 ⇒ 50_000
    // sugar:  20 units carrying  60_000 tiyin ⇒ 3_000/unit; consume  5 ⇒ 15_000
    const res = computeConsumptionCost(
      [
        { componentId: 'c1', productId: 'flour', quantity: '10' },
        { componentId: 'c2', productId: 'sugar', quantity: '5' },
      ],
      new Map([
        ['flour', bal('100', '500000')],
        ['sugar', bal('20', '60000')],
      ]),
      new Map(),
    );
    expect(res.lines[0]?.perUnitMinor).toBe(5000n);
    expect(res.lines[0]?.lineCostMinor).toBe(50000n);
    expect(res.lines[1]?.perUnitMinor).toBe(3000n);
    expect(res.lines[1]?.lineCostMinor).toBe(15000n);
    expect(res.hasCost).toBe(true);
    expect(res.totalCostMinor).toBe(65000n);
  });

  it('falls back to product buyPrice when the store carries no value (Loss precedent)', () => {
    const res = computeConsumptionCost(
      [{ componentId: 'c1', productId: 'flour', quantity: '4' }],
      new Map([['flour', bal('0', '0')]]),
      new Map([['flour', 7000n]]),
    );
    expect(res.lines[0]?.perUnitMinor).toBe(7000n);
    expect(res.totalCostMinor).toBe(28000n);
    expect(res.hasCost).toBe(true);
  });

  it('falls back to buyPrice on NEGATIVE stock too (value still leaves, never 0)', () => {
    const res = computeConsumptionCost(
      [{ componentId: 'c1', productId: 'flour', quantity: '2' }],
      new Map([['flour', bal('-5', '0')]]),
      new Map([['flour', 1250n]]),
    );
    expect(res.lines[0]?.perUnitMinor).toBe(1250n);
    expect(res.totalCostMinor).toBe(2500n);
  });

  it('NULL ≠ 0: no stock basis AND no buyPrice ⇒ perUnit null, not 0n', () => {
    const res = computeConsumptionCost(
      [{ componentId: 'c1', productId: 'ghost', quantity: '3' }],
      new Map(),
      new Map(), // buyPrice unknown (product.buyPrice IS NULL)
    );
    expect(res.lines[0]?.perUnitMinor).toBeNull();
    expect(res.lines[0]?.lineCostMinor).toBeNull();
    expect(res.hasCost).toBe(false);
    expect(res.totalCostMinor).toBe(0n);
  });

  it('buyPrice explicitly 0n is a KNOWN zero (distinct from unknown)', () => {
    const res = computeConsumptionCost(
      [{ componentId: 'c1', productId: 'free', quantity: '3' }],
      new Map(),
      new Map([['free', 0n]]),
    );
    expect(res.lines[0]?.perUnitMinor).toBe(0n);
    expect(res.lines[0]?.lineCostMinor).toBe(0n);
    expect(res.hasCost).toBe(true);
  });

  it('mixed known + unknown: total is the sum of the KNOWN lines only', () => {
    const res = computeConsumptionCost(
      [
        { componentId: 'c1', productId: 'flour', quantity: '2' },
        { componentId: 'c2', productId: 'ghost', quantity: '9' },
      ],
      new Map([['flour', bal('10', '20000')]]),
      new Map(),
    );
    expect(res.lines[0]?.lineCostMinor).toBe(4000n);
    expect(res.lines[1]?.lineCostMinor).toBeNull();
    expect(res.hasCost).toBe(true);
    expect(res.totalCostMinor).toBe(4000n);
  });

  it('empty BOM ⇒ no known cost (output stays NULL, zero regression)', () => {
    const res = computeConsumptionCost([], new Map(), new Map());
    expect(res.hasCost).toBe(false);
    expect(res.totalCostMinor).toBe(0n);
  });

  it('fractional qty is tiyin-exact (half-up), no float drift', () => {
    // 3 units carrying 1000 tiyin ⇒ 333.33/unit → round-half-up 333
    const res = computeConsumptionCost(
      [{ componentId: 'c1', productId: 'x', quantity: '0.5' }],
      new Map([['x', bal('3', '1000')]]),
      new Map(),
    );
    expect(res.lines[0]?.perUnitMinor).toBe(333n);
    expect(res.lines[0]?.lineCostMinor).toBe(167n); // 333 × 0.5 = 166.5 → 167
  });
});

describe('negateDecimalString', () => {
  it('flips sign exactly, without float', () => {
    expect(negateDecimalString('10')).toBe('-10');
    expect(negateDecimalString('-10')).toBe('10');
    expect(negateDecimalString('0.123456')).toBe('-0.123456');
    expect(negateDecimalString('0')).toBe('0');
  });
});

describe('buildReversalDeltas — frozen, ledger-sourced (Faza Q2 / PP-05)', () => {
  const postOps = [
    {
      storeId: 's1',
      assortmentKind: 'product',
      assortmentId: 'flour',
      qtyDelta: '-10',
      costDeltaMinor: -50000n,
      docPositionId: 'c1',
      cellId: null,
    },
    {
      storeId: 's1',
      assortmentKind: 'product',
      assortmentId: 'prod-out',
      qtyDelta: '50',
      costDeltaMinor: 50000n,
      docPositionId: null,
      cellId: null,
    },
  ];

  it('reverses qty AND value bit-for-bit (zero-sum)', () => {
    const rev = buildReversalDeltas(postOps);
    expect(rev).toHaveLength(2);
    expect(rev[0]).toMatchObject({
      assortmentId: 'flour',
      qtyDelta: '10',
      costDeltaMinor: 50000n,
      docPositionId: 'c1',
    });
    expect(rev[1]).toMatchObject({
      assortmentId: 'prod-out',
      qtyDelta: '-50',
      costDeltaMinor: -50000n,
    });
    // Σ(post) + Σ(reversal) === 0 on BOTH axes.
    const sumCost =
      postOps.reduce((a, o) => a + (o.costDeltaMinor ?? 0n), 0n) +
      rev.reduce((a, o) => a + (o.costDeltaMinor ?? 0n), 0n);
    expect(sumCost).toBe(0n);
  });

  it('legacy NULL cost stays NULL — never fabricates a value', () => {
    const rev = buildReversalDeltas([
      {
        storeId: 's1',
        assortmentKind: 'product',
        assortmentId: 'flour',
        qtyDelta: '-10',
        costDeltaMinor: null,
        docPositionId: 'c1',
        cellId: null,
      },
    ]);
    expect(rev[0]?.costDeltaMinor).toBeNull();
    expect(rev[0]?.qtyDelta).toBe('10');
  });

  it('is immune to a BOM edited after completion (it never reads the BOM)', () => {
    // Two rows for the SAME product (BOM listed it twice at completion time);
    // each reverses independently, so a later BOM edit cannot change the result.
    const rev = buildReversalDeltas([
      { ...postOps[0]!, docPositionId: 'c1', qtyDelta: '-3', costDeltaMinor: -300n },
      { ...postOps[0]!, docPositionId: 'c9', qtyDelta: '-7', costDeltaMinor: -700n },
    ]);
    expect(rev.map((r) => r.qtyDelta)).toEqual(['3', '7']);
    expect(rev.reduce((a, r) => a + (r.costDeltaMinor ?? 0n), 0n)).toBe(1000n);
  });
});
