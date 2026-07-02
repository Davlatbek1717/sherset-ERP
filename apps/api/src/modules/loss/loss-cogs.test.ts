import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Loss (Списание) cost-of-goods gate (permanent regression guard).
 *
 * Bug-class (caught in the Stock+internal Phase-2 A-battery, 2026-06-10 — the
 * buyPrice/cost runtime bug-class, sibling of 066d55fb; Phase-1 had called the
 * losses page "clean"): the write-off form is qty-only, so `LossPosition.costMinor`
 * is NULL on every draft. `post()` computed `costPerUnit = p.costMinor ?? 0n`, i.e.
 * ALWAYS 0 — so:
 *   1. `sumMinor` («Себестоимость списания») was always 0 on a posted write-off; and
 *   2. the stock-cost ledger delta was `costDeltaMinor: -0n`, so a write-off dropped
 *      QTY but never decremented inventory VALUE → valuation drift (qty falls,
 *      Stock.costBalanceMinor stays).
 *
 * The fix sources the cost basis from the locked Stock balance's WEIGHTED-AVERAGE
 * unit cost (`costBalanceMinor ÷ qty-on-hand` via `computePerUnitCost`) — the same
 * average the inbound enter/supply maintain through `applyDeltas`. The per-unit cost
 * is frozen onto the position so unpost/cancel reverse the identical value
 * (post↔unpost cost zero-sum). Verified live: enter qty10 @ 50000 → loss qty3 records
 * sumMinor 150000 (was 0), a second loss qty2 still values @ 50000 (avg unchanged ⇒
 * costBalance was decremented proportionally), and the post→unpost cycle round-trips.
 *
 * (sales-return AND purchase-return WERE in this same class — they valued the
 * stock movement at the SALE/DOCUMENT `priceMinor`, drifting Stock.costBalanceMinor
 * by the margin. Fixed 2026-06-10c to the same weighted-average basis — see
 * `../sales-return/returns-cogs.test.ts`. Inventory shortage passing
 * `costDeltaMinor: null` is a deliberate, separately-grounded decision — see
 * NEXT.md, not fixed here.)
 */

const SERVICE = join(__dirname, 'loss.service.ts');

describe('loss post() records real weighted-average COGS (not a hardcoded 0)', () => {
  const src = readFileSync(SERVICE, 'utf8');

  it('imports the exact per-unit cost helper', () => {
    expect(src).toMatch(/import \{ computePerUnitCost \} from '\.\.\/demand\/fifo-consumer\.js'/);
  });

  it('post() derives the per-unit cost from the locked balance costBalanceMinor (weighted-average)', () => {
    // The cost basis is the store's current weighted-average unit cost, read from
    // the balance row that post() already locks via lockBalances.
    expect(src).toMatch(/bal\?\.costBalanceMinor/);
    expect(src).toMatch(
      /perUnitByPos\.set\(p\.id, costBal > 0n \? computePerUnitCost\(costBal, onHand\) : 0n\)/,
    );
  });

  it('the stock-cost delta + the frozen position cost both come from the computed per-unit (not the null draft cost)', () => {
    expect(src).toMatch(/const costPerUnit = perUnitByPos\.get\(p\.id\) \?\? 0n;/);
    expect(src).toMatch(/data: \{ costMinor: perUnitByPos\.get\(p\.id\) \?\? 0n \}/);
  });

  it('the buggy `costMinor: p.costMinor ?? 0n` persist (always-zero COGS) is gone', () => {
    // Non-vacuous: this exact line existed before the fix and must never return.
    // (unpost/cancel still READ p.costMinor to reverse the frozen value — that is
    // correct and intentionally not matched here.)
    expect(src).not.toMatch(/data: \{ costMinor: p\.costMinor \?\? 0n \}/);
  });
});
