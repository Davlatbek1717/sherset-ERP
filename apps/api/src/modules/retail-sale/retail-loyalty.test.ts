import { describe, expect, it } from 'vitest';
import { planLoyaltyAccrual, planLoyaltyReversal } from './retail-loyalty.js';

// Stand-in for loyalty.service.computeEarnedPoints: 1 point per 1.00.
const earn1pct = (_p: { earnRateRulesJson: unknown }, amountMinor: bigint): number =>
  Math.floor(Number(amountMinor) / 100);

const prog = { id: 'prog-1', earnRateRulesJson: [] };

describe('planLoyaltyAccrual - invariant #1 (skip when nothing to accrue)', () => {
  it('no customer (agentId null) -> skip (walk-in earns nothing)', () => {
    expect(
      planLoyaltyAccrual({ agentId: null, program: prog, saleSumMinor: 500_00n }, earn1pct),
    ).toBeNull();
  });

  it('no active program -> skip', () => {
    expect(
      planLoyaltyAccrual({ agentId: 'a1', program: null, saleSumMinor: 500_00n }, earn1pct),
    ).toBeNull();
  });

  it('zero earned points -> skip (no 0-value orphan op)', () => {
    // 0.99 sum -> floor(99/100*... ) = 0 points
    expect(
      planLoyaltyAccrual({ agentId: 'a1', program: prog, saleSumMinor: 99n }, earn1pct),
    ).toBeNull();
  });

  it('negative/NaN points from a broken rule -> skip (defensive)', () => {
    const bad = () => Number.NaN;
    expect(
      planLoyaltyAccrual({ agentId: 'a1', program: prog, saleSumMinor: 100_00n }, bad),
    ).toBeNull();
    const neg = () => -5;
    expect(
      planLoyaltyAccrual({ agentId: 'a1', program: prog, saleSumMinor: 100_00n }, neg),
    ).toBeNull();
  });
});

describe('planLoyaltyAccrual - invariant #2 (points from loyalty pure fn)', () => {
  it('accrues exactly what computeEarned returns', () => {
    const plan = planLoyaltyAccrual(
      { agentId: 'a1', program: prog, saleSumMinor: 1_234_56n },
      earn1pct,
    );
    expect(plan).toEqual({ agentId: 'a1', bonusProgramId: 'prog-1', points: 1234 });
  });

  it('does not re-implement the formula (delegates wholly)', () => {
    const fixed = () => 7;
    expect(
      planLoyaltyAccrual({ agentId: 'a1', program: prog, saleSumMinor: 999_999_99n }, fixed),
    ).toEqual({ agentId: 'a1', bonusProgramId: 'prog-1', points: 7 });
  });
});

describe('planLoyaltyReversal - invariant #3 (reverse EXACT recorded, never recompute)', () => {
  it('a FULL refund reverses the exact recorded earned value', () => {
    expect(planLoyaltyReversal({ bonusValue: 1234 }, 1_000_00n, 1_000_00n)).toEqual({
      points: 1234,
    });
  });

  it('null earned op (nothing earned / already reversed) -> no clawback', () => {
    expect(planLoyaltyReversal(null, 1_000_00n, 1_000_00n)).toBeNull();
  });

  it('non-positive recorded value -> no clawback (defensive)', () => {
    expect(planLoyaltyReversal({ bonusValue: 0 }, 1_000_00n, 1_000_00n)).toBeNull();
    expect(planLoyaltyReversal({ bonusValue: -10 }, 1_000_00n, 1_000_00n)).toBeNull();
  });

  it('clawback is independent of any later program-rule change (§105)', () => {
    // The recorded op said 500; even if rules now yield 999, we claw 500.
    expect(planLoyaltyReversal({ bonusValue: 500 }, 1_000_00n, 1_000_00n)).toEqual({ points: 500 });
  });
});

/**
 * SALES-05 — a customer who returned 1 of 10 items lost the bonus earned on
 * all 10. The clawback is the refund's SHARE of the recorded value: still
 * never recomputed from program rules, just prorated by money returned.
 */
describe('planLoyaltyReversal - invariant #4 (partial refund claws back its SHARE)', () => {
  it('claws back the refunded share, not the whole receipt (SALES-05)', () => {
    // 10 tadan 1 tasi qaytdi → 1000 balldan 100 tasi.
    expect(planLoyaltyReversal({ bonusValue: 1000 }, 100_00n, 1_000_00n)).toEqual({ points: 100 });
  });

  it('floors the share so split refunds can never claw back more than earned', () => {
    let clawed = 0;
    for (let i = 0; i < 3; i++) {
      // 3 marta 1/3 dan: floor(100 × 33333/100000) = 33 → jami 99 ≤ 100.
      clawed += planLoyaltyReversal({ bonusValue: 100 }, 33_333n, 100_000n)?.points ?? 0;
    }
    expect(clawed).toBeLessThanOrEqual(100);
  });

  it('a share too small for a whole point claws back nothing (no 0-value op)', () => {
    expect(planLoyaltyReversal({ bonusValue: 10 }, 1n, 1_000_00n)).toBeNull();
  });

  it('a refund worth more than the receipt cannot claw back more than earned', () => {
    expect(planLoyaltyReversal({ bonusValue: 100 }, 999_999n, 1_000n)).toEqual({ points: 100 });
  });

  it('a zero-value original receipt claws back nothing (no division by zero)', () => {
    expect(planLoyaltyReversal({ bonusValue: 100 }, 0n, 0n)).toBeNull();
  });
});
