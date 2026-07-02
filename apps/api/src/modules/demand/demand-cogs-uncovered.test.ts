import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Class-lock for the demand COGS-on-uncovered-stock fix (2026-06-14).
 *
 * consumeFifo() used to `return { totalCostMinor, uncoveredQty }` straight after
 * the FIFO walk, so units beyond FIFO depth (only reachable with
 * allowNegativeStock) contributed 0 to COGS — understating costSumMinor and
 * inflating «Прибыль» on every oversell. The fix costs the uncovered portion at
 * the weighted-average of the lots the line drew (or the most recent posted lot
 * when 0 on hand) and records it as a 0-qty consumption row so reverseFifo()
 * reverses it symmetrically on unpost/cancel (stock-value cycle zero-sum).
 *
 * Non-vacuous: before the fix none of the uncovered-basis branch, the
 * most-recent-lot fallback query, or the `quantity: '0'` ledger row existed.
 * Runtime cert: scripts/verify-demand-cogs-uncovered-smoke.mjs 5/5.
 */

const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');
const STRIPPED = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('demand consumeFifo costs uncovered (negative-stock) units (COGS class-lock)', () => {
  it('detects the uncovered remainder (remaining > 0) instead of returning straight away', () => {
    expect(STRIPPED).toMatch(/compareDecimals\(remaining,\s*'0'\)\s*>\s*0/);
  });

  it('uses the weighted-average of the drawn lots as the basis when something was covered', () => {
    expect(STRIPPED).toMatch(/computePerUnitCost\(totalCost,\s*coveredQty\)/);
  });

  it('falls back to the most-recent posted supply lot cost when 0 on hand', () => {
    expect(STRIPPED).toMatch(/ORDER BY s\.moment DESC, sp\.position DESC\s*\n\s*LIMIT 1/);
  });

  it('records the uncovered cost as a 0-qty consumption row (symmetric reverseFifo)', () => {
    // a demandPositionCostConsumption.create with quantity: '0' (the uncovered row)
    expect(STRIPPED).toMatch(
      /demandPositionCostConsumption\.create\(\{[\s\S]*?quantity:\s*'0'[\s\S]*?lineCostMinor:\s*uncoveredCost/,
    );
    expect(STRIPPED).toMatch(/totalCost\s*\+=\s*uncoveredCost/);
  });

  it('only attributes a cost when a lot anchor + positive basis exist (degenerate → still 0)', () => {
    expect(STRIPPED).toMatch(/if\s*\(basisLotId\s*&&\s*basisUnit\s*>\s*0n\)/);
  });
});
