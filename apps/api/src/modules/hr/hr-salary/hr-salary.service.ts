import { Prisma } from '@moysklad/db';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  DEFAULT_SALARY_CONFIG,
  type KpiTier,
  type UpsertSalaryConfigInput,
} from './hr-salary.schema.js';

/** Public DTO — Decimals as numbers, money as string (BigInt JSON shape). */
export interface SalaryConfigDto {
  fixWeight: number;
  kpiWeight: number;
  bonusWeight: number;
  monthlySalesTargetMinor: string;
  monthlyKpiBudgetMinor: string;
  commissionPercent: number;
  kpiTiers: KpiTier[];
  updatedAt: string | null;
}

@Injectable()
export class HrSalaryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Return the account's salary config, falling back to yangibolim defaults
   * when no row exists yet. The defaults are NOT persisted — the first
   * upsert materializes them. `updatedAt: null` signals "still default".
   */
  async get(accountId: string): Promise<SalaryConfigDto> {
    const row = await this.prisma.client.hrSalaryConfig.findUnique({
      where: { accountId },
    });
    if (!row) {
      return {
        fixWeight: DEFAULT_SALARY_CONFIG.fixWeight,
        kpiWeight: DEFAULT_SALARY_CONFIG.kpiWeight,
        bonusWeight: DEFAULT_SALARY_CONFIG.bonusWeight,
        monthlySalesTargetMinor: DEFAULT_SALARY_CONFIG.monthlySalesTarget.toString(),
        monthlyKpiBudgetMinor: DEFAULT_SALARY_CONFIG.monthlyKpiBudget.toString(),
        commissionPercent: DEFAULT_SALARY_CONFIG.commissionPercent,
        kpiTiers: [...DEFAULT_SALARY_CONFIG.kpiTiers],
        updatedAt: null,
      };
    }
    return toDto(row);
  }

  /**
   * Internal accessor used by the KPI/payroll engines — returns raw BigInt +
   * parsed tiers, never the JSON-string DTO. Falls back to defaults.
   */
  async getResolved(accountId: string): Promise<{
    fixWeight: number;
    kpiWeight: number;
    bonusWeight: number;
    monthlySalesTargetMinor: bigint;
    monthlyKpiBudgetMinor: bigint;
    commissionPercent: number;
    kpiTiers: KpiTier[];
  }> {
    const row = await this.prisma.client.hrSalaryConfig.findUnique({
      where: { accountId },
    });
    if (!row) {
      return {
        fixWeight: DEFAULT_SALARY_CONFIG.fixWeight,
        kpiWeight: DEFAULT_SALARY_CONFIG.kpiWeight,
        bonusWeight: DEFAULT_SALARY_CONFIG.bonusWeight,
        monthlySalesTargetMinor: DEFAULT_SALARY_CONFIG.monthlySalesTarget,
        monthlyKpiBudgetMinor: DEFAULT_SALARY_CONFIG.monthlyKpiBudget,
        commissionPercent: DEFAULT_SALARY_CONFIG.commissionPercent,
        kpiTiers: [...DEFAULT_SALARY_CONFIG.kpiTiers],
      };
    }
    return {
      fixWeight: Number(row.fixWeight),
      kpiWeight: Number(row.kpiWeight),
      bonusWeight: Number(row.bonusWeight),
      monthlySalesTargetMinor: row.monthlySalesTarget,
      monthlyKpiBudgetMinor: row.monthlyKpiBudget,
      commissionPercent: Number(row.commissionPercent),
      kpiTiers: parseTiers(row.kpiTiers),
    };
  }

  /** Admin upsert. Validation (weights sum, tier order) handled by Zod upstream. */
  async upsert(accountId: string, input: UpsertSalaryConfigInput): Promise<SalaryConfigDto> {
    const data = {
      fixWeight: new Prisma.Decimal(input.fixWeight),
      kpiWeight: new Prisma.Decimal(input.kpiWeight),
      bonusWeight: new Prisma.Decimal(input.bonusWeight),
      monthlySalesTarget: BigInt(input.monthlySalesTarget),
      monthlyKpiBudget: BigInt(input.monthlyKpiBudget),
      commissionPercent: new Prisma.Decimal(input.commissionPercent),
      kpiTiers: input.kpiTiers as unknown as Prisma.InputJsonValue,
    };
    const row = await this.prisma.client.hrSalaryConfig.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });
    return toDto(row);
  }
}

function parseTiers(value: unknown): KpiTier[] {
  if (!Array.isArray(value)) return [...DEFAULT_SALARY_CONFIG.kpiTiers];
  return value
    .filter(
      (t): t is { min: number; payout: number } =>
        typeof t === 'object' &&
        t !== null &&
        typeof (t as { min?: unknown }).min === 'number' &&
        typeof (t as { payout?: unknown }).payout === 'number',
    )
    .map((t) => ({ min: t.min, payout: t.payout }));
}

function toDto(row: {
  fixWeight: Prisma.Decimal;
  kpiWeight: Prisma.Decimal;
  bonusWeight: Prisma.Decimal;
  monthlySalesTarget: bigint;
  monthlyKpiBudget: bigint;
  commissionPercent: Prisma.Decimal;
  kpiTiers: unknown;
  updatedAt: Date;
}): SalaryConfigDto {
  return {
    fixWeight: Number(row.fixWeight),
    kpiWeight: Number(row.kpiWeight),
    bonusWeight: Number(row.bonusWeight),
    monthlySalesTargetMinor: row.monthlySalesTarget.toString(),
    monthlyKpiBudgetMinor: row.monthlyKpiBudget.toString(),
    commissionPercent: Number(row.commissionPercent),
    kpiTiers: parseTiers(row.kpiTiers),
    updatedAt: row.updatedAt.toISOString(),
  };
}
