import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scaleMinorByQty } from '@moysklad/money';
import { describe, expect, it } from 'vitest';
import { computeOutflowCost, reversalLineCost } from '../shared/demand-cost-basis.js';

/**
 * Faza Q4 (18c qoldig'i) — Demand LAST-UNIT rounding residue (`STK-08` class).
 *
 * post() priced every line as `round(costBalanceMinor ÷ onHand) × qty`. When the
 * shipment empties the store (`qty === onHand`) that product is generally NOT the
 * whole `costBalanceMinor`: 1000 tiyin over 3 units freezes 333/unit and charges
 * 999, leaving 1 tiyin of value sitting on a qty = 0 Stock row. The stray tiyin
 * then poisons the NEXT inbound weighted average (cost ÷ qty) and drifts the
 * stock-value report on every full shipment — exactly what Faza 34 fixed for
 * Move (`computeTransferCost` + `MovePosition.baseCostMinor`).
 *
 * The reversal side is the harder half: unpost/cancel rebuilt the value from the
 * per-unit snapshot (`scaleMinorByQty(costMinor, qty)`), which can no longer
 * express the exact line once post takes the whole balance — 999 back for 1000
 * out would MINT a tiyin on every unpost. Rounding is lossy, so the exact line
 * has to be STORED (`DemandPosition.baseCostMinor`, nullable ⇒ pre-Q4 rows keep
 * falling back to the old formula = zero regression).
 */

describe('computeOutflowCost — the value that actually leaves the store', () => {
  it('a FULL shipment takes the WHOLE cost balance (no stray tiyin left behind)', () => {
    // 3 units worth 1000 tiyin, shipping all 3.
    const { perUnitMinor, lineCostMinor } = computeOutflowCost({
      costBalanceMinor: 1000n,
      onHandQty: '3',
      shipQty: '3',
      fallbackPerUnitMinor: 0n,
    });
    // the per-unit snapshot is still the rounded average («Себестоимость» display)
    expect(perUnitMinor).toBe(333n);
    // the OLD formula under-charged by exactly the rounding residue…
    expect(scaleMinorByQty(perUnitMinor, '3')).toBe(999n);
    // …and left 1 tiyin of value on a qty = 0 row. The line is the whole balance:
    expect(lineCostMinor).toBe(1000n);
    expect(1000n - lineCostMinor).toBe(0n);
  });

  it('a PARTIAL shipment is bit-for-bit the old arithmetic (the residue stays with the remainder)', () => {
    const { perUnitMinor, lineCostMinor } = computeOutflowCost({
      costBalanceMinor: 1000n,
      onHandQty: '3',
      shipQty: '2',
      fallbackPerUnitMinor: 0n,
    });
    expect(perUnitMinor).toBe(333n);
    expect(lineCostMinor).toBe(scaleMinorByQty(333n, '2'));
    expect(lineCostMinor).toBe(666n);
  });

  it('a fractional full shipment is matched on VALUE, not on a float compare', () => {
    // 0.1 + 0.2 on hand, shipping 0.3 — a float compare would miss the match.
    const { lineCostMinor } = computeOutflowCost({
      costBalanceMinor: 100n,
      onHandQty: '0.3',
      shipQty: '0.3',
      fallbackPerUnitMinor: 0n,
    });
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(lineCostMinor).toBe(100n);
  });

  it('empty/valueless stock keeps the buyPrice fallback (Loss precedent, unchanged)', () => {
    const empty = computeOutflowCost({
      costBalanceMinor: 0n,
      onHandQty: '0',
      shipQty: '4',
      fallbackPerUnitMinor: 700n,
    });
    expect(empty.perUnitMinor).toBe(700n);
    expect(empty.lineCostMinor).toBe(2800n);
    // a NEGATIVE balance is not a basis either — fall back, never invent a sign
    const negative = computeOutflowCost({
      costBalanceMinor: -500n,
      onHandQty: '2',
      shipQty: '2',
      fallbackPerUnitMinor: 700n,
    });
    expect(negative.perUnitMinor).toBe(700n);
    expect(negative.lineCostMinor).toBe(1400n);
  });

  it('shipping MORE than on hand (negative stock) prices at the per-unit, not the whole balance', () => {
    const { perUnitMinor, lineCostMinor } = computeOutflowCost({
      costBalanceMinor: 1000n,
      onHandQty: '3',
      shipQty: '5',
      fallbackPerUnitMinor: 0n,
    });
    expect(perUnitMinor).toBe(333n);
    expect(lineCostMinor).toBe(1665n);
  });

  it('the per-unit is exact past 2^53 micro-units (no float parse of qty)', () => {
    const { lineCostMinor } = computeOutflowCost({
      costBalanceMinor: 10_000_000_000n,
      onHandQty: '99999999999999.999999',
      shipQty: '99999999999999.999999',
      fallbackPerUnitMinor: 0n,
    });
    expect(lineCostMinor).toBe(10_000_000_000n);
  });
});

describe('reversalLineCost — unpost/cancel must return EXACTLY what post took', () => {
  it('a Q4-posted line reverses the stored exact value (zero-sum on an indivisible average)', () => {
    const posted = computeOutflowCost({
      costBalanceMinor: 1000n,
      onHandQty: '3',
      shipQty: '3',
      fallbackPerUnitMinor: 0n,
    });
    const back = reversalLineCost({
      baseCostMinor: posted.lineCostMinor,
      costMinor: posted.perUnitMinor,
      quantity: '3',
    });
    expect(back - posted.lineCostMinor).toBe(0n);
    // the per-unit snapshot alone could NOT have expressed it:
    expect(scaleMinorByQty(posted.perUnitMinor, '3')).not.toBe(posted.lineCostMinor);
  });

  it('a pre-Q4 line (baseCostMinor NULL) still reverses with the OLD formula — zero regression', () => {
    expect(reversalLineCost({ baseCostMinor: null, costMinor: 333n, quantity: '3' })).toBe(999n);
    expect(reversalLineCost({ baseCostMinor: null, costMinor: null, quantity: '3' })).toBe(0n);
  });

  it('a stored 0n line is honoured (0 ≠ missing)', () => {
    expect(reversalLineCost({ baseCostMinor: 0n, costMinor: 333n, quantity: '3' })).toBe(0n);
  });
});

describe('demand.service.ts is wired to the exact basis (source scan)', () => {
  const SERVICE = readFileSync(join(__dirname, 'demand.service.ts'), 'utf8');
  const STRIPPED = SERVICE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('post() prices the line through computeOutflowCost, not a bare per-unit × qty', () => {
    expect(STRIPPED).toMatch(/computeOutflowCost\(/);
    expect(STRIPPED).not.toMatch(
      /const lineCost = scaleMinorByQty\(perUnit, String\(p\.quantity\)\)/,
    );
  });

  it('post() freezes the exact line on baseCostMinor next to the per-unit costMinor', () => {
    expect(STRIPPED).toMatch(/baseCostMinor: positionCosts\.get\(p\.id\) \?\? 0n/);
  });

  it('unpost() AND cancel() both reverse through reversalLineCost', () => {
    const sites = STRIPPED.match(/reversalLineCost\(/g) ?? [];
    expect(sites.length).toBe(2);
    // and neither recomputes the value from the per-unit snapshot on its own
    expect(STRIPPED).not.toMatch(/scaleMinorByQty\(p\.costMinor \?\? 0n, String\(p\.quantity\)\)/);
  });

  it('unpost()/cancel() clear baseCostMinor with costMinor (a re-post re-freezes both)', () => {
    const resets = STRIPPED.match(/costMinor: null, baseCostMinor: null/g) ?? [];
    expect(resets.length).toBe(2);
  });

  it('the legacy FIFO reversal path is untouched', () => {
    expect(STRIPPED).toMatch(/reverseLegacyFifo/);
    expect(STRIPPED).toMatch(/remainingQty: \{ increment/);
    expect(STRIPPED).toMatch(/demandPositionCostConsumption\.deleteMany/);
  });
});
