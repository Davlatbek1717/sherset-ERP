import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

const uuid = z.string().uuid();
const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/**
 * Production (Заказ на производство) — top-level production request.
 *
 * Mirrors moysklad's "Производство" document. High-level demand for
 * manufacturing output; it doesn't itself hold material details — those
 * live on ProcessingOrder children referencing this Production via
 * `productionId`.
 *
 * FSM:
 *   draft → posted    (manual; freezes header for execution)
 *   posted → draft    (manual unpost; only if no ProcessingOrders posted)
 *   draft|posted → cancelled
 *   draft → soft-deleted (deletedAt)
 *
 * Ties:
 *   • Optional CustomerOrder → make-to-order flow
 *   • Organization + Store (required)
 *   • Currency + rate snapshot at create time
 */
export const ProductionStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type ProductionState = z.infer<typeof ProductionStateSchema>;

export const ProductionTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type ProductionTransitionTarget = z.infer<typeof ProductionTransitionSchema>;

export const CreateProductionSchema = z.object({
  name: optionalEmpty(100),
  externalCode: optionalEmpty(50),
  organizationId: uuid,
  storeId: uuid,
  // moysklad «Склад материалов» / Проект (§85 — production.json parity).
  materialsStoreId: uuid.nullish(),
  projectId: uuid.nullish(),
  customerOrderId: uuid.nullish(),
  moment: z.string().datetime().optional(),
  deliveryPlannedMoment: z.string().datetime().nullish(),
  // moysklad «Дата начала/окончания производства» + «Резервировать
  // материалы» (§85).
  productionStart: z.string().datetime().nullish(),
  productionEnd: z.string().datetime().nullish(),
  reserve: z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(false),
  // §121 / round-5 — moysklad productiontask `awaiting` (Флаг ожидания
  // продукта). Update inherits via .partial().
  awaiting: z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(false),
  description: optionalEmpty(5000),
  vatEnabled: z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(true),
  vatIncluded: z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(false),
  currency: z.string().length(3).default('UZS'),
  /** Per-unit FX rate × 1e6, mirrors invoice convention. */
  rateValue: z.coerce.string().regex(/^\d+$/).default('100000000'),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type CreateProductionInput = z.infer<typeof CreateProductionSchema>;

export const UpdateProductionSchema = CreateProductionSchema.partial().extend({
  // Optimistic-lock token (lost-update guard): the version the edit form
  // loaded. REQUIRED on Update (absent on Create). The service runs the
  // header update as WHERE id+accountId+version, SET …, version+1 — a stale
  // copy matches zero rows → P2025 → 409 OPTIMISTIC_LOCK.
  version: z.number().int().nonnegative(),
});
export type UpdateProductionInput = z.infer<typeof UpdateProductionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const ProductionFilterSchema = z.object({
  state: ProductionStateSchema.optional(),
  organizationId: uuid.optional(),
  organizationIds: csvUuid.optional(),
  storeId: uuid.optional(),
  customerOrderId: uuid.optional(),
  ownerId: uuid.optional(),
  applicable: boolFromString.optional(),
  includeDeleted: boolFromString.optional(),
  search: z.string().max(200).optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().min(0).optional(),
  sumMinorTo: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(['moment', 'name', 'createdAt', 'sumMinor']).default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
});
export type ProductionFilterInput = z.infer<typeof ProductionFilterSchema>;
