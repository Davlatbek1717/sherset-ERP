import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Sales-return / Purchase-return cost-of-goods gate (permanent regression guard).
 *
 * Bug-class (caught in the Cohort-A Phase-2 Session-3 A-battery, 2026-06-10c —
 * the direct sibling of the Loss COGS=0 fix `3add5a13`; Phase-1 had called both
 * return pages "clean"): both return `post()`s valued the stock movement at the
 * SALE / DOCUMENT price after discount (`priceAfterDisc`) instead of the goods'
 * carrying cost. So a posted return drifted `Stock.costBalanceMinor`:
 *   - sales-return (goods RE-ENTER): inflated value by the margin (sale − cost)
 *     × qty → the store weighted-average crept upward each return;
 *   - purchase-return (goods LEAVE): removed value at the doc price, which ≠ cost
 *     and could even drive costBalanceMinor negative.
 * Runtime-proven before/after: enter 10 @ 50000 (avg 50000) → SR qty2 @ sale 80000
 * made costBalance 600000 (weighted-avg) not 660000 (sale-price); PR qty2 @ doc
 * 15000 made it 400000 not 470000; both unpost round-trip to 500000.
 *
 * The fix sources the cost from the locked Stock balance's WEIGHTED-AVERAGE unit
 * cost (`costBalanceMinor ÷ qty-on-hand` via `computePerUnitCost`, the Loss basis),
 * freezes it onto the new `*ReturnPosition.costMinor` column at post-time, and has
 * unpost()/cancel() reverse the frozen `p.costMinor` (post↔unpost cost zero-sum).
 */

const SR = readFileSync(join(__dirname, 'sales-return.service.ts'), 'utf8');
const PR = readFileSync(
  join(__dirname, '..', 'purchase-return', 'purchase-return.service.ts'),
  'utf8',
);

for (const [name, src] of [
  ['sales-return', SR],
  ['purchase-return', PR],
] as const) {
  describe(`${name} post() values stock at weighted-average cost, not the document price`, () => {
    it('imports the exact per-unit cost helper', () => {
      // Faza Q17: the primitives moved to `shared/decimal.ts` and both services
      // now pull several of them, so the import is a multi-name block — match
      // the named import inside whatever block it lives in, not a fixed line.
      expect(src).toMatch(
        /import \{[^}]*\bcomputePerUnitCost\b[^}]*\} from '\.\.\/shared\/decimal\.js'/s,
      );
    });

    it('post() derives per-unit cost from the locked balance costBalanceMinor (weighted-average)', () => {
      expect(src).toMatch(/bal\?\.costBalanceMinor/);
      expect(src).toMatch(
        /perUnitByPos\.set\(p\.id, costBal > 0n \? computePerUnitCost\(costBal, onHand\) : 0n\)/,
      );
    });

    it('post() freezes the computed per-unit cost onto the position', () => {
      expect(src).toMatch(/data: \{ costMinor: perUnitByPos\.get\(p\.id\) \?\? 0n \}/);
    });

    it('unpost()/cancel() reverse the frozen p.costMinor (cost zero-sum), not a recomputed price', () => {
      expect(src).toMatch(/const costPerUnit = p\.costMinor \?\? 0n;/);
    });

    it('NON-VACUOUS: the old sale/doc-price cost basis is gone from the stock deltas', () => {
      // Before the fix every post/unpost/cancel delta computed
      //   const priceAfterDisc = disc > 0 ? ... : p.priceMinor;
      //   const valueMinor = (priceAfterDisc * BigInt(Math.round(qty * 1000))) / 1000n;
      // and used it for costDeltaMinor. The price-after-discount expression must
      // no longer feed the COST delta anywhere in the file. (priceAfterDisc may
      // still appear for the doc TOTAL math, but not as `const priceAfterDisc`
      // inside a StockDelta map — which is what this pattern matched.)
      expect(src).not.toMatch(
        /const priceAfterDisc =\s*\n\s*disc > 0\s*\n\s*\? \(p\.priceMinor \* BigInt\(Math\.round\(\(100 - disc\) \* 100\)\)\) \/ 10000n\s*\n\s*: p\.priceMinor;\s*\n\s*const valueMinor = \(priceAfterDisc \* BigInt\(Math\.round\(qty \* 1000\)\)\) \/ 1000n;/,
      );
    });
  });
}
