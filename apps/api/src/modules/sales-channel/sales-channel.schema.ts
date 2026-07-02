import { z } from 'zod';

/**
 * SalesChannel — external storefront connector (V1 persistence layer only).
 *
 * Supported kinds:
 *   telegram | instagram | website | marketplace_uzum | marketplace_olcha | custom
 *
 * V1 deferred:
 *   - Real API sync (no fetch() to external services — V2 will add webhook + queue)
 *   - Cron-driven product push (V2)
 */

export const CHANNEL_KINDS = [
  'telegram',
  'instagram',
  'website',
  'marketplace_uzum',
  'marketplace_olcha',
  'custom',
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

const emptyToNull = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const CreateSalesChannelSchema = z.object({
  name: z.string().min(1).max(255),
  kind: z.enum(CHANNEL_KINDS),
  externalRef: emptyToNull.optional(),
  // moysklad «Внешний код» — universal sync key, distinct from the
  // channel's own externalRef. The model already carries the column.
  externalCode: emptyToNull.optional(),
  settings: z.record(z.unknown()).nullable().optional(),
});
export type CreateSalesChannelInput = z.infer<typeof CreateSalesChannelSchema>;

export const UpdateSalesChannelSchema = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().min(1).max(255).optional(),
  kind: z.enum(CHANNEL_KINDS).optional(),
  externalRef: emptyToNull.optional(),
  externalCode: emptyToNull.optional(),
  settings: z.record(z.unknown()).nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateSalesChannelInput = z.infer<typeof UpdateSalesChannelSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const SalesChannelFilterSchema = z.object({
  search: z.string().max(100).optional(),
  kind: z.enum(CHANNEL_KINDS).optional(),
  archived: boolFromString.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type SalesChannelFilterInput = z.infer<typeof SalesChannelFilterSchema>;
