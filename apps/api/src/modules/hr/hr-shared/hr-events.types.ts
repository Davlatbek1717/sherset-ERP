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

/** One received line on a posted Supply — carried for the supplier «qabul cheki». */
export interface SupplyPostedItem {
  /** Product (or assortment) display name. */
  name: string;
  /** Received quantity as a decimal string (e.g. "50", "12.5"). */
  quantity: string;
  /** Unit of measurement label ("шт", "кг"), or null when unset. */
  uom: string | null;
  /** Unit price in tiyin (minor units). */
  priceMinor: bigint;
  /** Line total in tiyin — sums (with the others) to Supply.sumMinor. */
  lineSumMinor: bigint;
}

export interface SupplyPostedEvent {
  accountId: string;
  supplyId: string;
  counterpartyId: string;
  totalMinor: bigint;
  postedAt: Date;
  /** Supply document number («00772») — shown on the confirmation + receipt. */
  supplyNumber: string;
  /** Received lines, in document order — drives the supplier «qabul cheki». */
  items: SupplyPostedItem[];
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
};
