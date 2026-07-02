import { z } from 'zod';

/**
 * CashOut (расходный кассовый ордер, РКО) — cash paid out of a CashDesk.
 *
 * Mirror of PaymentOut/CashIn. FSM: draft → posted → cancelled.
 * post(): cashDesk balance -=, InvoiceIn.payedSum += via allocations.
 */

export const CashOutStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type CashOutState = z.infer<typeof CashOutStateSchema>;

export const CashOutTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type CashOutTransitionTarget = z.infer<typeof CashOutTransitionSchema>;

export const CashOutOperationInputSchema = z.object({
  targetKind: z.enum(['invoicein']).default('invoicein'),
  invoiceInId: z.string().uuid(),
  amountMinor: z.coerce.string().regex(/^\d+$/, 'amountMinor must be a non-negative integer'),
});
export type CashOutOperationInput = z.infer<typeof CashOutOperationInputSchema>;

export const CreateCashOutSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  // moysklad parity — Договор / Проект (money doc has counterparty).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  paymentPurpose: z.string().max(500).nullish(),
  /**
   * «Статья расходов» — the expense item this outgoing cash order is booked
   * against (moysklad parity). Stored as the free-form name string matching
   * the account's ExpenseItem master list (see schema.prisma — the same
   * free-form VarChar(100) column as PaymentOut.expenseItem). Until now the
   * `expenseItem` column was never written by any create/update path, so the
   * (pre-existing) «Статья расходов» list filter matched nothing — a dead
   * control (the 11h trap). Surfacing it on the create/edit form makes the
   * column live so that filter is honest. This is the cash-OUT distinguishing
   * field: CashIn (приходный ордер) has no expense item. Kept nullish (not
   * required) to mirror PaymentOut and avoid breaking existing drafts/clones,
   * even though moysklad renders it as a required field on the РКО form.
   */
  expenseItem: z.string().max(100).nullish(),
  description: z.string().max(4000).nullish(),
  // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
  externalCode: z.string().max(50).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  sumMinor: z.coerce.string().regex(/^\d+$/, 'sumMinor must be a non-negative integer'),
  operations: z.array(CashOutOperationInputSchema).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCashOutInput = z.infer<typeof CreateCashOutSchema>;

export const UpdateCashOutSchema = CreateCashOutSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  version: z.number().int().nonnegative(),
});
export type UpdateCashOutInput = z.infer<typeof UpdateCashOutSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CashOutFilterSchema = z.object({
  state: CashOutStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — filters via the agent (Counterparty) relation's
   * `ownerId` (the employee who owns the counterparty). §4-grounded on the
   * cashout filter capture (07-module/cashout/dom/00-clean-default.html —
   * `<div class="gwt-Label" title="Владелец контрагента">`). Distinct from
   * `ownerId` below, which is the CASH ORDER's own owner («Владелец-сотрудник»).
   * Merged with `agentGroupId` into one `agent: {}` clause in buildListWhere
   * (two separate `agent` keys would overwrite each other under object spread).
   */
  agentOwnerId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Касса» — CashOut.cashDeskId (cash docs use a cash desk, not a bank account). */
  cashDeskId: z.string().uuid().optional(),
  invoiceInId: z.string().uuid().optional(),
  /** «Договор» — CashOut.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — CashOut.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Канал продаж» — CashOut.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — CashOut.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — CashOut.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Назначение платежа» — dedicated text-contains filter on the
   * `paymentPurpose` column (mirrors how `search` matches that column, but
   * scoped to purpose only). moysklad surfaces this as its own list field.
   *
   * NOTE: «Основание» is SKIPPED — in moysklad's cash-order form «Основание»
   * is backed by the SAME `paymentPurpose` column (cash-in reference renders
   * it as `<textarea class="...paymentPurpose">`). CashOut has no distinct
   * `basis`/`reason`/`grounds` column, so adding a second filter would be a
   * duplicate of this one.
   */
  paymentPurpose: z.string().max(500).optional(),
  /**
   * «Статья расходов» — text-contains filter on the `expenseItem` column
   * (account-level expense category tag, free-form VarChar). This is the KEY
   * difference vs CashIn: CashOut is a money-OUT doc that carries an expense
   * item, so the filter exists here (mirrors payments-out). Filter pattern
   * mirrors `paymentPurpose` above.
   */
  expenseItem: z.string().max(100).optional(),
  /** «Проведено» — CashOut.applicable flag. */
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
  // NOTE: «Кто изменил» is SKIPPED — CashOut has no `updatedById` column
  // (only `ownerId`). Cash docs also have no bank accounts, so «Счёт
  // контрагента/организации» do not apply (cashDeskId replaces them).
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type CashOutFilterInput = z.infer<typeof CashOutFilterSchema>;
