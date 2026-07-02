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
  it('reverses the exact recorded earned value', () => {
    expect(planLoyaltyReversal({ bonusValue: 1234 })).toEqual({ points: 1234 });
  });

  it('null earned op (nothing earned / already reversed) -> no clawback', () => {
    expect(planLoyaltyReversal(null)).toBeNull();
  });

  it('non-positive recorded value -> no clawback (defensive)', () => {
    expect(planLoyaltyReversal({ bonusValue: 0 })).toBeNull();
    expect(planLoyaltyReversal({ bonusValue: -10 })).toBeNull();
  });

  it('clawback is independent of any later program-rule change (§105)', () => {
    // The recorded op said 500; even if rules now yield 999, we claw 500.
    expect(planLoyaltyReversal({ bonusValue: 500 })).toEqual({ points: 500 });
  });
});
