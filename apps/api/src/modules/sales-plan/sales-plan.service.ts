import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { monthBounds } from '../hr/hr-salary/payroll-formula.util.js';
import { TASHKENT_OFFSET_MS } from '../report/report-date-bounds.util.js';
import { loadRateContext } from '../report/report-rate-ctx.util.js';
import {
  type DailyMetricRow,
  aggregateSalesFactByEmployee,
  factMetricKeys,
} from './sales-plan-fact.js';
import { type PlanStatus, computePlanProgress, monthDayCount } from './sales-plan-progress.js';
import { type PlanTargetSource, resolvePlanTarget } from './sales-plan-target.js';
import {
  SALES_PLAN_TYPE_ORDER,
  type SalesPlanType,
  type SalesPlanUnit,
  isMoneyPlanType,
  salesPlanTypeDef,
} from './sales-plan-types.js';
import type { SalesPlanBodyInput, SalesPlanReportQueryInput } from './sales-plan.schema.js';

/** Bir xodim × bir plan turi qatori — reja, fakt va bajarilish. */
export interface SalesPlanCell {
  planType: SalesPlanType;
  unit: SalesPlanUnit;
  /** `none` = fakt manbai yo'q, qo'lda kuzatiladi (yashirilmaydi). */
  factSource: 'metrics' | 'none';
  planId: string | null;
  targetValue: string | null;
  targetSource: PlanTargetSource;
  currency: string | null;
  /** `false` = reja boshqa valyutada; foiz ATAYLAB hisoblanmaydi. */
  comparable: boolean;
  factValue: string | null;
  factComplete: boolean;
  contributingKeys: string[];
  achievedPercent: string | null;
  remainingValue: string | null;
  expectedPercent: string | null;
  projectedPercent: string | null;
  status: PlanStatus;
  note: string | null;
}

export interface SalesPlanEmployeeRow {
  employeeId: string;
  name: string;
  cells: SalesPlanCell[];
}

export interface SalesPlanReport {
  yearMonth: string;
  /** Hisob valyutasi (валюта учёта) — pul rejalarining solishtirish o'qi. */
  currency: string;
  totalDays: number;
  /** Oyning o'tgan kunlari — sur'at shundan. */
  elapsedDays: number;
  /** Eski hisob-bo'yicha sotuv maqsadi (sukut). NULL = kiritilmagan. */
  accountSalesTargetMinor: string | null;
  types: Array<{ planType: SalesPlanType; unit: SalesPlanUnit; factSource: 'metrics' | 'none' }>;
  rows: SalesPlanEmployeeRow[];
}

/**
 * MK37 / 2-bo'lim TZ §4.8 · 4-bo'lim TZ §6 — SOTUV REJASI (xodim × oy × tur).
 *
 * 🔴 Bu servis **hech qanday hujjat yaratmaydi va hech qanday amalni
 * to'xtatmaydi**. Yagona yozuv amali — REJA. Fakt esa faqat O'QILADI
 * (`employee_daily_kpi_metrics`) va hech qachon shu jadvalga nusxalanmaydi.
 *
 * Butun hisob-kitob sof modullarda: `sales-plan-fact` (yig'indi),
 * `sales-plan-target` (ustuvorlik + valyuta), `sales-plan-progress`
 * (bajarilish/sur'at, foizi `report/metrics` dan). Servis faqat ma'lumot
 * olib keladi va ularni ulaydi — «servis ichida ko'milgan qoida» bu repoda
 * ikki xil javob bug-klassining sababi bo'lgan.
 */
@Injectable()
export class SalesPlanService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Hisobot
  // ------------------------------------------------------------------

  async report(accountId: string, q: SalesPlanReportQueryInput): Promise<SalesPlanReport> {
    const { start, endExclusive } = monthBounds(q.yearMonth);
    const totalDays = monthDayCount(q.yearMonth);
    const elapsedDays = elapsedDaysOf(q.yearMonth, totalDays, new Date());
    const metricKeys = factMetricKeys(SALES_PLAN_TYPE_ORDER);

    const [ctx, employees, plans, metricRows, salaryConfig] = await Promise.all([
      loadRateContext(this.prisma.client, accountId),
      this.prisma.client.employee.findMany({
        where: { accountId, archived: false, ...(q.employeeId ? { id: q.employeeId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.salesPlan.findMany({
        where: {
          accountId,
          yearMonth: q.yearMonth,
          ...(q.employeeId ? { employeeId: q.employeeId } : {}),
        },
        select: {
          id: true,
          employeeId: true,
          planType: true,
          targetValue: true,
          currency: true,
          note: true,
        },
      }),
      this.prisma.client.employeeDailyKpiMetric.findMany({
        where: {
          accountId,
          metricKey: { in: metricKeys },
          dailyKpi: {
            date: { gte: start, lt: endExclusive },
            ...(q.employeeId ? { employeeId: q.employeeId } : {}),
          },
        },
        select: {
          metricKey: true,
          autoValue: true,
          adjustValue: true,
          complete: true,
          dailyKpi: { select: { employeeId: true } },
        },
      }),
      this.prisma.client.hrSalaryConfig.findUnique({
        where: { accountId },
        select: { monthlySalesTarget: true },
      }),
    ]);

    const daily: DailyMetricRow[] = metricRows.map((r) => ({
      employeeId: r.dailyKpi.employeeId,
      metricKey: r.metricKey,
      autoValue: r.autoValue,
      adjustValue: r.adjustValue,
      complete: r.complete,
    }));

    const factByEmployee = aggregateSalesFactByEmployee(daily, SALES_PLAN_TYPE_ORDER);

    // (xodim, tur) → reja qatori. Bazadagi UNIQUE shu kalitni kafolatlaydi.
    const planByKey = new Map(plans.map((p) => [`${p.employeeId}:${p.planType}`, p]));

    const accountTarget = salaryConfig?.monthlySalesTarget ?? null;

    const rows: SalesPlanEmployeeRow[] = [];
    for (const employee of employees) {
      const facts = factByEmployee.get(employee.id);
      const hasPlan = SALES_PLAN_TYPE_ORDER.some((t) => planByKey.has(`${employee.id}:${t}`));
      const hasFact = SALES_PLAN_TYPE_ORDER.some((t) => facts?.get(t)?.value != null);

      // Rejasi ham, fakti ham yo'q xodim ekranni to'ldirib, muhimini ko'muvchi
      // shovqin bo'lardi. Kerak bo'lsa `includeEmpty` bilan ko'rsatiladi —
      // reja QO'SHISH uchun ro'yxat baribir kerak.
      if (!hasPlan && !hasFact && !q.includeEmpty) continue;

      const cells: SalesPlanCell[] = SALES_PLAN_TYPE_ORDER.map((planType) => {
        const def = salesPlanTypeDef(planType);
        const plan = planByKey.get(`${employee.id}:${planType}`) ?? null;
        const target = resolvePlanTarget({
          planType,
          plan: plan
            ? { id: plan.id, targetValue: plan.targetValue, currency: plan.currency }
            : null,
          salaryConfigTargetMinor: accountTarget,
          baseCurrency: ctx.baseCode,
        });
        const fact = facts?.get(planType) ?? {
          value: null,
          complete: false,
          contributingKeys: [],
          source: def.factSource,
        };

        // Solishtirib bo'lmaydigan valyutada REJA YO'Q deb hisoblanmaydi —
        // u ko'rinadi, faqat foiz chizilmaydi. Shuning uchun `progress` ga
        // maqsad `null` bo'lib uzatiladi, `targetValue` esa saqlanib qoladi.
        const progress = computePlanProgress({
          targetValue: target.comparable ? target.value : null,
          factValue: fact.value,
          elapsedDays,
          totalDays,
        });

        return {
          planType,
          unit: def.unit,
          factSource: def.factSource,
          planId: target.planId,
          targetValue: target.value?.toString() ?? null,
          targetSource: target.source,
          currency: target.currency,
          comparable: target.comparable,
          factValue: fact.value?.toString() ?? null,
          factComplete: fact.complete,
          contributingKeys: fact.contributingKeys,
          achievedPercent: progress.achievedPercent,
          remainingValue: progress.remainingValue?.toString() ?? null,
          expectedPercent: progress.expectedPercent,
          projectedPercent: progress.projectedPercent,
          status: progress.status,
          note: plan?.note ?? null,
        };
      });

      rows.push({ employeeId: employee.id, name: employee.name, cells });
    }

    return {
      yearMonth: q.yearMonth,
      currency: ctx.baseCode,
      totalDays,
      elapsedDays,
      accountSalesTargetMinor:
        accountTarget != null && accountTarget > 0n ? accountTarget.toString() : null,
      types: SALES_PLAN_TYPE_ORDER.map((planType) => {
        const def = salesPlanTypeDef(planType);
        return { planType, unit: def.unit, factSource: def.factSource };
      }),
      rows,
    };
  }

  // ------------------------------------------------------------------
  // Reja yozish
  // ------------------------------------------------------------------

  /** Xodim × oy × tur = bitta qator (upsert). Fakt hech qachon yozilmaydi. */
  async upsertPlan(accountId: string, actorId: string | null, body: SalesPlanBodyInput) {
    const employee = await this.prisma.client.employee.findFirst({
      where: { id: body.employeeId, accountId },
      select: { id: true },
    });
    if (!employee) throw new BadRequestException('Xodim topilmadi');

    // Valyuta shartnomasi: pul turida MAJBURIY (berilmasa hisob bazasi),
    // sanoq turida NULL. Bazadagi CHECK ham shuni talab qiladi — bu yerda
    // 500 emas, tushunarli 400 qaytadi.
    let currency: string | null = null;
    if (isMoneyPlanType(body.planType)) {
      if (body.currency) currency = body.currency;
      else {
        const ctx = await loadRateContext(this.prisma.client, accountId);
        currency = ctx.baseCode;
      }
    }

    return this.prisma.client.salesPlan.upsert({
      where: {
        accountId_employeeId_yearMonth_planType: {
          accountId,
          employeeId: body.employeeId,
          yearMonth: body.yearMonth,
          planType: body.planType,
        },
      },
      create: {
        accountId,
        employeeId: body.employeeId,
        yearMonth: body.yearMonth,
        planType: body.planType,
        targetValue: body.targetValue,
        currency,
        note: body.note ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {
        targetValue: body.targetValue,
        currency,
        note: body.note ?? null,
        updatedById: actorId,
      },
    });
  }

  /**
   * Rejani olib tashlash. O'chirish = «reja qo'yilmagan» holatiga qaytish
   * (0 ga tenglashtirish EMAS — u boshqa javob).
   */
  async deletePlan(accountId: string, id: string) {
    const existing = await this.prisma.client.salesPlan.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Reja qatori topilmadi');
    await this.prisma.client.salesPlan.delete({ where: { id } });
    return { id, deleted: true };
  }
}

/**
 * Oyning o'tgan kunlari — sur'at uchun.
 *
 * Bugungi kun TOSHKENT yorlig'i bo'yicha aniqlanadi va oy yorlig'i bilan
 * SATR sifatida solishtiriladi (leksikografik = xronologik). O'tgan oyda
 * to'liq oy, kelajakdagi oyda 0 — kelajakdagi rejani «orqada» deb belgilash
 * yolg'on ayblov bo'lardi.
 *
 * Eksport qilingan: sur'at chegarasi testda mustaqil tekshiriladi (`now`
 * argument sifatida uzatiladi, `Date.now()` ichida chaqirilmaydi).
 */
export function elapsedDaysOf(yearMonth: string, totalDays: number, now: Date): number {
  if (totalDays <= 0) return 0;
  const todayLabel = new Date(now.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
  const todayMonth = todayLabel.slice(0, 7);
  if (todayMonth > yearMonth) return totalDays;
  if (todayMonth < yearMonth) return 0;
  return Number(todayLabel.slice(8, 10));
}
