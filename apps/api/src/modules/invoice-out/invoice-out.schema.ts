import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * InvoiceOut (Счёт покупателю) schema — mirrors Demand/CustomerOrder patterns.
 *
 * FSM (Sprint 3.3 scope):
 *   draft → posted (manual) — updates CO.invoicedSumMinor
 *   draft|posted|sent → cancelled (manual)
 *
 * Deferred (Sprint 3.3 later / 3.4):
 *   posted → sent (email delivery)
 *   partially_paid, paid (derived from PaymentIn — Sprint 3.4)
 *   overdue (scheduled cron)
 */

export const InvoiceOutStateSchema = z.enum([
  'draft',
  'posted',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
]);
export type InvoiceOutState = z.infer<typeof InvoiceOutStateSchema>;

/**
 * Available transitions:
 *   post       — draft → posted (creates the invoice obligation)
 *   unpost     — posted → draft (only if no payments applied)
 *   cancel     — posted | sent | overdue → cancelled
 *   mark_sent  — posted → sent (email-delivered confirmation)
 *
 * Auto-transitions (no `target` value):
 *   posted → partially_paid → paid (cascaded by PaymentInService)
 *   posted | sent → overdue (scheduled cron — InvoiceOutOverdueService)
 */
export const InvoiceOutTransitionSchema = z.enum(['post', 'unpost', 'cancel', 'mark_sent']);
export type InvoiceOutTransitionTarget = z.infer<typeof InvoiceOutTransitionSchema>;

export const InvoiceOutPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  customerOrderPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type InvoiceOutPositionInput = z.infer<typeof InvoiceOutPositionInputSchema>;

export const CreateInvoiceOutSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  customerOrderId: z.string().uuid().nullish(),
  // moysklad parity (§10 live capture) — Склад + org/agent accounts + Внешний код.
  storeId: z.string().uuid().nullish(),
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  // moysklad parity — Канал продаж / Договор / Проект (optional FK refs).
  salesChannelId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // «Владелец» / «Владелец-отдел» / «Общий доступ» — the header owner-popover
  // (mirror invoice-in.create). Tenant-validated in the service; fall back to the
  // creator + their dept when absent.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().default(false),
  // «Статус» — account-defined custom status (State row, entityType="invoiceout"),
  // orthogonal to the FSM `state`. Tenant-validated in the service.
  statusId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  paymentPlannedMoment: z.coerce.date().nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  // «Проведено» — moysklad defaults the «Счёт покупателю» create form to CHECKED.
  // When true the service posts the invoice on create (state→posted, applies the
  // counterparty balance + CO.invoicedSum cascade); false leaves it a draft.
  applicable: z.boolean().default(false),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  positions: z.array(InvoiceOutPositionInputSchema),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateInvoiceOutInput = z.infer<typeof CreateInvoiceOutSchema>;

export const UpdateInvoiceOutSchema = CreateInvoiceOutSchema.partial().extend({
  positions: z.array(InvoiceOutPositionInputSchema).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateInvoiceOutInput = z.infer<typeof UpdateInvoiceOutSchema>;

export const CreateFromCustomerOrderSchema = z.object({
  // Optional per-position quantity override (partial invoice).
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  paymentPlannedMoment: z.coerce.date().nullish(),
});
export type CreateFromCustomerOrderInput = z.infer<typeof CreateFromCustomerOrderSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** CSV-or-array of UUIDs (mirror invoice-in.schema `csvUuid`) — backs the
 *  multi-select inline filter fields (agentIds, productIds, …). */
const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

export const InvoiceOutFilterSchema = z.object({
  state: InvoiceOutStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — the OWNER EMPLOYEE of the agent (Counterparty),
   * i.e. `agent.ownerId`. Distinct from «Владелец-сотрудник» (`ownerId`, the
   * InvoiceOut's own owner). Narrows the same `agent` relation as agentGroupId,
   * so buildListWhere merges them into a single `agent:{}` clause (a second
   * separate `agent` key would overwrite the first — last-key-wins). Mirrors
   * the invoices-in / supplies / cash-in / cash-out sibling.
   */
  agentOwnerId: z.string().uuid().optional(),
  /** «Счёт контрагента» — InvoiceOut.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — InvoiceOut.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  /** «Склад» — InvoiceOut.storeId (invoice ships from this warehouse). */
  storeId: z.string().uuid().optional(),
  customerOrderId: z.string().uuid().optional(),
  /** «Проект» — InvoiceOut.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Договор» — InvoiceOut.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Канал продаж» — InvoiceOut.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — InvoiceOut.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — InvoiceOut.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Оплата» — payment progress computed against payedSumMinor / sumMinor
   * via Prisma 5 field references (no stored boolean). InvoiceOut carries
   * the `payedSumMinor` column, populated by the PaymentIn cascade.
   */
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  /**
   * «Отгружено» — shipment progress against shippedSumMinor / sumMinor
   * (mirror paymentStatus; the PaymentIn/Demand cascade maintains
   * shippedSumMinor). not_shipped = 0, partial = 0<shipped<sum, shipped = >=sum.
   */
  shippedStatus: z.enum(['not_shipped', 'partial', 'shipped']).optional(),
  /** «План. дата оплаты» — paymentPlannedMoment range (mirror momentFrom/To). */
  paymentPlannedFrom: z.string().optional(),
  paymentPlannedTo: z.string().optional(),
  /**
   * «Товар или группа» — narrows to invoices whose positions include this
   * product (positions.some.productId). Single-pick to match the moysklad
   * invoiceout filter control.
   */
  productId: z.string().uuid().optional(),
  /** «Общий доступ» — InvoiceOut.shared flag. */
  shared: boolFromString.optional(),
  /**
   * «Кто изменил» — InvoiceOut has no modifiedById column, so the service
   * resolves this user id to the entityIds they `update`d via the auditLog
   * (mirror loss / invoice-in). Single-pick employee.
   */
  modifiedById: z.string().uuid().optional(),
  // ── Multi-select inline (MultiCombobox) variants — moysklad checkbox-dropdowns.
  // Each `*Ids` is a CSV-or-array of UUIDs; buildListWhere prefers it over the
  // single `*Id` (kept for back-compat: create-from links + legacy saved filters).
  /** «Контрагент» multi. */
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» multi (agent.groupId IN). */
  agentGroupIds: csvUuid.optional(),
  /** «Владелец контрагента» multi (agent.ownerId IN). */
  agentOwnerIds: csvUuid.optional(),
  /** «Счёт контрагента» multi. */
  agentAccountIds: csvUuid.optional(),
  /** «Организация» multi. */
  organizationIds: csvUuid.optional(),
  /** «Счёт организации» multi. */
  organizationAccountIds: csvUuid.optional(),
  /** «Склад» multi. */
  storeIds: csvUuid.optional(),
  /** «Проект» multi. */
  projectIds: csvUuid.optional(),
  /** «Договор» multi. */
  contractIds: csvUuid.optional(),
  /** «Канал продаж» multi. */
  salesChannelIds: csvUuid.optional(),
  /** «Владелец-отдел» multi. */
  groupIds: csvUuid.optional(),
  /** «Владелец-сотрудник» multi. */
  ownerIds: csvUuid.optional(),
  /** «Товар или группа» multi (positions.some.productId IN). */
  productIds: csvUuid.optional(),
  /** «Кто изменил» multi (auditLog userId IN → entityIds). */
  modifiedByIds: csvUuid.optional(),
  /** «Проведено» — InvoiceOut.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — InvoiceOut.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — InvoiceOut.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // «Кто изменил» (modifiedById) + «Общий доступ» (shared) are now surfaced
  // for moysklad invoiceout-filter pixel-parity. shared filters the column
  // directly (a no-op until a writer sets shared=true, but the control matches
  // moysklad 1:1); modifiedById is resolved via the auditLog in the service.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'payedSumMinor', 'agent', 'organization'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type InvoiceOutFilterInput = z.infer<typeof InvoiceOutFilterSchema>;
