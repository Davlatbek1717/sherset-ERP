import { z } from 'zod';

/**
 * BOM (Bill of Materials / Техкарта) schemas.
 *
 * V1 constraints (see schema.prisma):
 *   - One BOM per output product per account.
 *   - Direct components only — no recursive expansion.
 *   - Single output product.
 */

const uuid = z.string().uuid();

// ---- Component input -------------------------------------------------------

export const BomComponentInputSchema = z.object({
  productId: uuid,
  qty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, 'qty must be a positive decimal'))
    .refine((v) => Number(v) > 0, 'qty must be > 0'),
  position: z.coerce.number().int().min(0).default(0),
});
export type BomComponentInput = z.infer<typeof BomComponentInputSchema>;

export const SetBomComponentsSchema = z.object({
  components: z.array(BomComponentInputSchema).min(1, 'Kamida bitta komponent kerak'),
});
export type SetBomComponentsInput = z.infer<typeof SetBomComponentsSchema>;

// ---- Create / Update -------------------------------------------------------

export const CreateBomSchema = z.object({
  name: z.string().min(1).max(255),
  productId: uuid,
  outputQty: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d{1,6})?$/, 'outputQty must be a positive decimal'))
    .refine((v) => Number(v) > 0, 'outputQty must be > 0')
    .default('1'),
  // .nullish() (not .optional()): the edit form sends null to clear these
  // optional fields; the service writes null on null and skips undefined.
  description: z.string().nullish(),
  // moysklad «Внешний код» — universal sync key (processingplan carries
  // it; column added in migration 20260518065817). Update inherits via
  // .partial().
  externalCode: z.string().max(50).nullish(),
  components: z.array(BomComponentInputSchema).default([]),
});
export type CreateBomInput = z.infer<typeof CreateBomSchema>;

export const UpdateBomSchema = CreateBomSchema.partial().extend({
  // Optimistic-lock token — REQUIRED on update, absent on create. The edit form
  // echoes the `version` it loaded; the service runs the update with that as a
  // WHERE filter + increments it, so a concurrent edit loses the race (409).
  version: z.number().int().nonnegative(),
});
export type UpdateBomInput = z.infer<typeof UpdateBomSchema>;

// ---- Filter ----------------------------------------------------------------

export const BomFilterSchema = z.object({
  search: z.string().optional(),
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(25),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type BomFilter = z.infer<typeof BomFilterSchema>;
