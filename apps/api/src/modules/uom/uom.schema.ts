import { z } from 'zod';

export const CreateUomSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().max(50).optional(),
  externalCode: z.string().max(50).optional(),
  description: z.string().optional(),
  shared: z.boolean().default(true),
});
export type CreateUomInput = z.infer<typeof CreateUomSchema>;

// Optional free-text fields accept `null` on update so the edit form can
// CLEAR them (it sends `code.trim() || null`). The service's
// `if (x !== undefined) data.x = x` guard then writes null to the column.
export const UpdateUomSchema = CreateUomSchema.partial().extend({
  version: z.number().int().nonnegative(),
  code: z.string().max(50).nullable().optional(),
  externalCode: z.string().max(50).nullable().optional(),
  description: z.string().nullable().optional(),
});
export type UpdateUomInput = z.infer<typeof UpdateUomSchema>;

export const UomFilterSchema = z.object({
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'code', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type UomFilterInput = z.infer<typeof UomFilterSchema>;
