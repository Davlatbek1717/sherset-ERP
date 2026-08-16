// Domain event payloads emitted by existing services (Demand, PaymentIn, etc.)
// and consumed by HR Telegram bridge listeners. Type-safe via EventEmitter2.

export const HR_EVENT = {
  DEMAND_POSTED: 'hr.event.demand.posted',
  PAYMENT_IN_POSTED: 'hr.event.paymentIn.posted',
  CUSTOMER_ORDER_CREATED: 'hr.event.customerOrder.created',
  SUPPLY_POSTED: 'hr.event.supply.posted',
  SALES_RETURN_POSTED: 'hr.event.salesReturn.posted',
  // HR-internal events (Task lifecycle):
  HR_TASK_DISPATCHED: 'hr.event.hrTaskLog.dispatched',
  HR_TASK_ANSWERED: 'hr.event.hrTaskLog.answered',
  HR_TASK_PENDING_REVIEW: 'hr.event.hrTaskLog.pendingReview',
  HR_TASK_LOG_FINALIZED: 'hr.event.hrTaskLog.finalized',
  HR_TASK_LOG_DEADLINE_EXPIRED: 'hr.event.hrTaskLog.deadlineExpired',
  // Attendance (keldi/ketdi) — drives the director Telegram notifier + auto-fine.
  HR_ATTENDANCE_CHECKED_IN: 'hr.attendance.checked_in',
  HR_ATTENDANCE_CHECKED_OUT: 'hr.attendance.checked_out',
  // Counterparty balance moved (debt/payment) — drives the owner debt notifier.
  COUNTERPARTY_BALANCE_CHANGED: 'hr.event.counterparty.balanceChanged',
} as const;

export type HrEventName = (typeof HR_EVENT)[keyof typeof HR_EVENT];

export interface DemandPostedEvent {
  accountId: string;
  demandId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
}

export interface PaymentInPostedEvent {
  accountId: string;
  paymentInId: string;
  counterpartyId: string;
  sumMinor: bigint;
  postedAt: Date;
}

export interface CustomerOrderCreatedEvent {
  accountId: string;
  customerOrderId: string;
  counterpartyId: string;
  totalMinor: bigint;
  createdAt: Date;
}

export interface SupplyPostedEvent {
  accountId: string;
  supplyId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
  // Sherset KEEP (hr-telegram-bridge supply notification) — B3. Optional: climart's
  // supply.service does not populate these yet; the listener degrades gracefully.
  supplyNumber?: string;
  items?: Array<{
    name: string;
    quantity: string;
    uom: string | null;
    priceMinor: bigint;
    lineSumMinor: bigint;
  }>;
}

export interface SalesReturnPostedEvent {
  accountId: string;
  salesReturnId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
}

export interface HrTaskDispatchedEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  employeeId: string;
  triggeredBy: 'manual' | 'scheduled' | 'event';
}

export interface HrTaskAnsweredEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  /** The employee who answered. */
  employeeId: string;
  /** Resulting status of the answer. */
  status: 'answered_yes' | 'answered_no' | 'answered_text' | 'pending_review';
  /** True when the answer went to a checker queue instead of finalizing. */
  requiresReview: boolean;
}

export interface HrTaskPendingReviewEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  /** The employee whose answer is awaiting review. */
  employeeId: string;
  /** The designated checker who must review (WS delivery target). */
  checkerId: string;
}

export interface HrTaskLogFinalizedEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  employeeId: string;
  status: 'answered_yes' | 'answered_no' | 'answered_text';
  reviewedById?: string;
}

export interface HrTaskLogDeadlineExpiredEvent {
  accountId: string;
  taskLogId: string;
  templateId: string;
  employeeId: string;
}

export interface HrAttendanceCheckedInEvent {
  accountId: string;
  attendanceId: string;
  employeeId: string;
  /** Moment of check-in (UTC Date). */
  at: Date;
  /** Minutes late vs the resolved shift (0 = on time). */
  lateMinutes: number;
}

export interface HrAttendanceCheckedOutEvent {
  accountId: string;
  attendanceId: string;
  employeeId: string;
  /** Moment of check-out (UTC Date). */
  at: Date;
}

/**
 * Which document/operation moved the counterparty balance. Only the "real"
 * debt/payment postings thread a source through applyDelta's optional `meta`;
 * reversals (unpost/cancel), rebalances and internal adjustments leave it
 * `undefined`, so the owner notifier can no-op on them.
 */
export type CounterpartyBalanceChangeSource =
  | 'invoiceIn'
  | 'invoiceOut'
  | 'paymentIn'
  | 'paymentOut'
  | 'cashIn'
  | 'cashOut'
  /**
   * Kassa (POS) qarzga savdosi. Yo'nalish `deltaMinor` ISHORASIDAN o'qiladi:
   * `> 0` qarzga sotildi · `< 0` qaytarish/tuzatish (mijozga baribir aytiladi —
   * aks holda uning qo'lida «qarzga qo'shildi» oxirgi haqiqat bo'lib qolardi).
   */
  | 'retailsale'
  /** Kassa qarz to'lovi (`recalcDebt` → `-paidDelta`). */
  | 'debtpayment'
  /** Qo'lda ochilgan QRZ- qarz. `deltaMinor < 0` ⇒ qarz o'chirildi/tuzatildi. */
  | 'debt';

export interface CounterpartyBalanceChangedEvent {
  accountId: string;
  counterpartyId: string;
  /** ISO-3 currency of the moved balance row (UZS/USD/…). */
  currency: string;
  /** Pre-signed delta applied: positive = counterparty owes us more. */
  deltaMinor: bigint;
  /** Balance AFTER the delta was applied (the upserted row value). */
  newBalanceMinor: bigint;
  /** Undefined for reversals / internal rebalances (notifier skips those). */
  source?: CounterpartyBalanceChangeSource;
  docType?: string;
  docId?: string;
}

export type HrEventPayloadMap = {
  [HR_EVENT.DEMAND_POSTED]: DemandPostedEvent;
  [HR_EVENT.PAYMENT_IN_POSTED]: PaymentInPostedEvent;
  [HR_EVENT.CUSTOMER_ORDER_CREATED]: CustomerOrderCreatedEvent;
  [HR_EVENT.SUPPLY_POSTED]: SupplyPostedEvent;
  [HR_EVENT.SALES_RETURN_POSTED]: SalesReturnPostedEvent;
  [HR_EVENT.HR_TASK_DISPATCHED]: HrTaskDispatchedEvent;
  [HR_EVENT.HR_TASK_ANSWERED]: HrTaskAnsweredEvent;
  [HR_EVENT.HR_TASK_PENDING_REVIEW]: HrTaskPendingReviewEvent;
  [HR_EVENT.HR_TASK_LOG_FINALIZED]: HrTaskLogFinalizedEvent;
  [HR_EVENT.HR_TASK_LOG_DEADLINE_EXPIRED]: HrTaskLogDeadlineExpiredEvent;
  [HR_EVENT.HR_ATTENDANCE_CHECKED_IN]: HrAttendanceCheckedInEvent;
  [HR_EVENT.HR_ATTENDANCE_CHECKED_OUT]: HrAttendanceCheckedOutEvent;
  [HR_EVENT.COUNTERPARTY_BALANCE_CHANGED]: CounterpartyBalanceChangedEvent;
};
