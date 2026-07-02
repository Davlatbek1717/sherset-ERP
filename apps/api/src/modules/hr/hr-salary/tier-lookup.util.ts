import type { KpiTier } from './hr-salary.schema.js';

/**
 * Look up the KPI tier payout for a given achievement percent.
 *
 * Yangibolim parity (master spec § 8): walk tiers DESCENDING by `min`,
 * return the first tier where `achievement >= tier.min`. Tiers are stored
 * sorted ASCENDING in the config (validated by Zod) — we sort a copy
 * here to keep the function pure.
 *
 * Edge cases (master spec):
 *   • achievement = 0          → 0% payout (no tier hit)
 *   • achievement = 49.99      → 0% (below 50% threshold)
 *   • achievement = 50.00      → 20% (first tier)
 *   • achievement = 1000       → top tier payout, no cap
 *
 * Numeric precision: achievement is a Decimal-as-number from Prisma; we
 * compare with `>=` which is precise enough for the integer-percent
 * thresholds (50/75/100/120). For sub-percent precision the caller
 * should round first.
 */
export function lookupTierPayoutPercent(achievementPercent: number, tiers: KpiTier[]): number {
  if (!Number.isFinite(achievementPercent) || tiers.length === 0) return 0;
  const sortedDesc = [...tiers].sort((a, b) => b.min - a.min);
  for (const tier of sortedDesc) {
    if (achievementPercent >= tier.min) return tier.payout;
  }
  return 0;
}

/**
 * Compute the KPI-earned amount in tiyin (minor units).
 *
 *   kpi_earned = monthly_kpi_budget × tier_payout_percent / 100
 *
 * BigInt math throughout — no Number conversion of the budget. Integer
 * truncation (no rounding) matches yangibolim's int division semantics.
 */
export function computeKpiEarnedMinor(
  monthlyKpiBudgetMinor: bigint,
  tierPayoutPercent: number,
): bigint {
  if (tierPayoutPercent <= 0) return 0n;
  // Express the percent as fixed-point with 4-digit precision so 130.25%
  // doesn't get truncated to 130%. Multiplier = round(percent * 10_000).
  const scaled = BigInt(Math.round(tierPayoutPercent * 10_000));
  return (monthlyKpiBudgetMinor * scaled) / 1_000_000n;
}

/**
 * Compute the commission component:
 *   commission = total_sales × commission_percent / 100
 */
export function computeCommissionMinor(totalSalesMinor: bigint, commissionPercent: number): bigint {
  if (commissionPercent <= 0) return 0n;
  const scaled = BigInt(Math.round(commissionPercent * 10_000));
  return (totalSalesMinor * scaled) / 1_000_000n;
}

/**
 * Achievement percent: total_sales / target × 100. Returns 0 for zero
 * target (avoids divide-by-zero). Rounded to 2 decimals to match the
 * Decimal(6,2) column.
 */
export function computeAchievementPercent(totalSalesMinor: bigint, targetMinor: bigint): number {
  if (targetMinor <= 0n) return 0;
  // Scale by 10_000 to keep 2 decimals of precision through BigInt division.
  const scaled = (totalSalesMinor * 10_000n) / targetMinor;
  return Number(scaled) / 100;
}
