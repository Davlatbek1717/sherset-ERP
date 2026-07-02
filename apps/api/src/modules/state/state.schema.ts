import { z } from 'zod';

const uuid = z.string().uuid();

/**
 * Per-account state definition — used by every FSM-backed entity to
 * surface tenant-defined labels + colours on top of the generic
 * "draft / confirmed / paid / …" enum slugs. Mirrors moysklad's
 * <Status> dropdown which lists the workflow states the admin has
 * created for a given entity type.
 *
 * Existing schema already has a `State` model with per-account
 * `entityType` + `name` + `color` columns; we just need a thin
 * REST surface on top of it.
 */

/** Allowed `state_type` values — matches the existing schema column. */
export const StateTypeSchema = z.enum(['Regular', 'Successful', 'Unsuccessful']);
export type StateType = z.infer<typeof StateTypeSchema>;

export const CreateStateSchema = z.object({
  entityType: z.string().min(1).max(40),
  name: z.string().min(1).max(255),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Hex bo'lishi kerak (#RRGGBB)")
    .optional(),
  stateType: StateTypeSchema.default('Regular'),
  position: z.coerce.number().int().nonnegative().default(0),
});

export const UpdateStateSchema = CreateStateSchema.partial();

export const StateFilterSchema = z.object({
  entityType: z.string().optional(),
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
});

export type CreateStateInput = z.infer<typeof CreateStateSchema>;
export type UpdateStateInput = z.infer<typeof UpdateStateSchema>;
export type StateFilter = z.infer<typeof StateFilterSchema>;
