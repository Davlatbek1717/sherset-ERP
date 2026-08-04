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
export type KpiSource = 'cashier' | 'sales' | 'attendance' | 'task' | 'warehouse';

export interface KpiMetricDef {
  key: string;
  labelUz: string;
  labelRu: string;
  unit: KpiUnit;
  direction: KpiDirection;
  source: KpiSource;
  perHour: boolean;
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

export const managerKpiApi = {
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
};
