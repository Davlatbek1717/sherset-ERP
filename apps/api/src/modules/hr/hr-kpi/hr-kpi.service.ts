import { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HrSalaryService } from '../hr-salary/hr-salary.service.js';
import { computeAchievementPercent } from '../hr-salary/tier-lookup.util.js';
import { HR_TZ, localDateOnly, startOfLocalDay } from '../hr-shared/tz.util.js';
import type { KpiDailyFilter } from './hr-kpi.schema.js';

/**
 * KPI daily snapshot. For each account + employee, aggregate the day's
 * *personal sales* — the sum of posted Demand.sumMinor where the employee
 * is the owner (ownerId) — and upsert a HrKpiDailyLog row with the day's
 * achievement vs the per-day target slice.
 *
 * Daily target = monthlySalesTarget / daysInThatMonth. Achievement is
 * recorded per-day for the KPI tab trend; the *monthly* tier/payout math
 * happens in the salary engine (P5d) off the SUM of these daily sales.
 *
 * Idempotent: re-running a date upserts on (accountId, employeeId, date) so
 * an admin can safely re-trigger. The cron writes through `snapshotDay`.
 */
@Injectable()
export class HrKpiService {
  private readonly logger = new Logger(HrKpiService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrSalaryService) private readonly salary: HrSalaryService,
  ) {}

  /** List daily logs for the KPI tab (period + optional employee). */
  async listDaily(accountId: string, filter: KpiDailyFilter) {
    const dayStart = startOfLocalDay(filter.dateFrom);
    const endStart = startOfLocalDay(filter.dateTo);
    const dayEnd = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.client.hrKpiDailyLog.findMany({
      where: {
        accountId,
        date: { gte: dayStart, lt: dayEnd },
        ...(filter.employeeId && { employeeId: filter.employeeId }),
      },
      orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
      include: { employee: { select: { id: true, name: true } } },
    });
  }

  /**
   * Snapshot a single account+day. Returns the number of employee rows
   * written. Exposed for manual admin trigger + reused by the cron.
   */
  async snapshotDay(accountId: string, day: Date): Promise<{ written: number }> {
    const dayStart = startOfLocalDay(day);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    // 🔧 2026-08-04 (4M.3 qarzi yopildi): yorliq `localDateOnly` dan olinadi.
    //
    // Oldin bu yerda `Date.UTC(dayStart.getUTC*)` turardi va yorliq BIR KUN
    // ORQADA chiqardi: Tashkent +05 bo'lgani uchun mahalliy yarim tun UTC'da
    // oldingi kunning 19:00 i — uning UTC kalendar maydonlarini o'qish
    // «kecha» ni beradi. So'rov chegarasi (`dayStart`/`dayEnd`) to'g'ri edi,
    // faqat YORLIQ siljigan; ya'ni 4-avgustni qamragan qator 3-avgust deb
    // yozilardi (`tz.util.localDateOnly` izohi shu hodisani ta'riflaydi).
    //
    // Endi tuzatish xavfsiz: oylik dvigateli 4M.3 da bu jadvaldan o'qishni
    // TO'XTATDI (qabul ombori manba bo'ldi), shuning uchun yorliqni to'g'rilash
    // hisoblangan oyliklarga tegmaydi. Mavjud qatorlar migratsiya bilan
    // bir kunga suriladi: `20260804190000_hr_kpi_daily_date_fix`.
    const dateOnly = localDateOnly(day);

    const config = await this.salary.getResolved(accountId);
    const daysInMonth = daysInMonthOf(dayStart);
    const dailyTargetMinor = config.monthlySalesTargetMinor / BigInt(daysInMonth);

    // All non-archived employees in the account are KPI subjects.
    const employees = await this.prisma.client.employee.findMany({
      where: { accountId, archived: false },
      select: { id: true },
    });

    // Personal sales = posted demands owned by the employee on this day.
    const grouped = await this.prisma.client.demand.groupBy({
      by: ['ownerId'],
      where: {
        accountId,
        state: 'posted',
        postedAt: { gte: dayStart, lt: dayEnd },
        ownerId: { not: null },
      },
      _sum: { sumMinor: true },
    });
    const salesByOwner = new Map<string, bigint>();
    for (const g of grouped) {
      if (g.ownerId) salesByOwner.set(g.ownerId, g._sum.sumMinor ?? 0n);
    }

    let written = 0;
    for (const emp of employees) {
      const personalSalesMinor = salesByOwner.get(emp.id) ?? 0n;
      const achievement = computeAchievementPercent(personalSalesMinor, dailyTargetMinor);
      await this.prisma.client.hrKpiDailyLog.upsert({
        where: {
          accountId_employeeId_date: {
            accountId,
            employeeId: emp.id,
            date: dateOnly,
          },
        },
        create: {
          accountId,
          employeeId: emp.id,
          date: dateOnly,
          personalSalesMinor,
          targetMinor: dailyTargetMinor,
          achievementPercent: new Prisma.Decimal(achievement),
        },
        update: {
          personalSalesMinor,
          targetMinor: dailyTargetMinor,
          achievementPercent: new Prisma.Decimal(achievement),
        },
      });
      written++;
    }
    return { written };
  }

  /**
   * Cron entrypoint — snapshots TODAY for every account. Runs at 23:30
   * Asia/Tashkent (registered in HrKpiCron). Per-account failures are
   * isolated so one bad account doesn't abort the whole sweep.
   */
  async snapshotAllAccountsToday(): Promise<{ accounts: number; rows: number }> {
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    const today = new Date();
    let rows = 0;
    let ok = 0;
    for (const acc of accounts) {
      try {
        const r = await this.snapshotDay(acc.id, today);
        rows += r.written;
        ok++;
      } catch (e) {
        this.logger.error(`KPI snapshot failed for account ${acc.id}: ${(e as Error).message}`);
      }
    }
    this.logger.log(
      `KPI daily snapshot: ${ok}/${accounts.length} accounts, ${rows} rows (TZ=${HR_TZ})`,
    );
    return { accounts: ok, rows };
  }
}

/** Calendar days in the month containing `d` (UTC-anchored from local midnight). */
function daysInMonthOf(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
