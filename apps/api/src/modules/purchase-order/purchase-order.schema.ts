import { z } from 'zod';
import { discountPercent } from '../shared/discount.js';

/**
 * PurchaseOrder (Заказ поставщику) — mirror of CustomerOrder but
 * supplier-facing. Sprint 4.1 manual FSM scope:
 *   draft → confirmed (applicable=true)
 *   confirmed → draft (unconfirm)
 *   draft|confirmed → cancelled
 *   draft → (soft-deleted)
 *
 * Future (deferred):
 *   - sent transition (email delivery to supplier)
 *   - partially_received / fully_received (auto via Supply link)
 *   - closed (fully_received + fully_invoiced + fully_paid)
 */

export const PurchaseOrderStateSchema = z.enum([
  'draft',
  'sent',
  'confirmed',
  'partially_received',
  'fully_received',
  'closed',
  'cancelled',
]);
export type PurchaseOrderState = z.infer<typeof PurchaseOrderStateSchema>;

export const PurchaseOrderTransitionSchema = z.enum(['confirm', 'unconfirm', 'cancel']);
export type PurchaseOrderTransitionTarget = z.infer<typeof PurchaseOrderTransitionSchema>;

export const PurchaseOrderPositionInputSchema = z.object({
  assortmentKind: z.enum(['product']).default('product'),
  assortmentId: z.string().uuid(),
  quantity: z.coerce.string().regex(/^\d+(\.\d{1,6})?$/, 'quantity must be a positive decimal'),
  priceMinor: z.coerce.string().regex(/^\d+$/, 'priceMinor must be a non-negative integer'),
  discount: discountPercent.optional(),
  vat: z.number().int().min(0).max(100).nullish(),
  vatEnabled: z.boolean().default(true),
});
export type PurchaseOrderPositionInput = z.infer<typeof PurchaseOrderPositionInputSchema>;

export const CreatePurchaseOrderSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity (§14 live capture) — Договор / Проект (purchase doc: no
  // sales channel) + org/agent accounts + Внешний код. Cols exist in DB.
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  organizationAccountId: z.string().uuid().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  externalCode: z.string().max(50).nullish(),
  moment: z.coerce.date().optional(),
  deliveryPlannedMoment: z.coerce.date().nullish(),
  description: z.string().max(4000).nullish(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // moysklad «Ожидание» — PO awaiting external action. Column exists
  // (`waiting` Boolean); was only set via bulk-action, but moysklad
  // exposes it as a create-form checkbox too (§46 live capture).
  waiting: z.boolean().default(false),
  positions: z.array(PurchaseOrderPositionInputSchema).min(1, 'at least one position required'),
  attributes: z.record(z.string(), z.unknown()).optional(),
  // «Владелец» (owner/access) — moysklad lets the clerk choose the owning employee
  // (ownerId), department (groupId) and «Общий доступ» (shared) on create. Without
  // these declared, Zod stripped the picks and the doc silently got owner=creator
  // (the same drop-on-create bug-class as rateValue). Tenant-validated in the service.
  ownerId: z.string().uuid().nullish(),
  groupId: z.string().uuid().nullish(),
  shared: z.boolean().optional(),
});
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial().extend({
  positions: z.array(PurchaseOrderPositionInputSchema).min(1).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * "Оплата" — derived state from payedSumMinor vs sumMinor:
 *   paid       → payedSumMinor >= sumMinor
 *   partlyPaid → 0 < payedSumMinor < sumMinor
 *   unpaid     → payedSumMinor === 0
 */
export const PaymentStateSchema = z.enum(['paid', 'partlyPaid', 'unpaid']);
export type PaymentState = z.infer<typeof PaymentStateSchema>;

/**
 * "Приемка" — derived state from receivedSumMinor vs sumMinor + (for
 * `overdue`) the deliveryPlannedMoment vs now:
 *   shipped           → receivedSumMinor >= sumMinor (fully received)
 *   partiallyshipped  → 0 < receivedSumMinor < sumMinor
 *   unshipped         → receivedSumMinor === 0
 *   overdue           → unshipped + deliveryPlannedMoment < now()
 */
export const ReceiveStateSchema = z.enum(['shipped', 'partiallyshipped', 'unshipped', 'overdue']);
export type ReceiveState = z.infer<typeof ReceiveStateSchema>;

/**
 * "Тип возврата" — derived from linked PurchaseReturn aggregate:
 *   noReturn → no PurchaseReturn rows linked to this PO's supplies
 *   mixed    → some returned, but less than fully
 *   return   → fully returned (sum of returns >= sum of PO)
 */
export const ReturnStateSchema = z.enum(['noReturn', 'mixed', 'return']);
export type ReturnState = z.infer<typeof ReturnStateSchema>;

const csvUuid = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().uuid()).min(1));

const csvState = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(PurchaseOrderStateSchema).min(1));

export const PurchaseOrderFilterSchema = z.object({
  /** Single-state filter. Kept for back-compat; for multi use `states`. */
  state: PurchaseOrderStateSchema.optional(),
  /** Multi-select state — moysklad-parity Status filter. */
  states: csvState.optional(),
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  agentGroupId: z.string().uuid().optional(),
  agentGroupIds: csvUuid.optional(),
  agentOwnerId: z.string().uuid().optional(),
  agentOwnerIds: csvUuid.optional(),
  agentAccountId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  organizationAccountId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  storeIds: csvUuid.optional(),
  ownerId: z.string().uuid().optional(),
  ownerIds: csvUuid.optional(),
  /** "Владелец-отдел" — PurchaseOrder.groupId multi-select. */
  groupId: z.string().uuid().optional(),
  groupIds: csvUuid.optional(),
  projectId: z.string().uuid().optional(),
  projectIds: csvUuid.optional(),
  contractId: z.string().uuid().optional(),
  contractIds: csvUuid.optional(),
  modifiedById: z.string().uuid().optional(),
  modifiedByIds: csvUuid.optional(),
  /** "Товар или группа" — JOIN to PurchaseOrderPosition.productId. */
  productId: z.string().uuid().optional(),
  productIds: csvUuid.optional(),
  applicable: boolFromString.optional(),
  printed: boolFromString.optional(),
  published: boolFromString.optional(),
  /** "Общий доступ" — PurchaseOrder.shared flag. */
  shared: boolFromString.optional(),
  /** Derived filters — see schema above. */
  paymentState: PaymentStateSchema.optional(),
  receiveState: ReceiveStateSchema.optional(),
  returnState: ReturnStateSchema.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /** "Дата приемки" period — filters on `deliveryPlannedMoment`. */
  deliveryFrom: z.string().optional(),
  deliveryTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  /**
   * "Когда изменен" — moysklad parity. Filters on `updatedAt` between
   * the two ISO dates. Paired with `modifiedById` for the «Кто изменил»
   * column.
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  /** Currency code (UZS / USD / RUB / EUR), exact match. */
  currency: z.string().length(3).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum([
      'moment',
      'name',
      'sumMinor',
      'payedSumMinor',
      'receivedSumMinor',
      'invoicedSumMinor',
      'waitSumMinor',
      'deliveryPlannedMoment',
      'createdAt',
      'updatedAt',
      // Relational + flag sorts — handled in service via per-key
      // orderBy construction (joined tables) instead of direct
      // `{ [sortBy]: dir }`.
      'agent',
      'organization',
      'currency',
      'state',
      'published',
      'printed',
      'description',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PurchaseOrderFilterInput = z.infer<typeof PurchaseOrderFilterSchema>;
