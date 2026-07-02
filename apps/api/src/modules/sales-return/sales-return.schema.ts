import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * SalesReturn (Возврат покупателя) — goods coming back from a customer.
 *
 * FSM (Sprint 5.1):
 *   draft → posted (stock +, Demand/CO shippedSum revert)
 *   posted → draft (unpost)
 *   posted → cancelled (same side-effects as unpost + state)
 *   draft → (soft-deleted)
 *
 * Inbound stock side mirror of Demand. Optional back-links to the original
 * Demand (traceability + return-qty cap) and its CustomerOrder (so the CO
 * aggregate can roll back).
 */

export const SalesReturnStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type SalesReturnState = z.infer<typeof SalesReturnStateSchema>;

export const SalesReturnTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type SalesReturnTransitionTarget = z.infer<typeof SalesReturnTransitionSchema>;

export const SalesReturnPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  // Back-link to the original Demand position (preferred for traceability).
  demandPositionId: z.string().uuid().nullish(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
  // moysklad «Себестоимость ГТД» / «Страна» — customs block on inbound
  // return positions (live-confirmed on Возврат покупателя, §45; mirrors
  // §41 Supply). gtdSumMinor = tiyin. РНПТ/Маркировка NOT here.
  gtdNumber: z.string().max(255).nullish(),
  gtdSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'gtdSumMinor must be a non-negative integer')
    .nullish(),
  countryId: z.string().uuid().nullish(),
});
export type SalesReturnPositionInput = z.infer<typeof SalesReturnPositionInputSchema>;

export const CreateSalesReturnSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  demandId: z.string().uuid().nullish(),
  customerOrderId: z.string().uuid().nullish(),
  // moysklad parity — Канал продаж / Договор / Проект (optional FK refs).
  salesChannelId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad parity (§10 live capture) — org/agent accounts + Внешний код.
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
  positions: z.array(SalesReturnPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateSalesReturnInput = z.infer<typeof CreateSalesReturnSchema>;

export const UpdateSalesReturnSchema = CreateSalesReturnSchema.partial().extend({
  positions: z.array(SalesReturnPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateSalesReturnInput = z.infer<typeof UpdateSalesReturnSchema>;

/**
 * Create-from-Demand helper. Per-position quantity default = full Demand
 * position quantity (common case: "full return"). Override per line via
 * `quantities[positionId]`. Each SR position back-links via demandPositionId.
 */
export const CreateFromDemandSchema = z.object({
  storeId: z.string().uuid().optional(), // defaults to Demand.storeId
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
  reason: z.string().max(4000).nullish(),
});
export type CreateFromDemandInput = z.infer<typeof CreateFromDemandSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * SalesReturn list filter — moysklad «Возвраты покупателей» parity (~17
 * fields). Mirrors the invoice-out / demand / customer-order gold standard.
 * Reference field order (visual-captures/03-module/salesreturn): Период ·
 * Контрагент · Группа контрагента · Договор · Организация · Склад · Проект ·
 * Статус · Отгрузка · Заказ покупателя · Проведено · Напечатано · Отправлено ·
 * Канал продаж · Владелец-сотрудник · Владелец-отдел · Сумма · Когда изменен.
 */
export const SalesReturnFilterSchema = z.object({
  /** «Статус» — FSM state. */
  state: SalesReturnStateSchema.optional(),
  /** «Контрагент» — SalesReturn.agentId. */
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Счёт контрагента» — SalesReturn.agentAccountId (backend-only, no own list field). */
  agentAccountId: z.string().uuid().optional(),
  /** «Организация» — SalesReturn.organizationId. */
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — SalesReturn.organizationAccountId (backend-only). */
  organizationAccountId: z.string().uuid().optional(),
  /** «Склад» — SalesReturn.storeId (receiving warehouse). */
  storeId: z.string().uuid().optional(),
  /** «Отгрузка» — back-link to the original Demand (SalesReturn.demandId). */
  demandId: z.string().uuid().optional(),
  /** «Заказ покупателя» — SalesReturn.customerOrderId. */
  customerOrderId: z.string().uuid().optional(),
  /** «Проект» — SalesReturn.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Договор» — SalesReturn.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Канал продаж» — SalesReturn.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — SalesReturn.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — SalesReturn.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Проведено» — SalesReturn.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — SalesReturn.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — SalesReturn.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  /** «Период» — SalesReturn.moment range. */
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  /** «Сумма» — SalesReturn.sumMinor range (tiyin). */
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the SalesReturn model
  // has no `updatedById` column (only `ownerId`). Add such a column before
  // wiring this filter (mirrors the deferred invoice-out / demand field).
  // NOTE: «Оплата» (paymentStatus) is SKIPPED — although SalesReturn carries
  // a `payedSumMinor` column, the moysklad «Возвраты покупателей» list filter
  // has no «Оплата» field (returns track refund cascades, not a billed sum),
  // so we stay 1:1 with the reference field set.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'agent', 'organization', 'store'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type SalesReturnFilterInput = z.infer<typeof SalesReturnFilterSchema>;
