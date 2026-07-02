import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * InvoiceIn (Счёт поставщика) schema — purchase-side mirror of InvoiceOut.
 *
 * FSM (Sprint 4.2 scope):
 *   draft  → posted (manual)    — updates PO.invoicedSumMinor
 *   posted → draft  (manual)    — reverts PO.invoicedSumMinor
 *   draft|posted → cancelled (manual) — reverts PO.invoicedSumMinor if was applicable
 *
 * Derived (future sprints, mirrors InvoiceOut):
 *   posted → partially_paid (Sprint 4.3 — PaymentOut applied)
 *   posted|partially_paid → paid (Sprint 4.3 — PaymentOut full coverage)
 *
 * Notes:
 * - No `sent` state: the supplier sent the invoice to us, so the outgoing
 *   delivery concept doesn't apply.
 * - No `overdue` state: our payment planning is tracked via
 *   `paymentPlannedMoment`, but overdue is not a formal state (it's a report
 *   filter — supplier's problem, not ours to transition into).
 * - `incomingNumber` + `incomingDate` capture the supplier's original document
 *   identity (printed on their paper/EDO invoice).
 */

export const InvoiceInStateSchema = z.enum([
  'draft',
  'posted',
  'partially_paid',
  'paid',
  'cancelled',
]);
export type InvoiceInState = z.infer<typeof InvoiceInStateSchema>;

export const InvoiceInTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type InvoiceInTransitionTarget = z.infer<typeof InvoiceInTransitionSchema>;

export const InvoiceInPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  purchaseOrderPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type InvoiceInPositionInput = z.infer<typeof InvoiceInPositionInputSchema>;

export const CreateInvoiceInSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  // moysklad «Владелец» (owner popover, top-right of the editor) — owner employee
  // (ownerId), department (groupId) and «Общий доступ» (shared) set on create.
  // Without these the service stamps the creator + their dept. Mirror PurchaseOrder.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  purchaseOrderId: z.string().uuid().nullish(),
  // moysklad parity — Договор / Проект (optional FK refs; purchase docs
  // have no sales channel).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad parity (§16 live capture) — Склад + org/agent accounts +
  // Внешний код. All columns exist in the InvoiceIn model (no migration).
  storeId: z.string().uuid().nullish(),
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  paymentPlannedMoment: z.coerce.date().nullish(),
  incomingNumber: z.string().max(100).nullish(),
  incomingDate: z.coerce.date().nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  positions: z.array(InvoiceInPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateInvoiceInInput = z.infer<typeof CreateInvoiceInSchema>;

export const UpdateInvoiceInSchema = CreateInvoiceInSchema.partial().extend({
  positions: z.array(InvoiceInPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateInvoiceInInput = z.infer<typeof UpdateInvoiceInSchema>;

export const CreateFromPurchaseOrderSchema = z.object({
  // Optional per-position quantity override (partial invoice).
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  paymentPlannedMoment: z.coerce.date().nullish(),
  incomingNumber: z.string().max(100).nullish(),
  incomingDate: z.coerce.date().nullish(),
});
export type CreateFromPurchaseOrderInput = z.infer<typeof CreateFromPurchaseOrderSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** CSV-or-array of UUIDs (mirror purchase-order.schema `csvUuid`). */
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

/**
 * «Оплата» — derived state from payedSumMinor vs sumMinor (mirror
 * purchase-order `PaymentStateSchema`):
 *   paid       → payedSumMinor >= sumMinor (sum > 0)
 *   partlyPaid → 0 < payedSumMinor < sumMinor
 *   unpaid     → payedSumMinor === 0
 */
export const PaymentStateSchema = z.enum(['paid', 'partlyPaid', 'unpaid']);
export type PaymentState = z.infer<typeof PaymentStateSchema>;

/**
 * «Приемка» — derived state from shippedSumMinor (received) vs sumMinor.
 * Mirrors purchase-order `ReceiveStateSchema` but WITHOUT `overdue`:
 * InvoiceIn has no delivery-date concept (it tracks a payment-plan date,
 * not a delivery date), so there is no overdue-receipt variant.
 *   shipped          → shippedSumMinor >= sumMinor (sum > 0, fully received)
 *   partiallyshipped → 0 < shippedSumMinor < sumMinor
 *   unshipped        → shippedSumMinor === 0
 */
export const ReceiveStateSchema = z.enum(['shipped', 'partiallyshipped', 'unshipped']);
export type ReceiveState = z.infer<typeof ReceiveStateSchema>;

export const InvoiceInFilterSchema = z.object({
  state: InvoiceInStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Контрагент» — multi-select inline (agentId IN), moysklad checkbox-dropdown. */
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Группа контрагента» — multi-select (agent.groupId IN). */
  agentGroupIds: csvUuid.optional(),
  /**
   * «Владелец контрагента» — the OWNER EMPLOYEE of the agent (Counterparty),
   * i.e. `agent.ownerId`. Distinct from «Владелец-сотрудник» (`ownerId`, the
   * InvoiceIn's own owner). Narrows the same `agent` relation as agentGroupId,
   * so buildListWhere merges them into a single `agent:{}` clause (a second
   * separate `agent` key would overwrite the first — last-key-wins). Mirrors
   * the supplies / cash-in / cash-out sibling.
   */
  agentOwnerId: z.string().uuid().optional(),
  /** «Владелец контрагента» — multi-select (agent.ownerId IN). */
  agentOwnerIds: csvUuid.optional(),
  /** «Счёт контрагента» — InvoiceIn.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  /** «Счёт контрагента» — multi-select inline (agentAccountId IN). */
  agentAccountIds: csvUuid.optional(),
  organizationId: z.string().uuid().optional(),
  /** «Организация» — multi-select inline (organizationId IN), moysklad checkbox-dropdown. */
  organizationIds: csvUuid.optional(),
  /** «Счёт организации» — InvoiceIn.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  /** «Счёт организации» — multi-select inline (organizationAccountId IN). */
  organizationAccountIds: csvUuid.optional(),
  /** «Склад» — InvoiceIn.storeId (optional; supplier invoice may be store-bound). */
  storeId: z.string().uuid().optional(),
  /** «Склад» — multi-select (storeId IN). */
  storeIds: csvUuid.optional(),
  /** «Заказ поставщику» — InvoiceIn.purchaseOrderId (back-link to the PO). */
  purchaseOrderId: z.string().uuid().optional(),
  /** «Договор» — InvoiceIn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Договор» — multi-select (contractId IN). */
  contractIds: csvUuid.optional(),
  /** «Проект» — InvoiceIn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Проект» — multi-select (projectId IN). */
  projectIds: csvUuid.optional(),
  /** «Владелец-отдел» — InvoiceIn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-отдел» — multi-select (groupId IN). */
  groupIds: csvUuid.optional(),
  /** «Владелец-сотрудник» — InvoiceIn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — multi-select (ownerId IN). */
  ownerIds: csvUuid.optional(),
  /**
   * «Кто изменил» — multi-select. InvoiceIn has NO `modifiedById`/`updatedById`
   * column, so this is approximated via an auditLog pre-query in the service
   * (entity='InvoiceIn', userId IN, action contains 'update') → narrows the
   * result to those entityIds. Replace with a real column when one lands.
   */
  modifiedByIds: csvUuid.optional(),
  /** «Товар или группа» — JOIN to InvoiceInPosition.productId (multi-select). */
  productIds: csvUuid.optional(),
  /** «Проведено» — InvoiceIn.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — InvoiceIn.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — InvoiceIn.published flag. */
  published: boolFromString.optional(),
  /** «Общий доступ» — InvoiceIn.shared flag. */
  shared: boolFromString.optional(),
  /** Derived «Оплата» / «Приемка» — see schemas above. */
  paymentState: PaymentStateSchema.optional(),
  receiveState: ReceiveStateSchema.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /** «Входящий номер» — supplier's original document number (contains match). */
  incomingNumber: z.string().max(100).optional(),
  /** «Входящая дата» period — filters on `incomingDate`. */
  incomingDateFrom: z.string().optional(),
  incomingDateTo: z.string().optional(),
  /** «План. дата оплаты» period — filters on `paymentPlannedMoment`. */
  paymentPlannedFrom: z.string().optional(),
  paymentPlannedTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type InvoiceInFilterInput = z.infer<typeof InvoiceInFilterSchema>;
