import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { monthInstantBounds } from '../hr/hr-salary/payroll-formula.util.js';
import {
  CurrencyTally,
  type RateContext,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from '../report/report-rate-ctx.util.js';
import {
  BUDGET_STATUS,
  type BudgetStatus,
  DEFAULT_WARN_PERCENT,
  computeVariance,
} from './budget-variance.js';
import type { BudgetPlanBodyInput, BudgetReportQueryInput } from './expense-budget.schema.js';
import {
  EXPENSE_FACT_SOURCE,
  type ExpenseFactDoc,
  UNTAGGED_KEY,
  aggregateExpenseFact,
  drawerExpenseWhereKind,
} from './expense-fact.js';

/** Bir modda × oy qatori — reja, fakt va og'ish. */
export interface BudgetReportRow {
  /** `null` = moddasi ko'rsatilmagan pul (ma'lumot sifati qatori). */
  expenseItemId: string | null;
  name: string | null;
  archived: boolean;
  budgetId: string | null;
  plannedMinor: string | null;
  planCurrency: string | null;
  /**
   * Reja boshqa valyutada va kursi yo'q ⇒ solishtirib bo'lmaydi. Reja 0 deb
   * o'qilmaydi (bu «hammasi oshib ketdi» degan yolg'on beradi) — NULL bo'ladi.
   */
  planUnconvertible: boolean;
  actualMinor: string;
  varianceMinor: string | null;
  usedPercent: string | null;
  status: BudgetStatus;
  note: string | null;
}

export interface BudgetReport {
  yearMonth: string;
  /** Hisobot valyutasi (валюта учёта). */
  currency: string;
  warnPercent: number;
  rows: BudgetReportRow[];
  /**
   * Jamlar FAQAT rejasi bor qatorlar bo'yicha — bu yagona halol
   * «reja ↔ fakt» solishtiruvi. Rejasiz pul pastdagi ikki maydonda
   * alohida ko'rinadi, ya'ni hech qayerda yashirilmaydi.
   */
  totals: {
    plannedMinor: string;
    actualMinor: string;
    varianceMinor: string;
    usedPercent: string | null;
    status: BudgetStatus;
  };
  /** Rejasi bo'lmagan moddalarga sarflangan pul. */
  unplannedActualMinor: string;
  /** Moddasi ko'rsatilmagan (yoki tanilmagan) pul. */
  untaggedMinor: string;
  /** Bazaga keltirib bo'lmagan valyutalar (M-12 shartnomasi). */
  unconvertedByCurrency: UnconvertedAmount[];
  /** Bir nechta moddaga mos kelgan teg matnlari — konfiguratsiya xatosi. */
  ambiguousNames: string[];
}

/**
 * MK12 / 4M TZ §8 — xarajat byudjeti (modda × oy, plan/fakt/og'ish).
 *
 * 🔴 Bu servis **hech qanday hujjat yaratmaydi va hech qanday amalni
 * to'xtatmaydi** (TZ §8: «xarajat tasdiqlanmaydi — lekin ko'rinadi»). U
 * faqat reja yozadi va mavjud hujjatlardan faktni o'qiydi.
 */
@Injectable()
export class ExpenseBudgetService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Hisobot
  // ------------------------------------------------------------------

  async report(accountId: string, q: BudgetReportQueryInput): Promise<BudgetReport> {
    const warnPercent = q.warnPercent ?? DEFAULT_WARN_PERCENT;
    const ctx = await loadRateContext(this.prisma.client, accountId);
    const tally = new CurrencyTally();

    const [items, docs, plans] = await Promise.all([
      this.prisma.client.expenseItem.findMany({
        where: { accountId },
        select: { id: true, name: true, archived: true },
        orderBy: { name: 'asc' },
      }),
      this.loadFactDocs(accountId, q.yearMonth),
      this.prisma.client.expenseBudget.findMany({
        where: { accountId, yearMonth: q.yearMonth },
        select: {
          id: true,
          expenseItemId: true,
          plannedMinor: true,
          currency: true,
          note: true,
        },
      }),
    ]);

    const fact = aggregateExpenseFact(docs, { items, ctx, tally });
    const planByItem = new Map(plans.map((p) => [p.expenseItemId, p]));
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Qator chiqadigan moddalar: rejasi BOR yoki fakti BOR. Qolganlari
    // ekranni to'ldirib, muhimini ko'muvchi shovqin bo'lardi — arxivlanmagan
    // hammasini ko'rish kerak bo'lsa `includeArchived` emas, moddalar
    // ma'lumotnomasi (`/expense-items`) bor.
    const itemIds = new Set<string>([...planByItem.keys()]);
    for (const [k] of fact.byItem) if (k !== UNTAGGED_KEY) itemIds.add(k);

    const rows: BudgetReportRow[] = [];
    let totalPlanned = 0n;
    let totalPlannedActual = 0n;
    let unplannedActual = 0n;

    for (const id of itemIds) {
      const item = itemById.get(id);
      if (item?.archived && !q.includeArchived && !planByItem.has(id)) {
        // Arxivlangan moddaga TASODIFAN tushgan pul ham yo'qolmasin.
        unplannedActual += fact.byItem.get(id) ?? 0n;
        continue;
      }
      const plan = planByItem.get(id);
      const actual = fact.byItem.get(id) ?? 0n;

      const planned = plan ? this.planToBase(plan.plannedMinor, plan.currency, ctx) : null;
      const v = computeVariance(planned, actual, warnPercent);

      if (planned === null) unplannedActual += actual;
      else {
        totalPlanned += planned;
        totalPlannedActual += actual;
      }

      rows.push({
        expenseItemId: id,
        name: item?.name ?? null,
        archived: item?.archived ?? false,
        budgetId: plan?.id ?? null,
        plannedMinor: v.plannedMinor === null ? null : v.plannedMinor.toString(),
        planCurrency: plan?.currency ?? null,
        planUnconvertible: plan !== undefined && planned === null,
        actualMinor: v.actualMinor.toString(),
        varianceMinor: v.varianceMinor === null ? null : v.varianceMinor.toString(),
        usedPercent: v.usedPercent,
        status: v.status,
        note: plan?.note ?? null,
      });
    }

    // Eng muhimi tepada: oshib ketgan → ogohlantirish → qolgani; ichida
    // og'ish kattaligi bo'yicha, keyin nom bo'yicha (determinist tartib).
    const rank: Record<BudgetStatus, number> = {
      [BUDGET_STATUS.over]: 0,
      [BUDGET_STATUS.warning]: 1,
      [BUDGET_STATUS.within]: 2,
      [BUDGET_STATUS.noPlan]: 3,
    };
    rows.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const av = BigInt(a.varianceMinor ?? a.actualMinor);
      const bv = BigInt(b.varianceMinor ?? b.actualMinor);
      if (av !== bv) return bv > av ? 1 : -1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });

    const untagged = fact.byItem.get(UNTAGGED_KEY) ?? 0n;
    if (untagged !== 0n) {
      rows.push({
        expenseItemId: UNTAGGED_KEY,
        name: null,
        archived: false,
        budgetId: null,
        plannedMinor: null,
        planCurrency: null,
        planUnconvertible: false,
        actualMinor: untagged.toString(),
        varianceMinor: null,
        usedPercent: null,
        status: BUDGET_STATUS.noPlan,
        note: null,
      });
    }

    const totals = computeVariance(totalPlanned, totalPlannedActual, warnPercent);
    return {
      yearMonth: q.yearMonth,
      currency: ctx.baseCode,
      warnPercent,
      rows,
      totals: {
        plannedMinor: totalPlanned.toString(),
        actualMinor: totalPlannedActual.toString(),
        varianceMinor: (totals.varianceMinor ?? 0n).toString(),
        usedPercent: totals.usedPercent,
        status: totals.status,
      },
      unplannedActualMinor: unplannedActual.toString(),
      untaggedMinor: untagged.toString(),
      unconvertedByCurrency: tally.unconvertedRows(),
      ambiguousNames: fact.ambiguousNames,
    };
  }

  /**
   * Rejani baza valyutasiga keltirish. Kursi yo'q bo'lsa **NULL** qaytadi —
   * `consolidateToBase` ning 0 qaytarishi bu yerda YARAMAYDI: 0 reja «har
   * qanday sarf = oshib ketish» degan yolg'on statusni berardi.
   */
  private planToBase(plannedMinor: bigint, currency: string, ctx: RateContext): bigint | null {
    const cur = currency || ctx.baseCode;
    if (cur === ctx.baseCode || plannedMinor === 0n) return plannedMinor;
    if (!ctx.rates.has(cur)) return null;
    // Reja — kelajakka qaralgan raqam, shuning uchun JORIY kurs (hujjatning
    // tarixiy kursi kabi «o'z kursi» bu yerda mavjud emas).
    return consolidateToBase(plannedMinor, cur, ctx, new CurrencyTally());
  }

  /**
   * Oyning xarajat hujjatlari — uch manbadan, har biri o'z jadvalidan.
   *
   * `groupBy` ishlatiladi: agregatsiyaga faqat (modda × valyuta × kurs)
   * kesimi kerak, minglab hujjat qatorini xotiraga tortish emas.
   *
   * Sana ustuni = `moment` (P&L bilan bir xil), chegara esa
   * `monthInstantBounds` — Toshkent yarim tuni. `monthBounds` (UTC) bu yerda
   * NOTO'G'RI bo'lardi: oyning birinchi kunidagi 00:00–05:00 xarajatlari
   * o'tgan oyga tushib qolardi ([[month-bounds-label-vs-instant]]).
   */
  private async loadFactDocs(accountId: string, yearMonth: string): Promise<ExpenseFactDoc[]> {
    const { start, endExclusive } = monthInstantBounds(yearMonth);
    const window = {
      accountId,
      state: 'posted',
      deletedAt: null,
      moment: { gte: start, lt: endExclusive },
    } as const;

    const [cashOut, paymentOut, drawer] = await Promise.all([
      this.prisma.client.cashOut.groupBy({
        by: ['expenseItem', 'currency', 'rateValue'],
        where: window,
        _sum: { sumMinor: true },
      }),
      this.prisma.client.paymentOut.groupBy({
        by: ['expenseItem', 'currency', 'rateValue'],
        where: window,
        _sum: { sumMinor: true },
      }),
      this.prisma.client.retailDrawerCashOut.groupBy({
        by: ['expenseItemId', 'currency', 'rateValue'],
        // 🔴 `kind='expense'` — inkassatsiya xarajat EMAS (ikki karra sanoq).
        where: { ...window, ...drawerExpenseWhereKind() },
        _sum: { sumMinor: true },
      }),
    ]);

    return [
      ...cashOut.map((r) => ({
        source: EXPENSE_FACT_SOURCE.cashOut,
        expenseItemId: null,
        expenseItemName: r.expenseItem,
        currency: r.currency,
        rateValue: r.rateValue,
        sumMinor: r._sum.sumMinor ?? 0n,
      })),
      ...paymentOut.map((r) => ({
        source: EXPENSE_FACT_SOURCE.paymentOut,
        expenseItemId: null,
        expenseItemName: r.expenseItem,
        currency: r.currency,
        rateValue: r.rateValue,
        sumMinor: r._sum.sumMinor ?? 0n,
      })),
      ...drawer.map((r) => ({
        source: EXPENSE_FACT_SOURCE.drawerCashOut,
        expenseItemId: r.expenseItemId,
        expenseItemName: null,
        currency: r.currency,
        rateValue: r.rateValue,
        sumMinor: r._sum.sumMinor ?? 0n,
      })),
    ];
  }

  // ------------------------------------------------------------------
  // Reja yozish
  // ------------------------------------------------------------------

  /** Modda × oy = bitta qator (upsert). Fakt hech qachon yozilmaydi. */
  async upsertPlan(accountId: string, actorId: string | null, body: BudgetPlanBodyInput) {
    const item = await this.prisma.client.expenseItem.findFirst({
      where: { id: body.expenseItemId, accountId },
      select: { id: true },
    });
    if (!item) throw new BadRequestException('Xarajat moddasi topilmadi');

    const currency = body.currency ?? 'UZS';
    return this.prisma.client.expenseBudget.upsert({
      where: {
        accountId_expenseItemId_yearMonth: {
          accountId,
          expenseItemId: body.expenseItemId,
          yearMonth: body.yearMonth,
        },
      },
      create: {
        accountId,
        expenseItemId: body.expenseItemId,
        yearMonth: body.yearMonth,
        plannedMinor: body.plannedMinor,
        currency,
        note: body.note ?? null,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {
        plannedMinor: body.plannedMinor,
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
    const existing = await this.prisma.client.expenseBudget.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Byudjet qatori topilmadi');
    await this.prisma.client.expenseBudget.delete({ where: { id } });
    return { id, deleted: true };
  }
}
