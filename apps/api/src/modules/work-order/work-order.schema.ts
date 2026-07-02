import { z } from 'zod';

/**
 * WorkOrder (Техническое задание / ТЗ) schemas.
 *
 * FSM: draft → in_progress → completed → (cancelled)
 *               draft|in_progress → cancelled
 *
 * V1: No stock cascades on transition.
 */

const uuid = z.string().uuid();

export const WorkOrderStateSchema = z.enum(['draft', 'in_progress', 'completed', 'cancelled']);
export type WorkOrderState = z.infer<typeof WorkOrderStateSchema>;

export const CreateWorkOrderSchema = z.object({
  name: z.string().max(50).optional(), // auto-generated if omitted
  bomId: uuid,
  storeId: uuid,
  plannedQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, 'plannedQty must be a positive decimal')),
  // moysklad «Дата документа» (processingorder.moment) — the editable document
  // date. ISO datetime; the DB column defaults to now() when omitted. Mirrors
  // InternalOrder/Production; uses the same .datetime() shape as this module's
  // planned dates (stricter than internal-order's bare z.string()).
  moment: z.string().datetime().optional(),
  plannedStartAt: z.string().datetime().nullable().optional(),
  plannedEndAt: z.string().datetime().nullable().optional(),
  description: z.string().optional(),
  ownerId: uuid.nullable().optional(),
});
export type CreateWorkOrderInput = z.infer<typeof CreateWorkOrderSchema>;

export const UpdateWorkOrderSchema = CreateWorkOrderSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateWorkOrderInput = z.infer<typeof UpdateWorkOrderSchema>;

export const WorkOrderFilterSchema = z.object({
  search: z.string().optional(),
  state: WorkOrderStateSchema.optional(),
  bomId: uuid.optional(),
  storeId: uuid.optional(),
  ownerId: uuid.optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  sortBy: z
    .enum(['name', 'createdAt', 'updatedAt', 'plannedStartAt', 'moment'])
    .default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type WorkOrderFilter = z.infer<typeof WorkOrderFilterSchema>;

export const TransitionWorkOrderSchema = z.object({
  state: WorkOrderStateSchema,
  producedQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, 'producedQty must be a positive decimal'))
    .optional(),
});
export type TransitionWorkOrderInput = z.infer<typeof TransitionWorkOrderSchema>;

export const BulkDeleteWorkOrderSchema = z.object({
  ids: z.array(uuid).min(1).max(250),
});
export type BulkDeleteWorkOrderInput = z.infer<typeof BulkDeleteWorkOrderSchema>;

/**
 * Bulk-transition payload. `completed` is intentionally excluded —
 * each WO needs its own producedQty (often different from plannedQty),
 * so completion stays a single-item flow that asks for the produced
 * amount per WO. Bulk only supports the no-arg transitions.
 */
export const BulkTransitionWorkOrderSchema = z.object({
  ids: z.array(uuid).min(1).max(100),
  state: z.enum(['draft', 'in_progress', 'cancelled']),
});
export type BulkTransitionWorkOrderInput = z.infer<typeof BulkTransitionWorkOrderSchema>;
