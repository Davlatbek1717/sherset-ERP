import { z } from 'zod';

const uuid = z.string().uuid();

export const CreateCashDeskSchema = z.object({
  name: z.string().min(1).max(255),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default('UZS'),
});
export type CreateCashDeskInput = z.infer<typeof CreateCashDeskSchema>;

export const UpdateCashDeskSchema = CreateCashDeskSchema.partial().extend({
  // Optimistic-lock token: the `version` the edit form loaded. Required on
  // every field-edit save so a stale copy can't silently overwrite a newer one.
  version: z.number().int().nonnegative(),
});
export type UpdateCashDeskInput = z.infer<typeof UpdateCashDeskSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CashDeskFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type CashDeskFilterInput = z.infer<typeof CashDeskFilterSchema>;
