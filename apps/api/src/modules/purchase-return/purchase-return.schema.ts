import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * PurchaseReturn (Возврат поставщику) — goods going back to supplier.
 *
 * FSM (Sprint 5.2):
 *   draft → posted (stock -, Supply/PO receivedSum revert)
 *   posted → draft (unpost)
 *   posted → cancelled
 *   draft → (soft-deleted)
 *
 * Outbound stock side mirror of Supply. Optional back-link to the original
 * Supply (traceability + return-qty cap). If Supply was linked to a PO, we
 * cascade to PO.applyReceipt(..., direction='revert').
 */

export const PurchaseReturnStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PurchaseReturnState = z.infer<typeof PurchaseReturnStateSchema>;

export const PurchaseReturnTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PurchaseReturnTransitionTarget = z.infer<typeof PurchaseReturnTransitionSchema>;

export const PurchaseReturnPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  supplyPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type PurchaseReturnPositionInput = z.infer<typeof PurchaseReturnPositionInputSchema>;

export const CreatePurchaseReturnSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  supplyId: z.string().uuid().nullish(),
  // moysklad parity — Договор / Проект (purchase docs have no sales channel).
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad parity (§13 live capture) — org/agent accounts + Внешний код.
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  reason: z.string().max(4000).nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  positions: z.array(PurchaseReturnPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreatePurchaseReturnInput = z.infer<typeof CreatePurchaseReturnSchema>;

export const UpdatePurchaseReturnSchema = CreatePurchaseReturnSchema.partial().extend({
  positions: z.array(PurchaseReturnPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdatePurchaseReturnInput = z.infer<typeof UpdatePurchaseReturnSchema>;

export const CreateFromSupplySchema = z.object({
  storeId: z.string().uuid().optional(),
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  reason: z.string().max(4000).nullish(),
});
export type CreateFromSupplyInput = z.infer<typeof CreateFromSupplySchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PurchaseReturnFilterSchema = z.object({
  state: PurchaseReturnStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Счёт контрагента» — PurchaseReturn.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — PurchaseReturn.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  /** «Склад» — PurchaseReturn.storeId (source warehouse). */
  storeId: z.string().uuid().optional(),
  /** «Приемка» — PurchaseReturn.supplyId (back-link to the original Supply). */
  supplyId: z.string().uuid().optional(),
  /** «Договор» — PurchaseReturn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Проект» — PurchaseReturn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-отдел» — PurchaseReturn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — PurchaseReturn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Проведено» — PurchaseReturn.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — PurchaseReturn.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — PurchaseReturn.published flag. */
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
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the PurchaseReturn model
  // has no `updatedById` column (only `ownerId` / `groupId`), so there is no
  // backed way to filter "last modified by". Surfacing it would require a
  // schema migration outside this panel-parity task.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['moment', 'name', 'sumMinor', 'agent', 'organization']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PurchaseReturnFilterInput = z.infer<typeof PurchaseReturnFilterSchema>;
