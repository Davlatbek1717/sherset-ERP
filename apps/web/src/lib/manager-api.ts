/**
 * Menejer bo'limi API client (TZ 4M.2) — **har-xodim KPI konfiguratsiyasi**
 * (`/hr/employees/[id]/kpi` tab'i uchun).
 *
 * Kunlik QABUL QILISH ekrani (`/menejer`) bu client'ni ishlatmaydi: u
 * `/manager/kpi/days*` endpointlariga `api.get/post` bilan to'g'ridan-to'g'ri
 * boradi. Ikki joyda ikki client saqlash o'lik kod bergani uchun (2026-08-04
 * merge'da FE↔BE kontrakt-testi aynan shuni tutdi) bu yerda faqat config bor.
 */

import { api } from './api-client';

export type KpiUnit = 'money' | 'count' | 'percent' | 'minutes';
export type KpiDirection = 'higher_better' | 'lower_better' | 'neutral';
/**
 * `manual` — hisob O'ZI yaratgan ko'rsatkich: tizim uni hisoblamaydi,
 * faktni menejer qo'lda kiritadi (`autoValue` doim NULL).
 */
export type KpiSource = 'cashier' | 'sales' | 'attendance' | 'task' | 'warehouse' | 'manual';

export interface KpiMetricDef {
  key: string;
  labelUz: string;
  labelRu: string;
  unit: KpiUnit;
  direction: KpiDirection;
  source: KpiSource;
  perHour: boolean;
  /** Hisob o'zi yaratganmi (tahrirlash/arxivlash faqat shularga). */
  custom?: boolean;
}

/** Yangi/tahrirlanadigan o'z ko'rsatkichi. `source` yo'q — u doim `manual`. */
export interface SaveCustomMetricInput {
  labelUz: string;
  labelRu?: string;
  unit: KpiUnit;
  direction: KpiDirection;
  perHour?: boolean;
}

/** Bitta konfiguratsiya qatori (og'irlik + ixtiyoriy maqsad, xom string). */
export interface KpiConfigMetric {
  metricKey: string;
  weight: number;
  /** Maqsad-raqam, ko'rsatkich birligida BUTUN son (string — pul tiyinini saqlaydi). null = maqsadsiz. */
  target: string | null;
}

export interface KpiEmployeeConfig {
  profileId: string | null;
  version: number;
  effectiveFrom: string | null;
  metrics: KpiConfigMetric[];
}

export interface SaveKpiConfigInput {
  metrics: Array<{ metricKey: string; weight: number; target?: number | null }>;
  note?: string | null;
}

/** Hisoblangan kunlik natija — bitta ko'rsatkich. */
export interface KpiDailyMetric {
  metricKey: string;
  autoValue: string | null;
  adjustValue: string | null;
  target: string | null;
  weight: number | null;
  complete: boolean;
}

export interface KpiEmployeeDaily {
  date: string;
  state: string;
  dataComplete: boolean;
  workedMinutes: number | null;
  metrics: KpiDailyMetric[];
}

// ─── Egaga haftalik xulosa (M-Q7 · MK04) ───────────────────────────────

/** Bitta menejerning hafta davomidagi faoliyati. */
export interface WeeklyManagerActivity {
  managerId: string | null;
  managerName: string | null;
  acceptedCount: number;
  rejectedCount: number;
  adjustCount: number;
  /** Tuzatmalarning jami ABSOLYUT summasi (tiyin, string). */
  adjustedAbsMinor: string;
  /**
   * Bazasiz tuzatmalar — menejer raqamni TUZATMAGAN, YO'QDAN KIRITGAN.
   * Alohida sanaladi: nazorat nuqtai nazaridan boshqa-boshqa ish.
   */
  noBaselineCount: number;
  forceAcceptedCount: number;
}

export interface OwnerWeeklySummary {
  weekStart: string;
  weekEndExclusive: string;
  totalAccepted: number;
  totalAdjust: number;
  totalAdjustedAbsMinor: string;
  totalForceAccepted: number;
  totalNoBaseline: number;
  pendingDays: number;
  staleDays: number;
  topAdjuster: WeeklyManagerActivity | null;
  activity: WeeklyManagerActivity[];
}

export const managerKpiApi = {
  /** `week` berilmasa — O'TGAN hafta (tugagan hafta ko'rsatiladi). */
  weeklySummary: (week?: string) =>
    api.get<OwnerWeeklySummary>(`/manager/kpi/weekly-summary${week ? `?week=${week}` : ''}`),

  metrics: () => api.get<KpiMetricDef[]>('/manager/kpi/metrics'),
  getConfig: (employeeId: string) =>
    api.get<KpiEmployeeConfig>(`/manager/kpi/employee/${employeeId}/config`),
  saveConfig: (employeeId: string, data: SaveKpiConfigInput) =>
    api.put<{ profileId: string; version: number; effectiveFrom: string }>(
      `/manager/kpi/employee/${employeeId}/config`,
      data,
    ),
  daily: (employeeId: string, date?: string) =>
    api.get<KpiEmployeeDaily | null>(
      `/manager/kpi/employee/${employeeId}/daily${date ? `?date=${date}` : ''}`,
    ),

  // — hisobning O'Z ko'rsatkichlari —
  createMetric: (data: SaveCustomMetricInput) =>
    api.post<KpiMetricDef>('/manager/kpi/metrics', data),
  updateMetric: (key: string, data: SaveCustomMetricInput) =>
    api.post<KpiMetricDef>(`/manager/kpi/metrics/${key}`, data),
  archiveMetric: (key: string) =>
    api.post<{ key: string; archived: boolean }>(`/manager/kpi/metrics/${key}/archive`, {}),
};
