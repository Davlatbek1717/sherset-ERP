/**
 * HR module API client helpers. Mirrors the thin `api` wrapper in api-client.ts.
 * Endpoints under `/api/v1/hr/*`. JWT auto-attached, refresh on 401 handled
 * by the shared request() function.
 */

import { api } from './api-client';
import type { HrAccessLevel, HrPermissionRow } from './auth-store';

// ─── Types ─────────────────────────────────────────────────────────────

/** Compact schedule summary for the employee-list "Jadval" column. */
export interface HrScheduleSummary {
  id: string;
  name: string;
  isFlexible: boolean;
  workingDays: number;
  totalDays: number;
  hoursLabel: string;
}

export interface HrEmployeeRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  username: string | null;
  telegramPhone: string | null;
  department: string | null;
  hrRoles: string[];
  isChecker: boolean;
  moyskladAgentId: string | null;
  archived: boolean;
  /** Optimistic-lock token — round-tripped on edit Save (PUT). */
  version: number;
  // TimePay catalog projections (Lavozim / Bo'lim / Filial / Jadval columns).
  positionRef?: { id: string; name: string } | null;
  departmentRef?: { id: string; name: string } | null;
  primaryBranch?: { id: string; name: string } | null;
  scheduleRef?: HrScheduleSummary | null;
}

export interface HrEmployeeDetail extends HrEmployeeRow {
  salaryConfig: unknown;
  createdAt: string;
  lastLoginAt: string | null;
  attendanceOptIn?: boolean;
  workLocationId?: string | null;
  workLocation?: { id: string; name: string } | null;
  // TimePay catalog assignment ids (for edit-modal pre-select).
  positionId?: string | null;
  departmentId?: string | null;
  scheduleId?: string | null;
}

export interface HrEmployeeFilter {
  search?: string;
  role?: string;
  department?: string;
  position?: string;
  // TimePay catalog filters (by FK id).
  positionId?: string;
  departmentId?: string;
  scheduleId?: string;
  branchId?: string;
  isChecker?: boolean;
  /**
   * moysklad «Состояние» (active/archived) view. Backend coerces with
   * z.coerce.boolean, where the string "false" coerces to TRUE — so the
   * caller must OMIT this (leave undefined) for the active view and only
   * send `true` for the archived view. Mirrors the `isChecker` convention.
   */
  archived?: boolean;
  page?: number;
  limit?: number;
}

export interface HrEmployeeListResult {
  rows: HrEmployeeRow[];
  total: number;
  page: number;
  limit: number;
}

/** Per-id outcome of a bulk «Изменить» action (mirrors shared/bulk.ts). */
export interface HrBulkResult {
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

export interface HrEmployeeCreateInput {
  name: string;
  email?: string;
  phone?: string | null;
  telegramPhone?: string | null;
  department?: string | null;
  hrRoles?: string[];
  isChecker?: boolean;
  moyskladAgentId?: string | null;
  // TimePay catalog assignment (nullable FK ids).
  positionId?: string | null;
  departmentId?: string | null;
  scheduleId?: string | null;
}

export interface HrEmployeeUpdateInput extends Partial<HrEmployeeCreateInput> {
  /** Optimistic-lock token the form loaded; the backend 409s if it's stale. */
  version: number;
}

export interface SetPasswordInput {
  username: string;
  password: string;
}

export interface HrRole {
  id: string;
  value: string;
  label: string;
  isDefault: boolean;
}

export interface MoyskladAgentOption {
  id: string;
  name: string;
  email: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function toQueryString(filter: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== '') {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ─── HrEmployee API ────────────────────────────────────────────────────

export const hrEmployeeApi = {
  list: (filter: HrEmployeeFilter = {}) =>
    api.get<HrEmployeeListResult>(
      `/hr/employees${toQueryString(filter as Record<string, unknown>)}`,
    ),

  findOne: (id: string) => api.get<HrEmployeeDetail>(`/hr/employees/${id}`),

  create: (data: HrEmployeeCreateInput) => api.post<HrEmployeeRow>('/hr/employees', data),

  update: (id: string, data: HrEmployeeUpdateInput) =>
    api.put<HrEmployeeRow>(`/hr/employees/${id}`, data),

  remove: (id: string) => api.delete<{ ok: true }>(`/hr/employees/${id}`),

  // moysklad «Изменить» bulk actions (employee catalog). Each returns a
  // per-id BulkResult so the UI can show a partial-success toast.
  bulkArchive: (ids: string[]) => api.post<HrBulkResult>('/hr/employees/bulk-archive', { ids }),
  bulkRestore: (ids: string[]) => api.post<HrBulkResult>('/hr/employees/bulk-restore', { ids }),
  bulkDelete: (ids: string[]) => api.post<HrBulkResult>('/hr/employees/bulk-delete', { ids }),

  setPassword: (id: string, data: SetPasswordInput) =>
    api.post<{ ok: true }>(`/hr/employees/${id}/set-password`, data),

  moyskladAgents: (excludeId?: string) =>
    api.get<MoyskladAgentOption[]>(
      `/hr/employees/moysklad-agents${excludeId ? `?excludeId=${excludeId}` : ''}`,
    ),
};

// ─── HrRole API ────────────────────────────────────────────────────────

export const hrRoleApi = {
  list: () => api.get<HrRole[]>('/hr/roles'),
  create: (data: { value: string; label: string }) => api.post<HrRole>('/hr/roles', data),
  update: (id: string, data: { label: string }) => api.put<HrRole>(`/hr/roles/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/roles/${id}`),
};

// ─── HrDepartment / HrPosition (name-catalog) API ──────────────────────

/** Bo'lim (department) name-catalog row — pick-list for Employee.department. */
export interface HrDepartment {
  id: string;
  name: string;
  archived: boolean;
  employeeCount?: number;
}

export const hrDepartmentApi = {
  list: () => api.get<HrDepartment[]>('/hr/departments'),
  create: (data: { name: string }) => api.post<HrDepartment>('/hr/departments', data),
  update: (id: string, data: { name: string }) =>
    api.put<HrDepartment>(`/hr/departments/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/departments/${id}`),
};

/** Lavozim (position) name-catalog row — pick-list for Employee.position. */
export interface HrPosition {
  id: string;
  name: string;
  archived: boolean;
  employeeCount?: number;
}

export const hrPositionApi = {
  list: () => api.get<HrPosition[]>('/hr/positions'),
  findOne: (id: string) => api.get<HrPosition>(`/hr/positions/${id}`),
  create: (data: { name: string }) => api.post<HrPosition>('/hr/positions', data),
  update: (id: string, data: { name: string }) => api.put<HrPosition>(`/hr/positions/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/positions/${id}`),
};

// ─── HrSchedule (Ish jadvali) API ──────────────────────────────────────

export type HrScheduleType = 'flexible' | 'free';

export interface HrScheduleDay {
  dayIndex: number;
  isWorkday: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface HrScheduleRow {
  id: string;
  name: string;
  type: HrScheduleType;
  startDate: string; // "yyyy-MM-dd"
  cycleDays: number;
  calcOvertime: boolean;
  extendedWorkMin: number;
  archived: boolean;
  assignedCount: number;
}

export interface HrScheduleDetail extends HrScheduleRow {
  days: HrScheduleDay[];
}

export interface HrScheduleListResult {
  rows: HrScheduleRow[];
  total: number;
  page: number;
  limit: number;
}

export interface HrScheduleInput {
  name: string;
  type: HrScheduleType;
  startDate: string;
  cycleDays: number;
  calcOvertime: boolean;
  extendedWorkMin: number;
  days: HrScheduleDay[];
}

export interface HrScheduleFilter {
  search?: string;
  type?: HrScheduleType;
  archived?: boolean;
  page?: number;
  limit?: number;
}

// Named schedule-TEMPLATE catalog (Jadvallar). Distinct from `hrScheduleApi`
// below, which is the per-employee WEEKLY schedule + attendance-config client.
export const hrScheduleTemplateApi = {
  list: (filter: HrScheduleFilter = {}) =>
    api.get<HrScheduleListResult>(
      `/hr/schedules${toQueryString(filter as Record<string, unknown>)}`,
    ),
  findOne: (id: string) => api.get<HrScheduleDetail>(`/hr/schedules/${id}`),
  create: (data: HrScheduleInput) => api.post<HrScheduleDetail>('/hr/schedules', data),
  update: (id: string, data: HrScheduleInput) =>
    api.put<HrScheduleDetail>(`/hr/schedules/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/schedules/${id}`),
};

// ─── HrEmployeePermission API ──────────────────────────────────────────

export const hrPermissionApi = {
  list: (employeeId: string) =>
    api.get<HrPermissionRow[]>(`/hr/employees/${employeeId}/permissions`),
  replace: (employeeId: string, permissions: HrPermissionRow[]) =>
    api.put<{ count: number }>(`/hr/employees/${employeeId}/permissions`, { permissions }),
};

// ─── HrAttendance API ──────────────────────────────────────────────────

export interface HrAttendanceRow {
  id: string;
  employeeId: string;
  employee: { id: string; name: string; hrRoles?: string[] };
  checkInTime: string;
  checkOutTime: string | null;
  editedById: string | null;
  editedAt: string | null;
  notes: string | null;
  createdAt: string;
  // GPS-davomat columns (present on all rows via defaults)
  lateMinutes?: number;
  source?: string; // 'auto_gps' | 'manual'
  autoClosed?: boolean;
}

export interface HrAttendanceReportFilter {
  dateFrom: string;
  dateTo: string;
  employeeId?: string;
}

export interface HrAttendanceEditInput {
  checkInTime?: string;
  checkOutTime?: string | null;
  clearCheckOut?: boolean;
  notes?: string | null;
}

export const hrAttendanceApi = {
  listToday: (date?: string) =>
    api.get<HrAttendanceRow[]>(`/hr/attendance/today${date ? `?date=${date}` : ''}`),
  report: (filter: HrAttendanceReportFilter) =>
    api.get<HrAttendanceRow[]>(
      `/hr/attendance/report${toQueryString(filter as unknown as Record<string, unknown>)}`,
    ),
  checkIn: (data: {
    employeeId: string;
    at?: string;
    workLocationId?: string | null;
    notes?: string | null;
  }) => api.post<HrAttendanceRow>('/hr/attendance/check-in', data),
  checkOut: (id: string) => api.post<HrAttendanceRow>(`/hr/attendance/${id}/check-out`, {}),
  /** Manual check-out by employee (dashboard modal — no row id). */
  checkOutManual: (data: { employeeId: string; at?: string; notes?: string | null }) =>
    api.post<{ ok: true }>('/hr/attendance/check-out', data),
  edit: (id: string, data: HrAttendanceEditInput) =>
    api.patch<HrAttendanceRow>(`/hr/attendance/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/attendance/${id}`),
};

// ─── HrTaskTemplate API ────────────────────────────────────────────────

export type HrTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type HrTaskTriggerType = 'manual' | 'scheduled' | 'event';
export type HrTaskResponseType = 'none' | 'yes_no' | 'text';

export interface ScheduleConfig {
  time: string; // "HH:MM"
  mode: 'weekly' | 'monthly';
  days?: number[]; // ISO 1=Mon..7=Sun (weekly)
  dayOfMonth?: number; // 1..31 (monthly)
}

export interface EventConfig {
  docType: 'demand' | 'customer_order' | 'payment_in' | 'supply' | 'sales_return';
  state: 'created' | 'posted' | 'updated' | 'large_sale';
  largeSaleMinThresholdMinor?: string | number;
}

export interface HrTaskTemplateRow {
  id: string;
  title: string;
  description: string | null;
  assignedEmployeeId: string | null;
  assignedRole: string | null;
  assignedEmployee?: { id: string; name: string } | null;
  department: string | null;
  priority: HrTaskPriority;
  triggerType: HrTaskTriggerType;
  scheduleConfig: ScheduleConfig | null;
  eventConfig: EventConfig | null;
  responseType: HrTaskResponseType;
  deadlineMinutes: number | null;
  rewardMinor: string | null;
  fineMinor: string | null;
  checkerId: string | null;
  checker?: { id: string; name: string } | null;
  dependsOnId: string | null;
  dependsOn?: { id: string; title: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { logs: number };
}

export interface HrTaskTemplateFilter {
  search?: string;
  triggerType?: HrTaskTriggerType;
  priority?: HrTaskPriority;
  department?: string;
  isActive?: boolean;
  checkerId?: string;
  page?: number;
  limit?: number;
}

export interface HrTaskTemplateListResult {
  rows: HrTaskTemplateRow[];
  total: number;
  page: number;
  limit: number;
}

export interface HrTaskTemplateInput {
  title: string;
  description?: string | null;
  assignedEmployeeId?: string | null;
  assignedRole?: string | null;
  department?: string | null;
  priority: HrTaskPriority;
  triggerType: HrTaskTriggerType;
  scheduleConfig?: ScheduleConfig | null;
  eventConfig?: EventConfig | null;
  responseType: HrTaskResponseType;
  deadlineMinutes?: number | null;
  rewardMinor?: string | number | null;
  fineMinor?: string | number | null;
  checkerId?: string | null;
  dependsOnId?: string | null;
  isActive: boolean;
}

export const hrTaskTemplateApi = {
  list: (filter: HrTaskTemplateFilter = {}) =>
    api.get<HrTaskTemplateListResult>(
      `/hr/task-templates${toQueryString(filter as Record<string, unknown>)}`,
    ),
  findOne: (id: string) => api.get<HrTaskTemplateRow>(`/hr/task-templates/${id}`),
  create: (data: HrTaskTemplateInput) => api.post<HrTaskTemplateRow>('/hr/task-templates', data),
  update: (id: string, data: HrTaskTemplateInput) =>
    api.put<HrTaskTemplateRow>(`/hr/task-templates/${id}`, data),
  setActive: (id: string, isActive: boolean) =>
    api.patch<HrTaskTemplateRow>(`/hr/task-templates/${id}/active`, { isActive }),
  remove: (id: string) =>
    api.delete<{ ok: true; mode: 'soft' | 'hard' }>(`/hr/task-templates/${id}`),
};

// ─── HrTaskSend (send pipeline + answer + logs) ────────────────────────

export type HrTaskLogStatus =
  | 'sent'
  | 'pending_review'
  | 'answered_yes'
  | 'answered_no'
  | 'answered_text'
  | 'approved'
  | 'rejected'
  | 'failed';

export interface HrTaskLogRow {
  id: string;
  templateId: string;
  taskId: string;
  employeeId: string;
  status: HrTaskLogStatus;
  responseText: string | null;
  sentAt: string;
  answeredAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewComment: string | null;
  failReason: string | null;
  template?: {
    id: string;
    title: string;
    responseType: HrTaskResponseType;
    rewardMinor?: string | null;
    fineMinor?: string | null;
    checkerId?: string | null;
  };
  employee?: { id: string; name: string };
  reviewedBy?: { id: string; name: string } | null;
}

export interface HrTaskLogFilter {
  templateId?: string;
  employeeId?: string;
  status?: HrTaskLogStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface HrTaskLogListResult {
  rows: HrTaskLogRow[];
  total: number;
  page: number;
  limit: number;
}

export interface HrTaskAnswerInput {
  type: 'yes' | 'no' | 'text';
  text?: string | null;
}

export const hrTaskSendApi = {
  dispatch: (templateId: string, employeeId?: string) =>
    api.post<{
      task: { id: string };
      log: HrTaskLogRow;
      telegramQueued: boolean;
    }>('/hr/tasks/send', { templateId, ...(employeeId ? { employeeId } : {}) }),
  listLogs: (filter: HrTaskLogFilter = {}) =>
    api.get<HrTaskLogListResult>(
      `/hr/tasks/logs${toQueryString(filter as Record<string, unknown>)}`,
    ),
  answer: (logId: string, data: HrTaskAnswerInput) =>
    api.post<HrTaskLogRow>(`/hr/tasks/logs/${logId}/answer`, data),
};

// ─── HrTaskReview API ──────────────────────────────────────────────────

export interface HrTaskReviewFilter {
  templateId?: string;
  employeeId?: string;
  page?: number;
  limit?: number;
}

export const hrTaskReviewApi = {
  listPending: (filter: HrTaskReviewFilter = {}) =>
    api.get<HrTaskLogListResult>(`/hr/review${toQueryString(filter as Record<string, unknown>)}`),
  approve: (logId: string, comment?: string | null) =>
    api.post<HrTaskLogRow>(`/hr/review/${logId}/approve`, {
      comment: comment ?? null,
    }),
  reject: (logId: string, comment: string) =>
    api.post<HrTaskLogRow>(`/hr/review/${logId}/reject`, { comment }),
};

// ─── HrMessages (outbox read model) ────────────────────────────────────

export type HrMessageStatus = 'pending' | 'retry' | 'sent' | 'failed';

export interface HrMessageRow {
  id: string;
  counterpartyId: string | null;
  counterparty?: { id: string; name: string; phone: string | null } | null;
  employeeId: string | null;
  employee?: { id: string; name: string } | null;
  toPhone: string;
  messageText: string;
  status: HrMessageStatus;
  retryCount: number;
  nextRetryAt: string | null;
  sentAt: string | null;
  failReason: string | null;
  sourceEventType: string | null;
  sourceDocId: string | null;
  telegramMessageId: string | null;
  sentBySlot: number | null;
  createdAt: string;
}

export interface HrMessagesFilter {
  status?: HrMessageStatus;
  counterpartyId?: string;
  employeeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface HrMessagesListResult {
  rows: HrMessageRow[];
  total: number;
  page: number;
  limit: number;
}

export interface HrMessageStatusCounts {
  pending: number;
  retry: number;
  sent: number;
  failed: number;
}

export const hrMessagesApi = {
  list: (filter: HrMessagesFilter = {}) =>
    api.get<HrMessagesListResult>(
      `/hr/messages${toQueryString(filter as Record<string, unknown>)}`,
    ),
  statusCounts: () => api.get<HrMessageStatusCounts>('/hr/messages/status-counts'),
  chatHistory: (counterpartyId: string, limit = 40) =>
    api.get<HrMessageRow[]>(
      `/hr/messages/chat-history?counterpartyId=${encodeURIComponent(counterpartyId)}&limit=${limit}`,
    ),
  requeue: (id: string) =>
    api.post<{ ok: true; requeued: boolean }>(`/hr/messages/${id}/requeue`, {}),
};

// ─── HR Oylik / KPI / Salary ───────────────────────────────────────────

export interface KpiTier {
  min: number;
  payout: number;
}

export interface SalaryConfig {
  fixWeight: number;
  kpiWeight: number;
  bonusWeight: number;
  monthlySalesTargetMinor: string;
  monthlyKpiBudgetMinor: string;
  commissionPercent: number;
  kpiTiers: KpiTier[];
  updatedAt: string | null;
}

export interface SalaryConfigInput {
  fixWeight: number;
  kpiWeight: number;
  bonusWeight: number;
  monthlySalesTarget: string | number;
  monthlyKpiBudget: string | number;
  commissionPercent: number;
  kpiTiers: KpiTier[];
}

export interface MonthlyScoreRow {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string };
  yearMonth: string;
  totalSalesMinor: string;
  targetMinor: string;
  achievementPercent: string;
  tierPayoutPercent: string;
  kpiEarnedMinor: string;
  fixComponentMinor: string;
  bonusSumMinor: string;
  fineSumMinor: string;
  commissionMinor: string;
  finalSalaryMinor: string;
  computedAt: string;
}

export const hrSalaryApi = {
  getConfig: () => api.get<SalaryConfig>('/hr/salary-config'),
  upsertConfig: (data: SalaryConfigInput) => api.put<SalaryConfig>('/hr/salary-config', data),
  listMonthly: (yearMonth: string) => api.get<MonthlyScoreRow[]>(`/hr/payroll/${yearMonth}`),
  computeOne: (employeeId: string, yearMonth: string) =>
    api.post<MonthlyScoreRow>('/hr/payroll/compute', { employeeId, yearMonth }),
  computeAll: (yearMonth: string) =>
    api.post<{ written: number }>(
      `/hr/payroll/compute-all?yearMonth=${encodeURIComponent(yearMonth)}`,
      {},
    ),
};

export interface KpiDailyRow {
  id: string;
  employeeId: string;
  employee?: { id: string; name: string };
  date: string;
  personalSalesMinor: string;
  targetMinor: string;
  achievementPercent: string;
}

export const hrKpiApi = {
  listDaily: (dateFrom: string, dateTo: string, employeeId?: string) =>
    api.get<KpiDailyRow[]>(
      `/hr/kpi/daily${toQueryString({ dateFrom, dateTo, employeeId } as Record<string, unknown>)}`,
    ),
  snapshot: (date?: string) =>
    api.post<{ written: number }>('/hr/kpi/snapshot', date ? { date } : {}),
};

export type HrBonusFineKind = 'bonus' | 'fine';
export type HrBonusFineSource =
  | 'manual'
  | 'rule'
  | 'auto_task_reward'
  | 'auto_task_fine'
  | 'auto_expire_fine';

export interface BonusFineRow {
  id: string;
  employeeId: string;
  /** Employee name snapshotted at creation (§13.17); prefer over the live relation. */
  employeeName?: string | null;
  employee?: { id: string; name: string };
  kind: HrBonusFineKind;
  source: HrBonusFineSource;
  amountMinor: string;
  reason: string | null;
  createdById: string | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface BonusFineFilter {
  employeeId?: string;
  kind?: HrBonusFineKind;
  source?: HrBonusFineSource;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface BonusFineListResult {
  rows: BonusFineRow[];
  total: number;
  page: number;
  limit: number;
}

export const hrBonusFineApi = {
  list: (filter: BonusFineFilter = {}) =>
    api.get<BonusFineListResult>(
      `/hr/bonus-fine${toQueryString(filter as Record<string, unknown>)}`,
    ),
  createManual: (data: {
    employeeId: string;
    kind: HrBonusFineKind;
    amountMinor: string | number;
    reason?: string | null;
  }) => api.post<BonusFineRow>('/hr/bonus-fine', data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/bonus-fine/${id}`),
};

// ─── HR Dashboard + Reports ─────────────────────────────────────────────

export interface HrDashboardSummary {
  totalCounterparties: number;
  telegramConnectedSlots: number;
  messagesSentToday: number;
  messagesFailed: number;
  pendingTasks: number;
  pendingReviews: number;
  sentSeries: Array<{ date: string; sent: number }>;
  recentMessages: Array<{
    id: string;
    counterpartyName: string | null;
    toPhone: string;
    status: string;
    createdAt: string;
  }>;
}

export const hrDashboardApi = {
  summary: () => api.get<HrDashboardSummary>('/hr/dashboard/summary'),
};

export type HrReportMetric = 'sales' | 'messages';

export interface HrReport {
  metric: HrReportMetric;
  series: Array<{ date: string; value: string }>;
  topCounterparties: Array<{ counterpartyId: string; name: string; value: string }>;
  total: string;
}

export const hrReportsApi = {
  report: (dateFrom: string, dateTo: string, metric: HrReportMetric) =>
    api.get<HrReport>(
      `/hr/reports${toQueryString({ dateFrom, dateTo, metric } as Record<string, unknown>)}`,
    ),
};

// ─── HrTelegramAccount (P4 — MTProto account mgmt + OTP login wizard) ───

export interface HrTelegramAccountRow {
  id: string;
  slot: number;
  phoneNumber: string;
  apiId: number;
  /** Encrypted MTProto session present ⇒ account can be activated/sent from. */
  hasSession: boolean;
  isActive: boolean;
  lastConnectedAt: string | null;
  floodWaitUntil: string | null;
  createdAt: string;
}

export interface CreateHrTelegramAccountInput {
  slot: 1 | 2;
  phoneNumber: string;
  apiId: number;
  apiHash: string;
}

/** OTP wizard step 1 — server asks Telegram to send a login code. */
export interface TelegramLoginStartResult {
  loginSessionId: string;
  codeSent: boolean;
}

/** OTP wizard step 2 — submit code (+ optional 2FA password). */
export interface TelegramLoginCodeResult {
  ok: boolean;
  /** True ⇒ a 2FA password is required; resubmit with `password`. */
  awaitingPassword: boolean;
}

export const hrTelegramAccountApi = {
  list: () => api.get<HrTelegramAccountRow[]>('/hr/telegram-accounts'),
  create: (data: CreateHrTelegramAccountInput) =>
    api.post<HrTelegramAccountRow>('/hr/telegram-accounts', data),
  setActive: (id: string, isActive: boolean) =>
    api.patch<HrTelegramAccountRow>(`/hr/telegram-accounts/${id}/active`, { isActive }),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/telegram-accounts/${id}`),
  loginStart: (id: string) =>
    api.post<TelegramLoginStartResult>(`/hr/telegram-accounts/${id}/login/start`, {}),
  loginCode: (loginSessionId: string, code: string, password?: string) =>
    api.post<TelegramLoginCodeResult>('/hr/telegram-accounts/login/code', {
      loginSessionId,
      code,
      ...(password ? { password } : {}),
    }),
  loginCancel: (loginSessionId: string) =>
    api.post<{ ok: true }>('/hr/telegram-accounts/login/cancel', { loginSessionId }),
};

// ─── Davomat (GPS attendance) API ──────────────────────────────────────

export type DavomatStatus = 'not_arrived' | 'at_work' | 'left';
export type AttendanceDayStatus = 'present' | 'late' | 'absent' | 'dayoff';

export interface DavomatPingInput {
  lat: number;
  lng: number;
  accuracy: number;
}
export interface DavomatPingResult {
  accepted: boolean;
  reason: 'accuracy' | 'jump' | 'not_opted_in' | 'no_location' | null;
  inside: boolean;
  status: DavomatStatus;
  decision: 'KELDI' | 'KETDI' | 'NONE';
  attendance: { checkInTime: string; checkOutTime: string | null; lateMinutes: number } | null;
}
export interface DavomatWorkLocationLite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}
export interface DavomatDaySchedule {
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}
export interface DavomatMyToday {
  optIn: boolean;
  workLocation: DavomatWorkLocationLite | null;
  schedule: DavomatDaySchedule | null;
  today: {
    checkInTime: string;
    checkOutTime: string | null;
    lateMinutes: number;
    source: string;
    autoClosed: boolean;
  } | null;
  status: DavomatStatus;
}

export interface DavomatManualResult {
  ok: boolean;
  reason:
    | 'accuracy'
    | 'outside'
    | 'not_opted_in'
    | 'no_location'
    | 'already_open'
    | 'no_open_record'
    | null;
  status: DavomatStatus;
  attendance: { checkInTime: string; checkOutTime: string | null; lateMinutes: number } | null;
}

export const hrDavomatApi = {
  ping: (data: DavomatPingInput) => api.post<DavomatPingResult>('/hr/attendance/ping', data),
  myToday: () => api.get<DavomatMyToday>('/hr/attendance/my/today'),
  optIn: (optIn: boolean) => api.post<{ optIn: boolean }>('/hr/attendance/my/opt-in', { optIn }),
  checkIn: (data: DavomatPingInput) =>
    api.post<DavomatManualResult>('/hr/attendance/my/check-in', data),
  checkOut: (data: DavomatPingInput) =>
    api.post<DavomatManualResult>('/hr/attendance/my/check-out', data),
};

// ─── Work-location (filial) admin API ──────────────────────────────────

export interface HrWorkLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  archived: boolean;
  employeeCount: number;
}
export interface HrWorkLocationInput {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

export const hrWorkLocationApi = {
  list: () => api.get<HrWorkLocation[]>('/hr/work-locations'),
  create: (data: HrWorkLocationInput) => api.post<HrWorkLocation>('/hr/work-locations', data),
  update: (id: string, data: Partial<HrWorkLocationInput>) =>
    api.put<HrWorkLocation>(`/hr/work-locations/${id}`, data),
  remove: (id: string) => api.delete<{ ok: true }>(`/hr/work-locations/${id}`),
};

// ─── Employee schedule + attendance-config API ─────────────────────────

export interface HrWeekDay {
  weekday: number; // 0=Sun..6=Sat
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}
export interface HrAttendanceConfigInput {
  workLocationId: string | null;
  attendanceOptIn: boolean;
}

export const hrScheduleApi = {
  getWeek: (employeeId: string) => api.get<HrWeekDay[]>(`/hr/employees/${employeeId}/schedule`),
  replaceWeek: (employeeId: string, days: HrWeekDay[]) =>
    api.put<{ count: number }>(`/hr/employees/${employeeId}/schedule`, { days }),
  setConfig: (employeeId: string, cfg: HrAttendanceConfigInput) =>
    api.patch<HrAttendanceConfigInput>(`/hr/employees/${employeeId}/attendance-config`, cfg),
};

// ─── Davomat report API (HR-facing) ────────────────────────────────────

export interface DavomatMonthlyRow {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  status: AttendanceDayStatus;
}
export interface DavomatMonthlyEmployee {
  employeeId: string;
  name: string;
  rows: DavomatMonthlyRow[];
  presentDays: number;
  lateDays: number;
  absentDays: number;
  dayOffDays: number;
  lateMinutesTotal: number;
}
export interface DavomatMonthlyReport {
  yearMonth: string;
  employees: DavomatMonthlyEmployee[];
}
export interface DavomatLivePresent {
  id: string;
  employeeId: string;
  name: string;
  checkInTime: string;
  checkOutTime: string | null;
  lateMinutes: number;
  source: string;
  autoClosed: boolean;
  status: 'at_work' | 'left';
}
export interface DavomatLiveBoard {
  present: DavomatLivePresent[];
  absent: Array<{ employeeId: string; name: string }>;
}

/** TimePay "Xodimlar boshqaruv paneli" board (per date). */
export interface HrAttendanceDashboardRow {
  employeeId: string;
  employee: { id: string; name: string; department: string | null };
  checkIn: string | null;
  checkOut: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  totalMinutes: number;
  branches: string[];
  isWorkday: boolean;
  hasRecord: boolean;
  isAtWork: boolean;
}
export interface HrAttendanceDashboard {
  date: string;
  counts: { all: number; atWork: number; late: number; absent: number };
  rows: HrAttendanceDashboardRow[];
}

// ─── Xodimlarni kuzatish (monitoring) ─────────────────────────────────

export type MonitoringStatus = 'all' | 'late' | 'ontime' | 'at_work' | 'absent';
export type MonitoringPresence = 'at_work' | 'left' | 'absent' | 'dayoff';

export interface MonitoringDailyRow {
  employeeId: string;
  name: string;
  position: string | null;
  department: string | null;
  workLocation: { id: string; name: string } | null;
  schedule: { startTime: string; endTime: string; isDayOff: boolean } | null;
  attendanceState: 'ontime' | 'late' | null;
  presence: MonitoringPresence;
  checkInTime: string | null;
  checkOutTime: string | null;
  lateMinutes: number;
  attendanceId: string | null;
}
export interface MonitoringDailyResult {
  date: string;
  rows: MonitoringDailyRow[];
}

export interface MonitoringMark {
  id: string;
  at: string;
  type: 'entry' | 'exit';
  state: 'ontime' | 'late' | null;
  lateMinutes: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  autoClosed: boolean;
  photoUrl: null;
}
export interface MonitoringMarksResult {
  employee: { id: string; name: string; position: string | null };
  marks: MonitoringMark[];
}

export const hrMonitoringApi = {
  daily: (filter: { date?: string; status?: MonitoringStatus } = {}) =>
    api.get<MonitoringDailyResult>(
      `/hr/monitoring${toQueryString(filter as Record<string, unknown>)}`,
    ),
  marks: (employeeId: string, filter: { from: string; to: string }) =>
    api.get<MonitoringMarksResult>(
      `/hr/monitoring/${employeeId}/marks${toQueryString(filter as Record<string, unknown>)}`,
    ),
};

export const hrDavomatReportApi = {
  monthly: (filter: { yearMonth: string; employeeId?: string }) =>
    api.get<DavomatMonthlyReport>(
      `/hr/attendance/report/monthly${toQueryString(filter as Record<string, unknown>)}`,
    ),
  live: () => api.get<DavomatLiveBoard>('/hr/attendance/live'),
  dashboard: (date?: string) =>
    api.get<HrAttendanceDashboard>(`/hr/attendance/dashboard${date ? `?date=${date}` : ''}`),
  monthlyXlsxUrl: (filter: { yearMonth: string; employeeId?: string }) =>
    `/hr/attendance/report/monthly.xlsx${toQueryString(filter as Record<string, unknown>)}`,
};

// ─── Davomat → Telegram bildirishnoma (attendance-notify config) ───────

/**
 * Per-account davomat-notify config. `lateFineAmountMinor` is tiyin (BigInt on
 * the backend) serialised as a string; the UI converts to/from so'm.
 */
export interface HrDavomatNotifyConfig {
  enabled: boolean;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  directorSlot: number | null;
  lateFineEnabled: boolean;
  lateThresholdMin: number;
  lateFineAmountMinor: string;
  lateFinePerMinute: boolean;
}

/** PUT upsert DTO — every field optional (partial patch). */
export interface UpdateHrDavomatNotifyConfigInput {
  enabled?: boolean;
  notifyCheckIn?: boolean;
  notifyCheckOut?: boolean;
  directorSlot?: number | null;
  lateFineEnabled?: boolean;
  lateThresholdMin?: number;
  /** tiyin (so'm × 100) as string — BigInt on the wire. */
  lateFineAmountMinor?: string;
  lateFinePerMinute?: boolean;
}

export interface HrDavomatNotifyTestResult {
  ok: boolean;
  reason?: string;
}

export function getDavomatNotifyConfig() {
  return api.get<HrDavomatNotifyConfig>('/hr/attendance-notify/config');
}

export function updateDavomatNotifyConfig(dto: UpdateHrDavomatNotifyConfigInput) {
  return api.put<HrDavomatNotifyConfig>('/hr/attendance-notify/config', dto);
}

export function sendDavomatNotifyTest() {
  return api.post<HrDavomatNotifyTestResult>('/hr/attendance-notify/test', {});
}

export type { HrAccessLevel, HrPermissionRow };
