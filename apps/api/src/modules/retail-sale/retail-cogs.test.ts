import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faza 18a (QAROR-A weighted-average, STK-02 HIGH) — POS stock-VALUE outflow.
 *
 * Bug-class (same family as the Loss always-zero COGS, loss-cogs.test.ts):
 * RetailSaleService.post() and refund() built their StockDeltas with
 * `costDeltaMinor: null`, so a POS sale decremented QTY but never the store's
 * cost balance → Stock.costBalanceMinor stayed while qty fell, inflating the
 * per-unit weighted average for every later consumer (Loss, Demand, reports).
 * A busy POS store's valuation drifted upward without bound.
 *
 * Fix: post() prices the outflow from the per-store locked balance
 * (costBalanceMinor ÷ on-hand via computePerUnitCost — the identical basis
 * Loss uses), falling back to the receipt's frozen buyPrice snapshot when the
 * store holds no value. refund() reverses the ORIGINAL sale's booked value via
 * buildRefundCostBasis/allocateRefundCost (see retail-refund-cogs.test.ts) —
 * never the current average, and NULL for legacy sales posted before the fix.
 */

const SERVICE = readFileSync(join(__dirname, 'retail-sale.service.ts'), 'utf8');
const STRIPPED = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('post() books a real weighted-average cost outflow (STK-02)', () => {
  it('the literal null cost delta is gone from the service', () => {
    expect(STRIPPED).not.toMatch(/costDeltaMinor:\s*null/);
  });

  it('the per-unit basis is the locked per-store balance, like Loss', () => {
    expect(STRIPPED).toMatch(/computePerUnitCost\(costBal, onHand\)/);
    expect(STRIPPED).toMatch(/costBalanceMinor/);
  });

  it('valueless stock falls back to the frozen buyPrice snapshot (NULL≠0 contract preserved)', () => {
    expect(STRIPPED).toMatch(/frozen\.get\(p\.productId\)\?\.costMinor \?\? 0n/);
  });

  it('the outflow delta carries the priced value (negative)', () => {
    expect(STRIPPED).toMatch(/costDeltaMinor: -scaleMinorByQty\(/);
  });
});

describe('refund() reverses the original booked value (zero-sum, legacy-safe)', () => {
  it('reads the ORIGINAL sale outflow rows + earlier refund inflow rows', () => {
    expect(STRIPPED).toMatch(/buildRefundCostBasis\(/);
    expect(STRIPPED).toMatch(/consumeRefundCost\(/);
  });

  it("prior refunds' ids reach the basis query (cumulative remainder)", () => {
    expect(STRIPPED).toMatch(/priorRefunds/);
    expect(STRIPPED).toMatch(/docId: \{ in: /);
  });
});
