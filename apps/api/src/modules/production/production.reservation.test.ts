import { describe, expect, it } from 'vitest';
import { aggregateBomReservations } from './production.service.js';

/**
 * §115 / round-4 unit 2b — adversarial coverage of the
 * correctness-critical Production → child-PO BOM → reservation math,
 * with NO database (the §97 / CLAUDE.md mandatory-stock-QA discipline).
 *
 *   runs = (PO.quantity / 1000) / BOM.outputQty   (quantity is ×1000)
 *   perComponent = component.qty × runs
 */
describe('aggregateBomReservations', () => {
  const C = (productId: string, qty: string) => ({ productId, qty });

  it('1 PO · 1 unit (qty 1000) · outputQty 1 ⇒ component.qty × 1', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: '1', components: [C('p1', '2.5')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '2.5' }]);
  });

  it('×1000 scaling: qty 2500 = 2.5 units, comp 2 ⇒ 5', () => {
    const r = aggregateBomReservations([
      { quantity: '2500', outputQty: '1', components: [C('p1', '2')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '5' }]);
  });

  it('outputQty > 1: 10 units / outputQty 5 = 2 runs × comp 3 ⇒ 6', () => {
    const r = aggregateBomReservations([
      { quantity: '10000', outputQty: '5', components: [C('p1', '3')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '6' }]);
  });

  it('outputQty 0 ⇒ that PO contributes 0 (NO divide-by-zero / Infinity)', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: '0', components: [C('p1', '5')] },
    ]);
    expect(r).toEqual([]);
  });

  it('outputQty null (no BOM) ⇒ skipped', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: null, components: [C('p1', '5')] },
    ]);
    expect(r).toEqual([]);
  });

  it('negative outputQty ⇒ skipped (guard, never negative reserve)', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: '-2', components: [C('p1', '5')] },
    ]);
    expect(r).toEqual([]);
  });

  it('multiple POs of the SAME product aggregate', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: '1', components: [C('p1', '2')] },
      { quantity: '3000', outputQty: '1', components: [C('p1', '2')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '8' }]); // 2 + 6
  });

  it('multiple components ⇒ separate entries', () => {
    const r = aggregateBomReservations([
      { quantity: '2000', outputQty: '1', components: [C('p1', '1'), C('p2', '0.5')] },
    ]);
    expect(r).toContainEqual({ productId: 'p1', qty: '2' });
    expect(r).toContainEqual({ productId: 'p2', qty: '1' });
    expect(r).toHaveLength(2);
  });

  it('fractional runs (1.5) scale components exactly', () => {
    // 1500/1000 = 1.5 units / outputQty 1 = 1.5 runs × 0.4 = 0.6
    const r = aggregateBomReservations([
      { quantity: '1500', outputQty: '1', components: [C('p1', '0.4')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '0.6' }]);
  });

  it('soft-hold estimate is 6-dp rounded (documented; release stays exact via ledger)', () => {
    // 1.5 runs × 0.333333 = 0.4999995 → toFixed(6) float ⇒ "0.499999".
    // This is an ESTIMATE; the correctness-critical invariant (release
    // == exactly what was reserved) is the ledger's job, not this.
    const r = aggregateBomReservations([
      { quantity: '1500', outputQty: '1', components: [C('p1', '0.333333')] },
    ]);
    expect(r).toEqual([{ productId: 'p1', qty: '0.499999' }]);
  });

  it('zero / negative component qty ⇒ dropped', () => {
    const r = aggregateBomReservations([
      { quantity: '1000', outputQty: '1', components: [C('p1', '0'), C('p2', '-3')] },
    ]);
    expect(r).toEqual([]);
  });

  it('product summing to exactly 0 ⇒ no zero-qty ledger row', () => {
    const r = aggregateBomReservations([
      { quantity: '0', outputQty: '1', components: [C('p1', '5')] },
    ]);
    expect(r).toEqual([]);
  });

  it('empty orders ⇒ [] (post still succeeds, nothing reserved)', () => {
    expect(aggregateBomReservations([])).toEqual([]);
  });

  it('trims trailing zeros: 3.000000 ⇒ "3", 1.500000 ⇒ "1.5"', () => {
    const r = aggregateBomReservations([
      { quantity: '3000', outputQty: '1', components: [C('p1', '1')] },
      { quantity: '1500', outputQty: '1', components: [C('p2', '1')] },
    ]);
    expect(r).toContainEqual({ productId: 'p1', qty: '3' });
    expect(r).toContainEqual({ productId: 'p2', qty: '1.5' });
  });
});
