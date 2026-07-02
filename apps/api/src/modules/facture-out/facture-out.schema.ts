import { z } from 'zod';

/**
 * FactureOut (Счёт-фактура выданный / Berilgan schyot-faktura) — the
 * VAT-bearing tax invoice issued to a customer that mirrors the
 * underlying Demand. moysklad parity: a Demand creates exactly one
 * FactureOut at posting time (manual or auto), carrying the VAT
 * breakdown that the customer files with the tax authority.
 *
 * Sprint 5 scope: read-only list + detail. Create/update/post flow
 * reserved for the dedicated VAT/soliq-integration sprint that
 * couples FactureOut to the soliq.uz e-facture pipeline.
 */
export const FactureOutStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type FactureOutState = z.infer<typeof FactureOutStateSchema>;

/**
 * Generate a Счёт-фактура from its source Demand (Отгрузка). moysklad
 * parity: the realization (Demand) is the basis — a Demand yields
 * exactly ONE FactureOut (idempotent), carrying the VAT breakdown the
 * customer files. The model links via `demandId` only (no invoiceOutId
 * column) — InvoiceOut-sourced factures are NOT fabricated here.
 */
export const GenerateFactureOutSchema = z.object({
  demandId: z.string().uuid(),
});
export type GenerateFactureOutInput = z.infer<typeof GenerateFactureOutSchema>;

/**
 * §66 — moysklad `demands` is a 1+ array; a Счёт-фактура выданный can
 * also be based on a возврат поставщику or an входящий платёж (аванс,
 * with «Ставка НДС для авансового платежа»). One source per request.
 */
export const GenerateFactureOutFromDemandsSchema = z.object({
  demandIds: z.array(z.string().uuid()).min(1, 'at least one demandId required'),
});
export type GenerateFactureOutFromDemandsInput = z.infer<
  typeof GenerateFactureOutFromDemandsSchema
>;

export const GenerateFactureOutFromPurchaseReturnSchema = z.object({
  purchaseReturnId: z.string().uuid(),
});

export const GenerateFactureOutFromPaymentInSchema = z.object({
  paymentInId: z.string().uuid(),
  advanceVatRate: z.number().int().min(0).max(100).optional(),
});

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const FactureOutFilterSchema = z.object({
  state: FactureOutStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — FactureOut.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — FactureOut.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Отгрузка/Счёт» — FactureOut.demandId (back-link to the source Demand). */
  demandId: z.string().uuid().optional(),
  applicable: boolFromString.optional(),
  printed: boolFromString.optional(),
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
  currency: z.string().length(3).optional(),
  // SKIPPED filters (no backing Prisma column on FactureOut):
  //  - «Договор» (contractId) / «Проект» (projectId) / «Склад» (storeId) —
  //    factures carry no contract/project/store FK (unlike InvoiceOut).
  //  - «Дата добавления» (incomingDate) — outgoing factures have no
  //    supplier paper date column (that's a FactureIn-only field).
  //  - «Кто изменил» (updatedById) — only ownerId/groupId exist, no
  //    "last modified by" column to filter on.
  // Surfacing any of these would need a schema migration outside this task.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'vatSumMinor', 'agent', 'organization'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type FactureOutFilterInput = z.infer<typeof FactureOutFilterSchema>;
