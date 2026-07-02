import { z } from 'zod';

/**
 * PriceType — named price list referenced by Product.salePrices entries.
 * One type per account is marked isDefault (the one applied when creating
 * Demand / InvoiceOut positions without an explicit override).
 */

export const CreatePriceTypeSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.string().length(3).default('UZS'),
  isDefault: z.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
  // moysklad «Внешний код» — universal external-system sync key (the
  // PriceType model already carries the column; Update inherits via .partial()).
  externalCode: z.string().max(50).nullish(),
});
export type CreatePriceTypeInput = z.infer<typeof CreatePriceTypeSchema>;

export const UpdatePriceTypeSchema = CreatePriceTypeSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdatePriceTypeInput = z.infer<typeof UpdatePriceTypeSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PriceTypeFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'position', 'createdAt']).default('position'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PriceTypeFilterInput = z.infer<typeof PriceTypeFilterSchema>;
