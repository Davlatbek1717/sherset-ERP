/**
 * MK37 — sotuv rejasi (xodim × oy × plan turi) API client.
 *
 * Pul va sanoq maydonlari **satr** (BigInt-as-string): JSON `number` 2^53 dan
 * katta tiyin summasini jimgina yumaloqlaydi.
 *
 * `null` qiymatlar MA'NOLI: `targetValue === null` = «reja qo'yilmagan»
 * (0 EMAS), `factValue === null` = «o'lchanmagan», `achievedPercent === null`
 * = «hisoblab bo'lmaydi». Ekran ularni `—` bilan chizadi.
 */

import { api } from './api-client';

export type SalesPlanType = 'revenue' | 'profit' | 'customer_count' | 'collected_debt';
export type PlanStatus = 'no_plan' | 'no_fact' | 'behind' | 'on_track' | 'done';
export type PlanTargetSource = 'sales_plan' | 'salary_config' | 'none';

export interface SalesPlanCell {
  planType: SalesPlanType;
  unit: 'money' | 'count';
  /** `none` = fakt manbai yo'q, qo'lda kuzatiladi. */
  factSource: 'metrics' | 'none';
  planId: string | null;
  targetValue: string | null;
  targetSource: PlanTargetSource;
  currency: string | null;
  /** `false` = reja boshqa valyutada, solishtirilmaydi. */
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
  currency: string;
  totalDays: number;
  elapsedDays: number;
  accountSalesTargetMinor: string | null;
  types: Array<{
    planType: SalesPlanType;
    unit: 'money' | 'count';
    factSource: 'metrics' | 'none';
  }>;
  rows: SalesPlanEmployeeRow[];
}

export interface SaveSalesPlanInput {
  employeeId: string;
  yearMonth: string;
  planType: SalesPlanType;
  /** Ko'rsatkichning o'z birligida, satr sifatida — aniqlik yo'qolmasin. */
  targetValue: string;
  currency?: string | null;
  note?: string | null;
}

export const salesPlanApi = {
  report(yearMonth: string, includeEmpty = false): Promise<SalesPlanReport> {
    const q = new URLSearchParams({ yearMonth });
    if (includeEmpty) q.set('includeEmpty', 'true');
    return api.get(`/sales-plan?${q.toString()}`);
  },

  savePlan(input: SaveSalesPlanInput): Promise<{ id: string }> {
    return api.post('/sales-plan', input);
  },

  /** Rejani olib tashlash — «reja qo'yilmagan» holatiga qaytadi (0 EMAS). */
  deletePlan(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete(`/sales-plan/${id}`);
  },
};
