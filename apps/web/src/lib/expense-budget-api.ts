/**
 * MK12 / 4M TZ §8 — xarajat byudjeti (modda × oy) API client.
 *
 * Pul maydonlari **satr** (BigInt-as-string): JSON `number` 2^53 dan katta
 * tiyin summasini jimgina yumaloqlaydi. Ekran ularni `formatMoney` ga
 * o'zgartirmasdan uzatadi.
 *
 * `null` qiymatlar MA'NOLI: `plannedMinor === null` = «reja qo'yilmagan»
 * (0 EMAS), `usedPercent === null` = «hisoblab bo'lmaydi» (0% ham, 100% ham
 * emas). Ekran ularni `—` bilan chizadi.
 */

import { api } from './api-client';

export type BudgetStatus = 'no_plan' | 'within' | 'warning' | 'over';

export interface BudgetReportRow {
  /** `null` = moddasi ko'rsatilmagan pul (ma'lumot sifati qatori). */
  expenseItemId: string | null;
  name: string | null;
  archived: boolean;
  budgetId: string | null;
  plannedMinor: string | null;
  planCurrency: string | null;
  /** Reja boshqa valyutada va kursi yo'q — solishtirib bo'lmaydi. */
  planUnconvertible: boolean;
  actualMinor: string;
  varianceMinor: string | null;
  usedPercent: string | null;
  status: BudgetStatus;
  note: string | null;
}

export interface BudgetReport {
  yearMonth: string;
  currency: string;
  warnPercent: number;
  rows: BudgetReportRow[];
  totals: {
    plannedMinor: string;
    actualMinor: string;
    varianceMinor: string;
    usedPercent: string | null;
    status: BudgetStatus;
  };
  unplannedActualMinor: string;
  untaggedMinor: string;
  unconvertedByCurrency: Array<{ currency: string; amountMinor: string }>;
  ambiguousNames: string[];
}

export interface SaveBudgetPlanInput {
  expenseItemId: string;
  yearMonth: string;
  /** Tiyin, satr sifatida — aniqlik yo'qolmasin. */
  plannedMinor: string;
  currency?: string;
  note?: string | null;
}

export const expenseBudgetApi = {
  report(yearMonth: string, warnPercent?: number): Promise<BudgetReport> {
    const q = new URLSearchParams({ yearMonth });
    if (warnPercent !== undefined) q.set('warnPercent', String(warnPercent));
    return api.get(`/expense-budget?${q.toString()}`);
  },

  savePlan(input: SaveBudgetPlanInput): Promise<{ id: string }> {
    return api.post('/expense-budget', input);
  },

  /** Rejani olib tashlash — «reja qo'yilmagan» holatiga qaytadi (0 EMAS). */
  deletePlan(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete(`/expense-budget/${id}`);
  },
};
