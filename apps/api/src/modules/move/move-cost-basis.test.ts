import { describe, expect, it } from 'vitest';
import { computeTransferCost } from './move-cost-basis.js';

/**
 * Faza 34 / STK-08 — Move.post per-unit rounding residue.
 *
 * Before: the source's weighted-average per-unit was rounded to whole tiyin
 * FIRST (`(srcCost × 1e6 + srcQtyMicro/2) / srcQtyMicro`) and the line base
 * was then round(perUnit × qty). Moving the ENTIRE remaining balance therefore
 * removed round(perUnit)×qty tiyin instead of the actual costBalanceMinor —
 * leaving the source store at qty = 0 with a few stray tiyin of value, which
 * poison the next inbound weighted average and drift the stock-value report.
 *
 * Plus the qty itself went through float: `BigInt(Math.round(Number(bal.qty) × 1e6))`.
 */
describe('computeTransferCost (STK-08)', () => {
  it('moving the WHOLE remaining balance takes the whole cost — no residue', () => {
    // 1000 tiyin over 3 units ⇒ 333.33… per unit. Old: round → 333, ×3 = 999,
    // leaving 1 tiyin on an empty store.
    const { perUnitMinor, baseLineMinor } = computeTransferCost({
      sourceCostBalanceMinor: 1000n,
      sourceQty: '3',
      moveQty: '3',
    });
    expect(perUnitMinor).toBe(333n); // still the per-unit «Цена» snapshot
    expect(baseLineMinor).toBe(1000n); // …but the LINE takes everything
    expect(1000n - baseLineMinor).toBe(0n);
  });

  it('leaves the residue where it belongs on a PARTIAL transfer', () => {
    const { baseLineMinor } = computeTransferCost({
      sourceCostBalanceMinor: 1000n,
      sourceQty: '3',
      moveQty: '1',
    });
    expect(baseLineMinor).toBe(333n); // 667 tiyin stay with the 2 remaining units
  });

  it('parses the source qty exactly, not through Number()', () => {
    // Number('9007199254740993') === 9007199254740992 → the float path scales
    // the WRONG micro-qty and the per-unit comes out off.
    expect(Number('9007199254740993')).toBe(9007199254740992);
    const { perUnitMinor, baseLineMinor } = computeTransferCost({
      sourceCostBalanceMinor: 9007199254740993n,
      sourceQty: '9007199254740993',
      moveQty: '9007199254740993',
    });
    expect(perUnitMinor).toBe(1n);
    expect(baseLineMinor).toBe(9007199254740993n);
  });

  it('is a no-op when the source carries no cost basis or no stock', () => {
    expect(
      computeTransferCost({ sourceCostBalanceMinor: 0n, sourceQty: '5', moveQty: '2' }),
    ).toEqual({ perUnitMinor: 0n, baseLineMinor: 0n });
    expect(
      computeTransferCost({ sourceCostBalanceMinor: 500n, sourceQty: '0', moveQty: '2' }),
    ).toEqual({ perUnitMinor: 0n, baseLineMinor: 0n });
  });

  it('handles fractional Decimal(20,6) quantities exactly', () => {
    // 0.3 − 0.1 in float is 0.19999999999999998; here the whole-balance rule
    // must still fire on an exact match.
    const { baseLineMinor } = computeTransferCost({
      sourceCostBalanceMinor: 777n,
      sourceQty: '0.300000',
      moveQty: '0.3',
    });
    expect(baseLineMinor).toBe(777n);
  });
});
