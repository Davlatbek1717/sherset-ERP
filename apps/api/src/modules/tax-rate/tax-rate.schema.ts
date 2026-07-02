import { z } from 'zod';

export const CreateTaxRateSchema = z.object({
  rate: z.coerce.number().min(0).max(100),
  comment: z.string().max(255).optional(),
  shared: z.boolean().default(true),
});
export type CreateTaxRateInput = z.infer<typeof CreateTaxRateSchema>;

// `comment` accepts `null` on update so the edit form can CLEAR it (it
// sends `comment.trim() || null`). The service's `if (x !== undefined)
// data.x = x` guard then writes null to the column.
// `version` is REQUIRED on update for optimistic-lock concurrency control.
export const UpdateTaxRateSchema = CreateTaxRateSchema.partial().extend({
  comment: z.string().max(255).nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateTaxRateInput = z.infer<typeof UpdateTaxRateSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const TaxRateFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['rate', 'createdAt']).default('rate'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type TaxRateFilterInput = z.infer<typeof TaxRateFilterSchema>;
