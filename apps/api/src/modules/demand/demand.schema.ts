import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * Demand (Отгрузка) — outbound shipment document.
 *
 * FSM: draft → posted (applicable=true, stock deducted)
 *      posted → draft (unpost)
 *      posted → cancelled
 *      draft → (soft-deleted)
 *
 * Mirrors CustomerOrder shape; see workflows/demand.json.
 */

export const DemandStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type DemandState = z.infer<typeof DemandStateSchema>;

export const DemandTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type DemandTransitionTarget = z.infer<typeof DemandTransitionSchema>;

/**
 * «Накладные расходы» distribution method for Отгрузка (moysklad
 * «Распределить по»). Live-confirmed on the Отгрузка create form
 * (PARITY-AUDIT §42 [STREAM A]): default is «по цене» (PRICE).
 *
 * OUTBOUND semantics — UNLIKE Приёмка/Оприходование: the overhead is a
 * sale-side expense that lowers the shipment «Прибыль» (folded into
 * Demand.costSumMinor / себестоимость aggregate). It does NOT touch the
 * FIFO basis, SupplyPosition lots, or Stock — "FIFO-basis EMAS".
 */
export const DemandOverheadDistributionSchema = z.enum(['WEIGHT', 'PRICE', 'VOLUME', 'QUANTITY']);
export type DemandOverheadDistribution = z.infer<typeof DemandOverheadDistributionSchema>;

// --- Position ---

export const DemandPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  // back-link to CustomerOrderPosition when demand derives from CO
  customerOrderPositionId: z.string().uuid().nullish(),
  quantity: z.coerce
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal')
    .refine((v) => Number(v) > 0, 'quantity must be greater than 0'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type DemandPositionInput = z.infer<typeof DemandPositionInputSchema>;

// --- Create ---

export const CreateDemandSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  customerOrderId: z.string().uuid().nullish(),
  // moysklad parity — Канал продаж / Договор / Проект (optional FK refs).
  salesChannelId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  // moysklad «Счёт организации» / «Счёт контрагента» — bank-account FK refs.
  // The columns exist on the model; the /new form already sends
  // organizationAccountId — but it was absent from the write schema, so Zod
  // stripped it and the chosen account was silently dropped on create/update.
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  // «План. дата отгрузки» — planned shipment date (was sent by /new but had
  // no column/schema field → silently discarded).
  deliveryPlannedMoment: z.coerce.date().nullish(),
  // «План. дата оплаты» — planned payment date (DOM-grounded; mirrors InvoiceOut).
  paymentPlannedMoment: z.coerce.date().nullish(),
  // Адрес доставки — denormalised shipment address (max 500 like the column).
  shipmentAddress: z.string().max(500).nullish(),
  // moysklad «Другие поля» — shipping / logistics block (all optional).
  consignorId: z.string().uuid().nullish(),
  consigneeId: z.string().uuid().nullish(),
  carrierId: z.string().uuid().nullish(),
  cargoName: z.string().max(255).nullish(),
  shipperInstructions: z.string().max(4000).nullish(),
  transportFacility: z.string().max(255).nullish(),
  carNumber: z.string().max(50).nullish(),
  placesCount: z.coerce.number().int().nonnegative().nullish(),
  shippingDocNo: z.string().max(100).nullish(),
  shippingDocDate: z.coerce.date().nullish(),
  stateContractId: z.string().max(100).nullish(),
  // moysklad «Внешний код» — universal external-system sync key (the
  // Demand model already carries the column; UpdateDemandSchema inherits
  // this via .partial()).
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  // moysklad «Накладные расходы» (Отгрузка) — sale-side expense that
  // lowers «Прибыль» (folded into costSumMinor at post). Live-confirmed
  // (§42 [STREAM A]); model already carries the columns (no migration).
  // Default distribution «по цене» = PRICE per the live Отгрузка form.
  overheadSumMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'overheadSumMinor must be a non-negative integer')
    .default('0'),
  overheadDistribution: DemandOverheadDistributionSchema.default('PRICE'),
  overheadCurrency: z.string().length(3).default('UZS'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  positions: z.array(DemandPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDemandInput = z.infer<typeof CreateDemandSchema>;

// --- Update (draft only) ---

export const UpdateDemandSchema = CreateDemandSchema.partial().extend({
  positions: z.array(DemandPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateDemandInput = z.infer<typeof UpdateDemandSchema>;

// --- Create from CustomerOrder (shortcut) ---

export const CreateFromCustomerOrderSchema = z.object({
  storeId: z.string().uuid().optional(), // defaults to CO.storeId
  // Optional per-position quantity override (partial shipment). Key: CO position id.
  quantities: z.record(z.string().uuid(), z.coerce.string().regex(/^\d+(\.\d{1,6})?$/)).optional(),
});
export type CreateFromCustomerOrderInput = z.infer<typeof CreateFromCustomerOrderSchema>;

// --- List filter ---

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const DemandFilterSchema = z.object({
  state: DemandStateSchema.optional(),
  agentId: z.string().uuid().optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Счёт контрагента» — Demand.agentAccountId. */
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  /** «Счёт организации» — Demand.organizationAccountId. */
  organizationAccountId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  customerOrderId: z.string().uuid().optional(),
  /** «Проект» — Demand.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Договор» — Demand.contractId. */
  contractId: z.string().uuid().optional(),
  /** «Канал продаж» — Demand.salesChannelId. */
  salesChannelId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Demand.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Demand.ownerId. */
  ownerId: z.string().uuid().optional(),
  /**
   * «Оплата» — payment progress computed against payedSumMinor / sumMinor
   * via Prisma 5 field references (no stored boolean). Demand carries the
   * `payedSumMinor` column, populated by the PaymentIn cascade.
   */
  paymentStatus: z.enum(['unpaid', 'partial', 'paid']).optional(),
  /** «Проведено» — Demand.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — Demand.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — Demand.published flag. */
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
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the Demand model has
  // no `updatedById` column (only `ownerId`). Add such a column before
  // wiring this filter (mirrors the deferred customer-order field).
  // NOTE: «Резерв» / «Отгрузка» (shipped progress) are NOT applicable to a
  // shipment doc — a Demand IS the shipment, so there is no shipped-vs-
  // ordered split (those belong to CustomerOrder). Skipped by design.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'payedSumMinor', 'agent', 'organization', 'store'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type DemandFilterInput = z.infer<typeof DemandFilterSchema>;
