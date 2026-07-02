import { z } from 'zod';

/**
 * ProcessingOrder (Заказ на переработку / Qayta ishlash buyurtmasi) —
 * production planning header. Expresses intent: "we want to make X units
 * of product Y using BOM/recipe Z".
 *
 * Planning-only document — it does NOT touch stock balances directly.
 * Actual material consumption + output happens via a separate Processing
 * operation document (out of scope; see TODO in service.transition()).
 *
 * Auto-numbering: PO-YYYY-NNNNN (per-account, per-year sequence).
 *
 * State machine:
 *   draft → posted   (applicable=true; signals "this production plan is committed")
 *   posted → draft   (unpost)
 *   draft|posted → cancelled
 */

export const ProcessingOrderStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type ProcessingOrderState = z.infer<typeof ProcessingOrderStateSchema>;

export const ProcessingOrderTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type ProcessingOrderTransition = z.infer<typeof ProcessingOrderTransitionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/** quantity stored as BigInt ×1000 microqty; user types whole units */
const microQtyBigint = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v.toString() : v))
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'Quantity must be a non-negative number')
  .transform((v) => {
    // Convert to ×1000 microqty BigInt string
    const n = Number(v);
    return BigInt(Math.round(n * 1_000));
  });

export const CreateProcessingOrderSchema = z.object({
  organizationId: z.string().uuid(),
  storeId: z.string().uuid(),
  // moysklad parity — Проект (production doc: no counterparty → no Договор).
  projectId: z.string().uuid().nullish(),
  processingPlanId: z.string().uuid().optional().nullable(),
  productionId: z.string().uuid().optional().nullable(),
  moment: z.string().optional(),
  deliveryPlannedMoment: z.string().optional().nullable(),
  /** Quantity of the finished good to produce. User types whole units; stored ×1000. */
  quantity: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v.toString() : v))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Quantity must be > 0')
    .default('1'),
  description: z.string().max(4096).optional().nullable(),
  externalCode: z.string().max(255).optional().nullable(),
  applicable: z.boolean().optional(),
});
export type CreateProcessingOrderInput = z.infer<typeof CreateProcessingOrderSchema>;

export const UpdateProcessingOrderSchema = z
  .object({
    organizationId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    projectId: z.string().uuid().nullish(),
    processingPlanId: z.string().uuid().optional().nullable(),
    productionId: z.string().uuid().optional().nullable(),
    moment: z.string().optional(),
    deliveryPlannedMoment: z.string().optional().nullable(),
    quantity: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === 'number' ? v.toString() : v))
      .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, 'Quantity must be > 0')
      .optional(),
    description: z.string().max(4096).optional().nullable(),
    externalCode: z.string().max(255).optional().nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdateProcessingOrderInput = z.infer<typeof UpdateProcessingOrderSchema>;

export const ProcessingOrderFilterSchema = z.object({
  state: ProcessingOrderStateSchema.optional(),
  organizationId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  /** «Тех. карта» — ProcessingOrder.processingPlanId (BOM FK). */
  processingPlanId: z.string().uuid().optional(),
  /** «Производство» — ProcessingOrder.productionId (production-specific FK). */
  productionId: z.string().uuid().optional(),
  /** «Проект» — ProcessingOrder.projectId. */
  projectId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — ProcessingOrder.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — ProcessingOrder.groupId. */
  groupId: z.string().uuid().optional(),
  /** «Проведено» — ProcessingOrder.applicable flag. */
  applicable: boolFromString.optional(),
  /** «Напечатано» — ProcessingOrder.printed flag. */
  printed: boolFromString.optional(),
  /** «Отправлено» — ProcessingOrder.published flag. */
  published: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  deliveryFrom: z.string().optional(),
  deliveryTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirror momentFrom/To). Mirrors InternalOrderFilterSchema.
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  // NOTE: «Кто изменил» (modifiedById) is SKIPPED — the ProcessingOrder
  // model has no `updatedById` column (only `ownerId` / `groupId`), so
  // there is no backed way to filter "last modified by". Surfacing it
  // would require a schema migration outside this panel-parity task.
  // ProcessingOrder also has NO agentId / contractId / agentAccountId /
  // organizationAccountId / salesChannelId — internal production doc
  // (no counterparty), so those filters are intentionally absent.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  // moysklad parity — relational sort for organization / store exposed by
  // the list-view column headers (handled by
  // ProcessingOrderService.buildListWhere's orderBy special-case).
  sortBy: z
    .enum([
      'moment',
      'name',
      'sumMinor',
      'deliveryPlannedMoment',
      'createdAt',
      'updatedAt',
      'organization',
      'store',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type ProcessingOrderFilter = z.infer<typeof ProcessingOrderFilterSchema>;

// Re-export for use in tests only — microQtyBigint is an internal helper
export { microQtyBigint };
