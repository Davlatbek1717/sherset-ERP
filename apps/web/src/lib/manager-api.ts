/**
 * Menejer bo'limi API client (TZ 4M.2). Endpointlar `/api/v1/manager/*`.
 * Hozircha faqat har-xodim KPI konfiguratsiyasi.
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

// ── Kunlik qabul qilish (TZ 4M.2 §3) ───────────────────────────────────────

/** Kun holati — FSM (`daily-kpi.fsm.ts`). */
export type KpiDayState = 'computed' | 'pending' | 'accepted' | 'rejected' | 'stale' | 'escalated';

/** Ko'rsatkich ballga NEGA kirmagani — ekranda ochiq aytiladi. */
export type KpiSkipReason = 'unmeasured' | 'no_target' | 'no_weight' | 'neutral' | 'unknown_metric';

/** Sabab kodi — yopiq ro'yxat (server katalogidan keladi). */
export interface KpiReasonCodeItem {
  code: string;
}

/** Navbat qatori. */
export interface KpiQueueItem {
  id: string;
  date: string;
  state: KpiDayState;
  employee: { id: string; name: string };
  dataComplete: boolean;
  workedMinutes: number | null;
  queuedAt: string | null;
  /** Kompozit ball, foizda. NULL = hech narsa ballanmadi (profil/maqsad yo'q). */
  score: number | null;
  scoreFrozen: number | null;
  coverage: number | null;
  hasProfile: boolean;
  adjustedCount: number;
  staleForDays: number | null;
}

/** Kun detalidagi bitta ko'rsatkich qatori. */
export interface KpiDayMetric {
  metricKey: string;
  labelUz: string;
  labelRu: string;
  unit: KpiUnit;
  direction: KpiDirection;
  source: KpiSource | null;
  /** Xom minor qiymatlar (string — pul tiyinini yo'qotmasin). */
  autoValue: string | null;
  adjustValue: string | null;
  adjusted: boolean;
  reasonCode: string | null;
  target: string | null;
  weight: number;
  achievementPercent: number | null;
  contributionPercent: number | null;
  scored: boolean;
  skipReason: KpiSkipReason | null;
  complete: boolean;
  /** Soatiga (ish yuki konteksti) — faqat `perHour` ko'rsatkichlarда. */
  perHour: string | null;
  /** O'z 30-kunlik o'rtachasidan og'ish, foizda. */
  deviationPercent: number | null;
  average30d: string | null;
}

/** Hodisa jurnali qatori (append-only). */
export interface KpiDayEvent {
  id: string;
  action: string;
  fromState: string;
  toState: string;
  actorType: string;
  actorId: string | null;
  reasonCode: string | null;
  note: string | null;
  payload: unknown;
  createdAt: string;
}

export interface KpiDayDetail {
  id: string;
  date: string;
  state: KpiDayState;
  employee: { id: string; name: string };
  dataComplete: boolean;
  workedMinutes: number | null;
  queuedAt: string | null;
  acceptedAt: string | null;
  acceptedById: string | null;
  staleAt: string | null;
  computedAt: string;
  profileVersion: { id: string; version: number; effectiveFrom: string } | null;
  score: number | null;
  scoreFrozen: number | null;
  coverage: number | null;
  weightScored: number;
  weightTotal: number;
  metrics: KpiDayMetric[];
  events: KpiDayEvent[];
}

export interface KpiQueueResponse {
  items: KpiQueueItem[];
  total: number;
}

export interface KpiQueueFilter {
  from?: string;
  to?: string;
  employeeId?: string;
  states?: string[];
  limit?: number;
}

function queueQuery(f: KpiQueueFilter): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.employeeId) p.set('employeeId', f.employeeId);
  if (f.states?.length) p.set('states', f.states.join(','));
  if (f.limit) p.set('limit', String(f.limit));
  const s = p.toString();
  return s ? `?${s}` : '';
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

  // — qabul qilish —
  reasonCodes: () => api.get<KpiReasonCodeItem[]>('/manager/kpi/reason-codes'),
  queue: (filter: KpiQueueFilter = {}) =>
    api.get<KpiQueueResponse>(`/manager/kpi/queue${queueQuery(filter)}`),
  day: (id: string) => api.get<KpiDayDetail>(`/manager/kpi/day/${id}`),
  accept: (id: string, body: { note?: string | null } = {}) =>
    api.post<{ id: string; state: KpiDayState; changed: boolean }>(
      `/manager/kpi/day/${id}/accept`,
      body,
    ),
  reject: (id: string, body: { reasonCode: string; note?: string | null }) =>
    api.post<{ id: string; state: KpiDayState }>(`/manager/kpi/day/${id}/reject`, body),
  reopen: (id: string, body: { reasonCode: string; note?: string | null }) =>
    api.post<{ id: string; state: KpiDayState }>(`/manager/kpi/day/${id}/reopen`, body),
  escalate: (id: string, body: { note?: string | null } = {}) =>
    api.post<{ id: string; state: KpiDayState }>(`/manager/kpi/day/${id}/escalate`, body),
  forceAccept: (id: string, body: { reasonCode: string; note?: string | null }) =>
    api.post<{ id: string; state: KpiDayState }>(`/manager/kpi/day/${id}/force-accept`, body),
  /** Ko'rsatkich tuzatmasi. `value: null` = tuzatmani olib tashlash. */
  adjust: (
    id: string,
    metricKey: string,
    body: { value: string | null; reasonCode: string; note?: string | null },
  ) =>
    api.put<{ metricKey: string; adjustValue: string | null }>(
      `/manager/kpi/day/${id}/metric/${metricKey}`,
      body,
    ),
};
