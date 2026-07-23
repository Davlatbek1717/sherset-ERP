import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * FactureIn (Счёт-фактура полученный / Olingan schyot-faktura) — the
 * incoming VAT-bearing tax invoice that a supplier issues against
 * a Supply we received. moysklad parity: every Supply may carry one
 * FactureIn that records the supplier's invoice number + VAT split
 * we file with the tax authority for the input-VAT credit.
 *
 * Sprint 6 scope: read-only list + detail. Create/update/post is
 * deferred to the soliq.uz e-facture inbound sync sprint that pulls
 * supplier-issued e-factures into our ledger automatically.
 */
/**
 * Generate a Счёт-фактура полученный from its source Supply (Приёмка).
 * Mirror of GenerateFactureOutSchema. moysklad parity: the receipt
 * (Supply) is the basis — a Supply yields exactly ONE FactureIn
 * (idempotent). The model links via `supplyId` only (no invoiceInId) —
 * InvoiceIn-sourced factures are NOT fabricated here.
 */
export const GenerateFactureInSchema = z.object({
  supplyId: z.string().uuid(),
});
export type GenerateFactureInInput = z.infer<typeof GenerateFactureInSchema>;

/**
 * §66 — moysklad `supplies` is a 1+ array; a Счёт-фактура полученный
 * can also be based on an исходящий платёж. One source per request.
 */
export const GenerateFactureInFromSuppliesSchema = z.object({
  supplyIds: z.array(z.string().uuid()).min(1, 'at least one supplyId required'),
});
export type GenerateFactureInFromSuppliesInput = z.infer<
  typeof GenerateFactureInFromSuppliesSchema
>;

export const GenerateFactureInFromPaymentOutSchema = z.object({
  paymentOutId: z.string().uuid(),
});

export const FactureInStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type FactureInState = z.infer<typeof FactureInStateSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const FactureInFilterSchema = z.object({
  state: FactureInStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  /** «Владелец-сотрудник» — FactureIn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — FactureIn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Приёмка» — FactureIn.supplyId (back-link to the source Supply). */
  supplyId: z.string().uuid().optional(),
  applicable: boolFromString.optional(),
  printed: boolFromString.optional(),
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  // «Дата добавления» — supplier's printed invoice date — separate range
  // from `moment` because the receive date and the paper date often differ
  // by days when the supplier hands over the paper after delivery.
  incomingDateFrom: z.string().optional(),
  incomingDateTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  // SKIPPED filters (no backing Prisma column on FactureIn):
  //  - «Договор» (contractId) / «Проект» (projectId) / «Склад» (storeId) —
  //    factures carry no contract/project/store FK (unlike InvoiceIn).
  //  - «Кто изменил» (updatedById) — only ownerId/groupId exist, no
  //    "last modified by" column to filter on.
  // Surfacing any of these would need a schema migration outside this task.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'incomingDate', 'agent', 'organization'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type FactureInFilterInput = z.infer<typeof FactureInFilterSchema>;
