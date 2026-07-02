import { z } from 'zod';

export const CreateRegionSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().max(10).optional(),
  externalCode: z.string().max(50).optional(),
});
export type CreateRegionInput = z.infer<typeof CreateRegionSchema>;

// Optional free-text fields accept `null` on update so the edit form can
// CLEAR them (it sends `code.trim() || null`). The service's
// `if (x !== undefined) data.x = x` guard then writes null to the column.
export const UpdateRegionSchema = CreateRegionSchema.partial().extend({
  version: z.number().int().nonnegative(),
  code: z.string().max(10).nullable().optional(),
  externalCode: z.string().max(50).nullable().optional(),
});
export type UpdateRegionInput = z.infer<typeof UpdateRegionSchema>;

export const RegionFilterSchema = z.object({
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type RegionFilterInput = z.infer<typeof RegionFilterSchema>;
