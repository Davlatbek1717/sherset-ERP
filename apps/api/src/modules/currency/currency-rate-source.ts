import { Prisma } from '@moysklad/db';

/**
 * Convert a central-bank (CBU) quote into a Currency.rateValue
 * (rate × 1e8, integer BigInt). Money-critical → Prisma.Decimal
 * (arbitrary precision), NEVER IEEE-754.
 *
 *   effectiveRate = (cbuRate / nominal) × (1 + marginPercent/100)
 *   rateValue     = round(effectiveRate × 1e8)   [half-up]
 *
 * CBU publishes a direct quote (1·nominal foreign = `rate` UZS), so
 * the produced rateValue is always the DIRECT value; AUTO currencies
 * are direct by definition (an AUTO+indirect currency is a user
 * misconfiguration — documented, not silently "fixed" here).
 */
export function cbuRateToRateValue(
  cbuRate: string,
  nominal: number,
  marginPercent: number | string | null,
): bigint {
  const n = Number.isFinite(nominal) && nominal > 0 ? nominal : 1;
  const rate = new Prisma.Decimal(cbuRate);
  const marginFactor = new Prisma.Decimal(1).plus(new Prisma.Decimal(marginPercent ?? 0).div(100));
  const scaled = rate.div(n).mul(marginFactor).mul('100000000');
  // toFixed(0) on Prisma.Decimal rounds half-up away from zero.
  return BigInt(scaled.toFixed(0));
}
