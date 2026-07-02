import { z } from 'zod';

/**
 * PaymentIn (Входящий платёж) — inbound payment from customer.
 *
 * FSM (Sprint 3.4b):
 *   draft → posted (applicable=true, invoices allocated, payedSum updated)
 *   posted → draft (unpost; reverse allocations)
 *   draft|posted → cancelled
 *
 * Allocations (operations[]): each entry links the payment to a specific
 * InvoiceOut and specifies how much of the payment goes there. Total
 * allocations must equal the payment sum (enforced on create/update).
 */

export const PaymentInStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PaymentInState = z.infer<typeof PaymentInStateSchema>;

export const PaymentInTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PaymentInTransitionTarget = z.infer<typeof PaymentInTransitionSchema>;

export const PaymentInOperationInputSchema = z.object({
  // moysklad pays an InvoiceOut (Счёт покупателя) OR a CustomerOrder (Заказ
  // покупателя) directly. The service requires the matching id for the kind.
  targetKind: z.enum(['invoiceout', 'customerorder']).default('invoiceout'),
  invoiceOutId: z.string().uuid().nullish(),
  customerOrderId: z.string().uuid().nullish(),
  amountMinor: z.coerce.string().regex(/^\d+$/, 'amountMinor must be a non-negative integer'),
});
export type PaymentInOperationInput = z.infer<typeof PaymentInOperationInputSchema>;

export const CreatePaymentInSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  // moysklad parity — Договор / Проект (money doc has counterparty).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // «Канал продаж» — column exists on the model (no migration); the editor
  // surfaces it like CO/demands. Optional, like contract/project.
  salesChannelId: z.string().uuid().nullish(),
  // moysklad parity (§18 live archetype) — Счёт организации / Счёт
  // контрагента (bank-payment doc) + Внешний код. Cols exist (no migration).
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  incomingDate: z.coerce.date().nullish(),
  incomingNumber: z.string().max(50).nullish(),
  paymentPurpose: z.string().max(500).nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  sumMinor: z.coerce.string().regex(/^\d+$/, 'sumMinor must be a non-negative integer'),
  // «Включая НДС» — VAT amount included in the sum. Column `vat_sum_minor`
  // exists on the model (no migration); editable money field in the editor.
  vatSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'vatSumMinor must be a non-negative integer')
    .default('0'),
  operations: z.array(PaymentInOperationInputSchema).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePaymentInInput = z.infer<typeof CreatePaymentInSchema>;

export const UpdatePaymentInSchema = CreatePaymentInSchema.partial().extend({
  // Optimistic-lock token (money-document cohort). The edit form echoes the
  // `version` it loaded; the service runs the update as
  // `WHERE id = ? AND version = ?` and increments it, so a concurrent edit
  // 409s instead of silently clobbering. REQUIRED on update (a forgetful
  // caller must not bypass the lock); CREATE never accepts it.
  version: z.number().int().nonnegative(),
});
export type UpdatePaymentInInput = z.infer<typeof UpdatePaymentInSchema>;

export const CreateFromInvoiceOutSchema = z.object({
  sumMinor: z.coerce.string().regex(/^\d+$/).optional(), // defaults to invoice remaining
  paymentPurpose: z.string().max(500).nullish(),
});
export type CreateFromInvoiceOutInput = z.infer<typeof CreateFromInvoiceOutSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PaymentInFilterSchema = z.object({
  state: PaymentInStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — filters via the agent (Counterparty) relation's
   * `ownerId` (the employee who owns the counterparty). §4-grounded on
   * payments-in/states/02-filter-applied.png (row 2). Distinct from
   * `ownerId` below, which is the PAYMENT's owner. Merged with `agentGroupId`
   * into one `agent: {}` clause in buildListWhere (two separate `agent` keys
   * would overwrite each other under object spread).
   */
  agentOwnerId: z.string().uuid().optional(),
  /** «Счёт контрагента» — PaymentIn.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — PaymentIn.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  invoiceOutId: z.string().uuid().optional(),
  /** «Договор» — PaymentIn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — PaymentIn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Канал продаж» — PaymentIn.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — PaymentIn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — PaymentIn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Назначение платежа» — dedicated text-contains filter on the
   * `paymentPurpose` column (mirrors how `search` matches that column, but
   * scoped to purpose only). moysklad surfaces this as its own list field.
   */
  paymentPurpose: z.string().max(500).optional(),
  /** «Проведено» — PaymentIn.applicable flag. */
  applicable: boolFromString.optional(),
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
  // NOTE: «Статья расходов» is SKIPPED — the PaymentIn model has no
  // `expenseItem` column (it exists only on CashOut / PaymentOut money-out
  // docs, schema.prisma lines 5046 / 5729). An inbound payment has no
  // expense item by design. «Кто изменил» (modifiedById) is likewise
  // SKIPPED — PaymentIn has no `updatedById` column (only `ownerId`).
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PaymentInFilterInput = z.infer<typeof PaymentInFilterSchema>;
