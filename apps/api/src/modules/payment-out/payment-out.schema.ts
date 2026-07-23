import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * PaymentOut (Исходящий платёж) — outbound payment to supplier.
 *
 * FSM (Sprint 4.3):
 *   draft → posted (applicable=true, invoices/orders allocated, payedSum
 *                   cascades on each target)
 *   posted → draft (unpost; reverse allocations)
 *   draft|posted → cancelled
 *
 * Allocations (operations[]): polymorphic — each entry targets either an
 * InvoiceIn (pays a supplier's received invoice) or a PurchaseOrder
 * directly (advance payment before the supplier issues an invoice). Total
 * allocation sum must be ≤ payment sum (enforced on create/update).
 */

export const PaymentOutStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PaymentOutState = z.infer<typeof PaymentOutStateSchema>;

export const PaymentOutTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PaymentOutTransitionTarget = z.infer<typeof PaymentOutTransitionSchema>;

/**
 * Polymorphic allocation target:
 *   { targetKind: 'invoicein',     invoiceInId: <uuid>,     amountMinor }
 *   { targetKind: 'purchaseorder', purchaseOrderId: <uuid>, amountMinor }
 *
 * Exactly one of invoiceInId / purchaseOrderId is required, matching
 * targetKind.
 */
export const PaymentOutOperationInputSchema = z
  .object({
    targetKind: z.enum(['invoicein', 'purchaseorder']).default('invoicein'),
    invoiceInId: z.string().uuid().nullish(),
    purchaseOrderId: z.string().uuid().nullish(),
    amountMinor: z.coerce.string().regex(/^\d+$/, 'amountMinor must be a non-negative integer'),
  })
  .refine(
    (op) =>
      (op.targetKind === 'invoicein' && !!op.invoiceInId && !op.purchaseOrderId) ||
      (op.targetKind === 'purchaseorder' && !!op.purchaseOrderId && !op.invoiceInId),
    {
      message:
        "operatsiya: targetKind='invoicein' bo'lsa invoiceInId, 'purchaseorder' bo'lsa purchaseOrderId talab qilinadi (va ikkinchisi null)",
    },
  );
export type PaymentOutOperationInput = z.infer<typeof PaymentOutOperationInputSchema>;

export const CreatePaymentOutSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  // moysklad parity — Договор / Проект (money doc has counterparty).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // «Канал продаж» — moysklad surfaces this on the bank-payment editor too.
  salesChannelId: z.string().uuid().nullish(),
  // moysklad parity (§18 live archetype) — Счёт организации / Счёт
  // контрагента (bank-payment doc) + Внешний код. Cols exist (no migration).
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  paymentPurpose: z.string().max(500).nullish(),
  // «Включая НДС» — the VAT portion of the payment sum (vat_sum_minor col).
  vatSumMinor: z.coerce.string().regex(/^\d+$/).default('0'),
  // «Владелец»/«Владелец-отдел»/«Общий доступ» from the owner popover.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  // «Без закрывающих документов» — the no_closing_docs header checkbox.
  noClosingDocs: z.boolean().optional(),
  /**
   * «Статья расходов» — the expense item this outgoing payment is booked
   * against (moysklad parity). Stored as the free-form name string matching
   * the account's ExpenseItem master list (see schema.prisma ExpenseItem).
   * Until now the `expenseItem` column was never written by any create/
   * update path, so the (pre-existing) «Статья расходов» list filter matched
   * nothing — a dead control. Surfacing it on the create/edit form makes the
   * column live so that filter is honest. Inbound «Входящие платежи» has no
   * expense item, which is why this field is PaymentOut-only.
   */
  expenseItem: z.string().max(100).nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  sumMinor: z.coerce.string().regex(/^\d+$/, 'sumMinor must be a non-negative integer'),
  operations: z.array(PaymentOutOperationInputSchema).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePaymentOutInput = z.infer<typeof CreatePaymentOutSchema>;

export const UpdatePaymentOutSchema = CreatePaymentOutSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdatePaymentOutInput = z.infer<typeof UpdatePaymentOutSchema>;

export const CreateFromInvoiceInSchema = z.object({
  sumMinor: z.coerce.string().regex(/^\d+$/).optional(), // defaults to invoice remaining
  paymentPurpose: z.string().max(500).nullish(),
});
export type CreateFromInvoiceInInput = z.infer<typeof CreateFromInvoiceInSchema>;

export const CreateFromPurchaseOrderAdvanceSchema = z.object({
  sumMinor: z.coerce.string().regex(/^\d+$/), // explicit amount required for advance
  paymentPurpose: z.string().max(500).nullish(),
});
export type CreateFromPurchaseOrderAdvanceInput = z.infer<
  typeof CreateFromPurchaseOrderAdvanceSchema
>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PaymentOutFilterSchema = z.object({
  state: PaymentOutStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — filters via the agent (Counterparty) relation's
   * `ownerId` (the employee who owns the counterparty). §4-grounded on
   * payments-out/states/02-filter-applied.png (row 2). Distinct from `ownerId`
   * below, which is the PAYMENT's owner («Владелец-сотрудник»). Merged with
   * `agentGroupId` into one `agent: {}` clause in buildListWhere (two separate
   * `agent` keys would overwrite each other under object spread).
   */
  agentOwnerId: z.string().uuid().optional(),
  /** «Счёт контрагента» — PaymentOut.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Счёт организации» — PaymentOut.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  invoiceInId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  /** «Договор» — PaymentOut.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — PaymentOut.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Канал продаж» — PaymentOut.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — PaymentOut.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — PaymentOut.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Назначение платежа» — dedicated text-contains filter on the
   * `paymentPurpose` column (mirrors how `search` matches that column, but
   * scoped to purpose only). moysklad surfaces this as its own list field.
   */
  paymentPurpose: z.string().max(500).optional(),
  /**
   * «Статья расходов» — text-contains filter on the `expenseItem`
   * VarChar(100) column. This is the KEY difference vs «Входящие платежи»:
   * an outbound payment carries an expense item, an inbound one does not.
   * Mirrors the paymentPurpose text filter shape.
   */
  expenseItem: z.string().max(100).optional(),
  /** «Проведено» — PaymentOut.applicable flag. */
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
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — PaymentOut has no
  // `updatedById` column (only `ownerId`). No backing column → no filter.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PaymentOutFilterInput = z.infer<typeof PaymentOutFilterSchema>;
