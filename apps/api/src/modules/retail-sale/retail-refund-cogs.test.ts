import { describe, expect, it } from 'vitest';
import {
  allocateRefundCost,
  buildRefundCostBasis,
  consumeRefundCost,
} from './retail-refund-cogs.js';

/**
 * Faza 18a (QAROR-A weighted-average, STK-02) — POS refund stock-value reversal.
 *
 * post() now books the outflow at the store weighted-average (see
 * retail-cogs.test.ts). The refund inflow must return EXACTLY the value the
 * outflow took — not the current average (the store may have been restocked at
 * a different price since the sale) and not the buyPrice snapshot. The basis is
 * therefore read back from the original sale's own StockOperation rows, and
 * partial refunds allocate it with a cumulative remainder so the series is
 * exactly zero-sum: Σ(refund inflow value) === original outflow value.
 *
 * Legacy mirror: sales posted BEFORE this fix carry costDeltaMinor NULL on
 * their outflow rows — their refunds must book NULL too (adding value that was
 * never removed would inflate Stock.costBalanceMinor).
 */

const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function postOp(assortmentId: string, qty: string, costMinor: bigint | null) {
  // outflow rows: negative qty, negative cost
  return {
    assortmentId,
    qtyDelta: `-${qty}`,
    costDeltaMinor: costMinor === null ? null : -costMinor,
  };
}

function refundOp(assortmentId: string, qty: string, costMinor: bigint | null) {
  // inflow rows: positive qty, positive cost
  return { assortmentId, qtyDelta: qty, costDeltaMinor: costMinor };
}

describe('buildRefundCostBasis aggregates the original outflow per product', () => {
  it('nets the original post rows into (remainingCost, remainingQty)', () => {
    const basis = buildRefundCostBasis([postOp(P1, '10', 1_000_000n)], []);
    const b = basis.get(P1);
    expect(b).toBeDefined();
    expect(b?.hasCost).toBe(true);
    expect(b?.remainingCostMinor).toBe(1_000_000n);
    expect(b?.remainingQty).toBe('10');
  });

  it('subtracts what earlier partial refunds already returned', () => {
    const basis = buildRefundCostBasis(
      [postOp(P1, '10', 1_000_000n)],
      [refundOp(P1, '3', 300_000n)],
    );
    const b = basis.get(P1);
    expect(b?.remainingCostMinor).toBe(700_000n);
    expect(b?.remainingQty).toBe('7');
  });

  it('keeps products independent (multi-line receipt)', () => {
    const basis = buildRefundCostBasis(
      [postOp(P1, '2', 500_000n), postOp(P2, '4', 800_000n)],
      [refundOp(P2, '1', 200_000n)],
    );
    expect(basis.get(P1)?.remainingCostMinor).toBe(500_000n);
    expect(basis.get(P2)?.remainingCostMinor).toBe(600_000n);
    expect(basis.get(P2)?.remainingQty).toBe('3');
  });

  it('a legacy original (NULL costDeltaMinor) yields hasCost=false', () => {
    const basis = buildRefundCostBasis([postOp(P1, '10', null)], []);
    expect(basis.get(P1)?.hasCost).toBe(false);
  });
});

describe('allocateRefundCost — cumulative-remainder allocation (exact zero-sum)', () => {
  it('a full refund returns exactly the original outflow value', () => {
    const basis = buildRefundCostBasis([postOp(P1, '10', 1_000_000n)], []);
    expect(allocateRefundCost(basis.get(P1), '10')).toBe(1_000_000n);
  });

  it('a proportional partial refund', () => {
    const basis = buildRefundCostBasis([postOp(P1, '10', 1_000_000n)], []);
    expect(allocateRefundCost(basis.get(P1), '3')).toBe(300_000n);
  });

  it('an indivisible total drains to exactly zero over the series (333+334+333)', () => {
    // 3 units worth 1000 tiyin total — no per-unit tiyin value exists.
    let prior: Array<{ assortmentId: string; qtyDelta: string; costDeltaMinor: bigint | null }> =
      [];
    const orig = [postOp(P1, '3', 1000n)];
    const r1 = allocateRefundCost(buildRefundCostBasis(orig, prior).get(P1), '1');
    expect(r1).toBe(333n);
    prior = [...prior, refundOp(P1, '1', r1)];
    const r2 = allocateRefundCost(buildRefundCostBasis(orig, prior).get(P1), '1');
    expect(r2).toBe(334n);
    prior = [...prior, refundOp(P1, '1', r2)];
    const r3 = allocateRefundCost(buildRefundCostBasis(orig, prior).get(P1), '1');
    expect(r3).toBe(333n);
    expect((r1 ?? 0n) + (r2 ?? 0n) + (r3 ?? 0n)).toBe(1000n);
  });

  it('the final partial refund drains the remainder exactly (no residue)', () => {
    const basis = buildRefundCostBasis(
      [postOp(P1, '10', 1_000_001n)],
      [refundOp(P1, '9', 900_001n)],
    );
    expect(allocateRefundCost(basis.get(P1), '1')).toBe(100_000n);
  });

  it('a legacy original books NULL (mirror — no value was removed on post)', () => {
    const basis = buildRefundCostBasis([postOp(P1, '10', null)], []);
    expect(allocateRefundCost(basis.get(P1), '5')).toBeNull();
  });

  it('an unknown product (no basis) books NULL, never a fabricated cost', () => {
    expect(allocateRefundCost(undefined, '5')).toBeNull();
  });

  it('over-drain is clamped: qty beyond the remainder returns the remainder, not more', () => {
    const basis = buildRefundCostBasis(
      [postOp(P1, '10', 1_000_000n)],
      [refundOp(P1, '9', 900_000n)],
    );
    // upstream validation blocks over-refund; if it ever regressed, the value
    // reversal must still never return more than what is left.
    expect(allocateRefundCost(basis.get(P1), '5')).toBe(100_000n);
  });
});

describe('consumeRefundCost — same product on several lines of ONE refund', () => {
  it('each line draws from what the previous lines left (never a double share)', () => {
    const basisMap = buildRefundCostBasis([postOp(P1, '3', 1000n)], []);
    const l1 = consumeRefundCost(basisMap, P1, '1');
    const l2 = consumeRefundCost(basisMap, P1, '2');
    expect(l1).toBe(333n);
    expect(l2).toBe(667n); // the remainder — NOT round(1000×2/3)=667 by luck: remainder-exact
    expect((l1 ?? 0n) + (l2 ?? 0n)).toBe(1000n);
  });

  it('legacy stays NULL through the consuming wrapper too', () => {
    const basisMap = buildRefundCostBasis([postOp(P1, '3', null)], []);
    expect(consumeRefundCost(basisMap, P1, '1')).toBeNull();
  });
});
