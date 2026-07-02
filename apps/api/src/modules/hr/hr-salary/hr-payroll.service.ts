import { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HrBonusFineService } from '../hr-bonus-fine/hr-bonus-fine.service.js';
import { HrSalaryService } from './hr-salary.service.js';
import {
  computeFinalSalaryMinor,
  extractBaseSalaryMinor,
  monthBounds,
} from './payroll-formula.util.js';
import {
  computeAchievementPercent,
  computeCommissionMinor,
  computeKpiEarnedMinor,
  lookupTierPayoutPercent,
} from './tier-lookup.util.js';

/**
 * Monthly payroll engine. For an employee + "YYYY-MM" it:
 *   1. Sums personal sales from HrKpiDailyLog (snapshotted nightly, P5b).
 *   2. Resolves achievement % vs the monthly target → KPI tier → payout %.
 *   3. kpiEarned = monthlyKpiBudget × payout%.
 *   4. commission = totalSales × commissionPercent%.
 *   5. bonus/fine sums from the ledger over the month window (P5a).
 *   6. fixComponent = employee base salary (Employee.salaryConfig).
 *   7. finalSalary = fix + kpi + bonus − fine + commission.
 * The HrKpiMonthlyScore row is upserted (idempotent recompute).
 *
 * Everything BigInt — see payroll-formula.util + tier-lookup.util.
 */
@Injectable()
export class HrPayrollService {
  private readonly logger = new Logger(HrPayrollService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrSalaryService) private readonly salary: HrSalaryService,
    @Inject(HrBonusFineService) private readonly bonusFine: HrBonusFineService,
  ) {}

  async computeMonthly(accountId: string, employeeId: string, yearMonth: string) {
    const { start, endExclusive } = monthBounds(yearMonth);
    const config = await this.salary.getResolved(accountId);

    const employee = await this.prisma.client.employee.findFirst({
      where: { id: employeeId, accountId },
      select: { id: true, salaryConfig: true },
    });
    if (!employee) {
      throw new Error(`Employee ${employeeId} not found in account`);
    }

    // 1. Total sales for the month = Σ daily personal sales (snapshotted).
    const dailyAgg = await this.prisma.client.hrKpiDailyLog.aggregate({
      where: { accountId, employeeId, date: { gte: start, lt: endExclusive } },
      _sum: { personalSalesMinor: true },
    });
    const totalSalesMinor = dailyAgg._sum.personalSalesMinor ?? 0n;

    // 2-3. achievement → tier → kpi earned
    const achievement = computeAchievementPercent(totalSalesMinor, config.monthlySalesTargetMinor);
    const tierPayoutPercent = lookupTierPayoutPercent(achievement, config.kpiTiers);
    const kpiEarnedMinor = computeKpiEarnedMinor(config.monthlyKpiBudgetMinor, tierPayoutPercent);

    // 4. commission
    const commissionMinor = computeCommissionMinor(totalSalesMinor, config.commissionPercent);

    // 5. bonus / fine ledger sums (createdAt in month window)
    const { bonusMinor, fineMinor } = await this.bonusFine.aggregateRaw(
      accountId,
      employeeId,
      start,
      new Date(endExclusive.getTime() - 1),
    );

    // 6. fix component = per-employee base salary
    const fixComponentMinor = extractBaseSalaryMinor(employee.salaryConfig);

    // 7. final
    const finalSalaryMinor = computeFinalSalaryMinor({
      fixComponentMinor,
      kpiEarnedMinor,
      bonusSumMinor: bonusMinor,
      fineSumMinor: fineMinor,
      commissionMinor,
    });

    const row = await this.prisma.client.hrKpiMonthlyScore.upsert({
      where: {
        accountId_employeeId_yearMonth: { accountId, employeeId, yearMonth },
      },
      create: {
        accountId,
        employeeId,
        yearMonth,
        totalSalesMinor,
        targetMinor: config.monthlySalesTargetMinor,
        achievementPercent: new Prisma.Decimal(achievement),
        tierPayoutPercent: new Prisma.Decimal(tierPayoutPercent),
        kpiEarnedMinor,
        fixComponentMinor,
        bonusSumMinor: bonusMinor,
        fineSumMinor: fineMinor,
        commissionMinor,
        finalSalaryMinor,
      },
      update: {
        totalSalesMinor,
        targetMinor: config.monthlySalesTargetMinor,
        achievementPercent: new Prisma.Decimal(achievement),
        tierPayoutPercent: new Prisma.Decimal(tierPayoutPercent),
        kpiEarnedMinor,
        fixComponentMinor,
        bonusSumMinor: bonusMinor,
        fineSumMinor: fineMinor,
        commissionMinor,
        finalSalaryMinor,
        computedAt: new Date(),
      },
    });
    return row;
  }

  /** Recompute the whole roster for a month. Returns rows written. */
  async computeMonthlyAll(accountId: string, yearMonth: string): Promise<{ written: number }> {
    const employees = await this.prisma.client.employee.findMany({
      where: { accountId, archived: false },
      select: { id: true },
    });
    let written = 0;
    for (const emp of employees) {
      try {
        await this.computeMonthly(accountId, emp.id, yearMonth);
        written++;
      } catch (e) {
        this.logger.error(
          `Payroll compute failed acc=${accountId} emp=${emp.id} ${yearMonth}: ${(e as Error).message}`,
        );
      }
    }
    return { written };
  }

  /** Read the stored monthly scores for the Oylik table (whole roster). */
  async listMonthly(accountId: string, yearMonth: string) {
    return this.prisma.client.hrKpiMonthlyScore.findMany({
      where: { accountId, yearMonth },
      orderBy: { finalSalaryMinor: 'desc' },
      include: { employee: { select: { id: true, name: true } } },
    });
  }
}
