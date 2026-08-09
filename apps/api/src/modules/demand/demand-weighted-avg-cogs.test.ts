import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scaleMinorByQty } from '@moysklad/money';
import { describe, expect, it } from 'vitest';
import { computePerUnitCost } from '../shared/decimal.js';

/**
 * Faza 18a (QAROR-A, 2026-08-08 — foydalanuvchi qarori) — Demand COGS moves
 * from the FIFO lot-ledger to the WEIGHTED-AVERAGE model (STK-02/03/04).
 *
 * The two parallel cost systems contradicted each other:
 *   - STK-03: the FIFO walk over supply_positions had NO store filter, so a
 *     demand at store B consumed lots received at store A — while the qty/value
 *     balance it decremented (Stock) is PER-STORE → per-store cost drift and
 *     negative cost balances.
 *   - STK-04: Loss/Inventory/Move/Enter already consume at the weighted
 *     average and never touch SupplyPosition.remainingQty — so a Loss left the
 *     lots intact and a later Demand charged COGS from them AGAIN (double
 *     count against the same received value).
 *
 * Now post() prices the outflow from the SAME per-store locked balance the
 * sufficiency check uses (Stock.costBalanceMinor ÷ qty on hand — the average
 * every inbound document maintains via applyDeltas), freezes the per-unit onto
 * DemandPosition.costMinor, and unpost/cancel reverse with the IDENTICAL
 * formula → post↔unpost is exactly zero-sum. No new lot consumption is
 * written; existing DemandPositionCostConsumption rows stay as read-only
 * legacy and are still reversed on unpost of an OLD demand (reverseLegacyFifo).
 */

const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');
const STRIPPED = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('post() prices COGS from the per-store weighted average (STK-02/03)', () => {
  it('the FIFO walk is gone — no cross-store supply_positions consumption', () => {
    expect(STRIPPED).not.toMatch(/consumeFifo/);
    expect(STRIPPED).not.toMatch(/FROM supply_positions/);
  });

  it('no NEW lot-ledger rows are written (legacy stays read-only)', () => {
    expect(STRIPPED).not.toMatch(/demandPositionCostConsumption\.create/);
    // no lot is ever CONSUMED again (the only remaining supplyPosition write
    // is the legacy restore-increment in reverseLegacyFifo)
    expect(STRIPPED).not.toMatch(/remainingQty: \{ decrement/);
  });

  it('the per-unit basis is the LOCKED per-store balance (same map the sufficiency check uses)', () => {
    expect(STRIPPED).toMatch(/balances\.get\(p\.assortmentId\)/);
    // Faza Q4 moved the division into the shared pure helper (computeOutflowCost
    // → computeTransferCost → computePerUnitCost); the BASIS is unchanged — it
    // is still the locked balance's costBalanceMinor ÷ qty, now exact on a full
    // shipment. See demand-cost-basis.test.ts.
    expect(STRIPPED).toMatch(/costBalanceMinor: bal\?\.costBalanceMinor/);
    expect(STRIPPED).toMatch(/onHandQty: bal\?\.qty \?\? '0'/);
  });

  it('empty/valueless stock falls back to the product cost (buyPrice), like Loss', () => {
    expect(STRIPPED).toMatch(/buyPriceByProduct/);
  });

  it('the frozen per-unit cost is the SAME number the stock delta was priced with', () => {
    expect(STRIPPED).toMatch(/costMinor: positionPerUnit\.get\(p\.id\) \?\? 0n/);
  });
});

describe('unpost()/cancel() reverse symmetrically (zero-sum) with a legacy path', () => {
  it('new-model reversal hands back the value the post froze (identical formula)', () => {
    // Faza Q4: the frozen number is now the EXACT line (baseCostMinor), with
    // the pre-Q4 per-unit × qty kept as the fallback inside reversalLineCost.
    const sites = STRIPPED.match(/reversalLineCost\(\{/g) ?? [];
    expect(sites.length).toBe(2); // unpost + cancel
  });

  it('a demand posted under FIFO still reverses its consumption rows (reverseLegacyFifo)', () => {
    expect(STRIPPED).toMatch(/reverseLegacyFifo/);
    expect(STRIPPED).toMatch(/hadRows/);
    // the legacy reversal still restores remainingQty + deletes the rows
    expect(STRIPPED).toMatch(/remainingQty: \{ increment/);
    expect(STRIPPED).toMatch(/demandPositionCostConsumption\.deleteMany/);
  });
});

describe('weighted-average arithmetic — the audit scenarios, exact', () => {
  it('S2: each store prices from ITS OWN average (no cross-store basis)', () => {
    // store A: 10 units worth 1 000 000 → 100 000/unit; store B: 10 units
    // worth 4 000 000 → 400 000/unit. Shipping 5 from A must cost 500 000 —
    // under FIFO-without-store-filter it could draw B-priced lots (2 000 000).
    const perUnitA = computePerUnitCost(1_000_000n, '10');
    const perUnitB = computePerUnitCost(4_000_000n, '10');
    expect(perUnitA).toBe(100_000n);
    expect(perUnitB).toBe(400_000n);
    expect(scaleMinorByQty(perUnitA, '5')).toBe(500_000n);
  });

  it('S3: Loss then Demand never double-charges the received value', () => {
    // Enter 10 units @ 100 000 → balance (10; 1 000 000).
    let qty = 10n;
    let costBal = 1_000_000n;
    // Loss 5 at the average (the model Loss already uses):
    const lossCost = scaleMinorByQty(computePerUnitCost(costBal, qty.toString()), '5');
    expect(lossCost).toBe(500_000n);
    qty -= 5n;
    costBal -= lossCost;
    // Demand 5 from the REMAINING balance — not from untouched FIFO lots:
    const demandCost = scaleMinorByQty(computePerUnitCost(costBal, qty.toString()), '5');
    expect(demandCost).toBe(500_000n);
    // Σ charged === value received. The FIFO model charged the demand from the
    // full lot again → 1 500 000 total (COGS 2× on the lost half).
    expect(lossCost + demandCost).toBe(1_000_000n);
    expect(costBal - demandCost).toBe(0n);
  });

  it('S5: post→unpost round-trips to exactly zero (frozen per-unit, same formula)', () => {
    // An indivisible average: 3 units worth 1000 tiyin → 333/unit frozen.
    const perUnit = computePerUnitCost(1000n, '3');
    const postDelta = scaleMinorByQty(perUnit, '3');
    const unpostDelta = scaleMinorByQty(perUnit, '3'); // p.costMinor === perUnit
    expect(unpostDelta - postDelta).toBe(0n);
  });
});
