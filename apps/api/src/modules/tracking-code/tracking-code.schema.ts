import { z } from 'zod';

export const TrackingCodeTypeEnum = z.enum([
  'SHOES',
  'TOBACCO',
  'MEDICINES',
  'PERFUME',
  'TIRES',
  'DAIRY',
  'WATER',
  'BEER',
  // moysklad.uz marking regime (kept consistent with Product.TrackingTypeSchema):
  // «Бытовая техника» / «Алкогольная продукция». ADDITIVE — the module only stores
  // the type (no per-value switch), so new values are safe.
  'APPLIANCES',
  'ALCOHOL',
]);
export type TrackingCodeType = z.infer<typeof TrackingCodeTypeEnum>;

export const TrackingCodeStatusEnum = z.enum(['ACTIVE', 'RETIRED', 'TRANSFERRED']);
export type TrackingCodeStatus = z.infer<typeof TrackingCodeStatusEnum>;

export const CreateTrackingCodeSchema = z.object({
  cis: z.string().min(1).max(255),
  // .nullish() (not bare .optional()): the tracking-code edit form sends
  // `cis1162: cis1162.trim() || null` (page.tsx:67), so clearing the optional
  // «КИЗ (1162)» field sent null and a bare .optional() 400'd the save
  // ("Expected string, received null"). Column is String? (null-safe). Found by
  // the Phase-2 edit-save audit (2026-06-08); same class as counterparty/customer-order.
  cis1162: z.string().max(255).nullish(),
  type: TrackingCodeTypeEnum,
  status: TrackingCodeStatusEnum.default('ACTIVE'),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  trackingCodes: z.unknown().optional(),
});
export type CreateTrackingCodeInput = z.infer<typeof CreateTrackingCodeSchema>;

export const UpdateTrackingCodeSchema = CreateTrackingCodeSchema.partial().extend({
  version: z.number().int().nonnegative(),
});
export type UpdateTrackingCodeInput = z.infer<typeof UpdateTrackingCodeSchema>;

export const TrackingCodeFilterSchema = z.object({
  search: z.string().max(100).optional(),
  type: TrackingCodeTypeEnum.optional(),
  status: TrackingCodeStatusEnum.optional(),
  productId: z.string().uuid().optional(),
  sortBy: z.enum(['cis', 'type', 'status', 'createdAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  // Cursor pagination — mirrors the products list (product.schema.ts) so a CIS
  // list with >200 codes is fully reachable and `total` is a real COUNT, not
  // the (capped) returned-row length. Default page-size matches the FE LIMIT.
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TrackingCodeFilterInput = z.infer<typeof TrackingCodeFilterSchema>;
