import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * CashIn (приходный кассовый ордер, ПКО) — cash received from a counterparty
 * into a CashDesk.
 *
 * FSM (Sprint 6.2):
 *   draft → posted (cashDesk balance +=, InvoiceOut.payedSum += via allocations)
 *   posted → draft (unpost; reverse both)
 *   draft|posted → cancelled
 *
 * Mirror of PaymentIn — same allocation shape, but `cashDeskId` replaces the
 * bank-account destination. MoneyService records one ledger entry per post.
 */

export const CashInStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type CashInState = z.infer<typeof CashInStateSchema>;

export const CashInTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type CashInTransitionTarget = z.infer<typeof CashInTransitionSchema>;

export const CashInOperationInputSchema = z.object({
  targetKind: z.enum(['invoiceout']).default('invoiceout'),
  invoiceOutId: z.string().uuid(),
  amountMinor: z.coerce.string().regex(/^\d+$/, 'amountMinor must be a non-negative integer'),
});
export type CashInOperationInput = z.infer<typeof CashInOperationInputSchema>;

export const CreateCashInSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  // moysklad parity — Договор / Проект (money doc has counterparty).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // «Канал продаж» — column exists on the model (no migration); surfaced in the
  // editor like the bank-payment docs. Optional, like contract/project.
  salesChannelId: z.string().uuid().nullish(),
  moment: z.coerce.date().optional(),
  paymentPurpose: z.string().max(500).nullish(),
  description: z.string().max(4000).nullish(),
  // moysklad parity (§17) — universal «Внешний код» (col exists, no migration).
  externalCode: z.string().max(50).nullish(),
  // «Включая НДС» — VAT amount included in the sum (col vat_sum_minor exists).
  vatSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'vatSumMinor must be a non-negative integer')
    .default('0'),
  // «Владелец»/«Владелец-отдел»/«Общий доступ» from the header owner popover
  // (tenant-validated in create(); falls back to creator + their dept).
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  sumMinor: z.coerce.string().regex(/^\d+$/, 'sumMinor must be a non-negative integer'),
  operations: z.array(CashInOperationInputSchema).default([]),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCashInInput = z.infer<typeof CreateCashInSchema>;

export const UpdateCashInSchema = CreateCashInSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateCashInInput = z.infer<typeof UpdateCashInSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CashInFilterSchema = z.object({
  state: CashInStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /**
   * «Владелец контрагента» — filters via the agent (Counterparty) relation's
   * `ownerId` (the employee who owns the counterparty). §4-grounded on the
   * cashin filter capture (07-module/cashin/dom/00-clean-default.html —
   * `<div class="gwt-Label" title="Владелец контрагента">`, ordered Договор →
   * Владелец контрагента → Организация). Distinct from `ownerId` below, which
   * is the CASH ORDER's own owner («Владелец-сотрудник»). Merged with
   * `agentGroupId` into one `agent: {}` clause in buildListWhere (two separate
   * `agent` keys would overwrite each other under object spread).
   */
  agentOwnerId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Касса» — CashIn.cashDeskId (cash docs use a cash desk, not a bank account). */
  cashDeskId: z.string().uuid().optional(),
  invoiceOutId: z.string().uuid().optional(),
  /** «Договор» — CashIn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — CashIn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Канал продаж» — CashIn.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — CashIn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — CashIn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Назначение платежа» — dedicated text-contains filter on the
   * `paymentPurpose` column (mirrors how `search` matches that column, but
   * scoped to purpose only). moysklad surfaces this as its own list field.
   *
   * NOTE: «Основание» is SKIPPED — in moysklad's cash-order form «Основание»
   * is backed by the SAME `paymentPurpose` column (reference DOM renders it
   * as `<textarea class="gwt-TextArea paymentPurpose">`). CashIn has no
   * distinct `basis`/`reason`/`grounds` column, so adding a second filter
   * would be a duplicate of this one.
   */
  paymentPurpose: z.string().max(500).optional(),
  /** «Проведено» — CashIn.applicable flag. */
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
  // NOTE: «Статья расходов» is SKIPPED — CashIn is an income (ПКО) doc and
  // has no `expenseItem` column (it exists only on the money-out docs
  // CashOut / PaymentOut). «Кто изменил» is likewise SKIPPED — CashIn has no
  // `updatedById` column (only `ownerId`). Cash docs also have no bank
  // accounts, so «Счёт контрагента/организации» do not apply (cashDeskId).
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type CashInFilterInput = z.infer<typeof CashInFilterSchema>;
