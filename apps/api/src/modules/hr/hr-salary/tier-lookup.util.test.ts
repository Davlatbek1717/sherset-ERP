import { describe, expect, it } from 'vitest';
import { DEFAULT_KPI_TIERS } from './hr-salary.schema.js';
import {
  computeAchievementPercent,
  computeCommissionMinor,
  computeKpiEarnedMinor,
  lookupTierPayoutPercent,
} from './tier-lookup.util.js';

describe('lookupTierPayoutPercent (yangibolim edge cases)', () => {
  it('0% achievement → 0% payout (no tier hit)', () => {
    expect(lookupTierPayoutPercent(0, DEFAULT_KPI_TIERS)).toBe(0);
  });

  it('49.99% → 0% (below 50 threshold)', () => {
    expect(lookupTierPayoutPercent(49.99, DEFAULT_KPI_TIERS)).toBe(0);
  });

  it('50.00% → 20% (first tier exact boundary)', () => {
    expect(lookupTierPayoutPercent(50, DEFAULT_KPI_TIERS)).toBe(20);
  });

  it('74.99% → 20% (still first tier)', () => {
    expect(lookupTierPayoutPercent(74.99, DEFAULT_KPI_TIERS)).toBe(20);
  });

  it('75% → 50% (second tier)', () => {
    expect(lookupTierPayoutPercent(75, DEFAULT_KPI_TIERS)).toBe(50);
  });

  it('100% → 100% (third tier)', () => {
    expect(lookupTierPayoutPercent(100, DEFAULT_KPI_TIERS)).toBe(100);
  });

  it('120% → 130% (top tier)', () => {
    expect(lookupTierPayoutPercent(120, DEFAULT_KPI_TIERS)).toBe(130);
  });

  it('1000% → 130% (top tier, NO cap)', () => {
    expect(lookupTierPayoutPercent(1000, DEFAULT_KPI_TIERS)).toBe(130);
  });

  it('empty tiers → 0', () => {
    expect(lookupTierPayoutPercent(100, [])).toBe(0);
  });

  it('unsorted input still resolves (sorts a copy internally)', () => {
    const shuffled = [
      { min: 100, payout: 100 },
      { min: 50, payout: 20 },
      { min: 75, payout: 50 },
    ];
    expect(lookupTierPayoutPercent(80, shuffled)).toBe(50);
  });

  it('NaN achievement → 0 (defensive)', () => {
    expect(lookupTierPayoutPercent(Number.NaN, DEFAULT_KPI_TIERS)).toBe(0);
  });
});

describe('computeKpiEarnedMinor', () => {
  it("budget 2M so'm × 100% → 2M so'm", () => {
    expect(computeKpiEarnedMinor(2_000_000_00n, 100)).toBe(2_000_000_00n);
  });

  it('budget × 20% → 20% of budget', () => {
    expect(computeKpiEarnedMinor(2_000_000_00n, 20)).toBe(400_000_00n);
  });

  it('budget × 130% → 130% (over-achievement)', () => {
    expect(computeKpiEarnedMinor(2_000_000_00n, 130)).toBe(2_600_000_00n);
  });

  it('fractional payout 130.25% kept (no truncation to 130)', () => {
    // 1_000_000_00 * 130.25% = 130_250_000 tiyin
    expect(computeKpiEarnedMinor(1_000_000_00n, 130.25)).toBe(130_250_000n);
  });

  it('0% → 0n', () => {
    expect(computeKpiEarnedMinor(2_000_000_00n, 0)).toBe(0n);
  });

  it('BigInt-safe for very large budgets (>2^53)', () => {
    const huge = 99_999_999_999_999_99n;
    expect(computeKpiEarnedMinor(huge, 100)).toBe(huge);
  });
});

describe('computeCommissionMinor', () => {
  it('sales 10M × 1.5% → 150k', () => {
    expect(computeCommissionMinor(10_000_000_00n, 1.5)).toBe(150_000_00n);
  });

  it('0% → 0n', () => {
    expect(computeCommissionMinor(10_000_000_00n, 0)).toBe(0n);
  });

  it('fractional percent retained', () => {
    // 1_000_000_00 * 2.25% = 2_250_000 tiyin
    expect(computeCommissionMinor(1_000_000_00n, 2.25)).toBe(2_250_000n);
  });
});

describe('computeAchievementPercent', () => {
  it('sales == target → 100%', () => {
    expect(computeAchievementPercent(20_000_000_00n, 20_000_000_00n)).toBe(100);
  });

  it('half target → 50%', () => {
    expect(computeAchievementPercent(10_000_000_00n, 20_000_000_00n)).toBe(50);
  });

  it('over target → >100%', () => {
    expect(computeAchievementPercent(24_000_000_00n, 20_000_000_00n)).toBe(120);
  });

  it('zero target → 0 (no divide-by-zero)', () => {
    expect(computeAchievementPercent(10_000_000_00n, 0n)).toBe(0);
  });

  it('2-decimal precision retained', () => {
    // 3333/10000 * 100 = 33.33
    expect(computeAchievementPercent(3_333n, 10_000n)).toBe(33.33);
  });
});
