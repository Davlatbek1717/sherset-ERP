import { z } from 'zod';

// Parent (CustomEntity)
export const CreateCustomEntitySchema = z.object({
  name: z.string().min(1).max(255),
});
export type CreateCustomEntityInput = z.infer<typeof CreateCustomEntitySchema>;

export const UpdateCustomEntitySchema = CreateCustomEntitySchema.partial().extend({
  // Optimistic-lock token: the `version` the edit form loaded. Required on
  // every field-edit save so a stale copy can't silently overwrite a newer one.
  version: z.number().int().nonnegative(),
});
export type UpdateCustomEntityInput = z.infer<typeof UpdateCustomEntitySchema>;

export const CustomEntityFilterSchema = z.object({
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type CustomEntityFilterInput = z.infer<typeof CustomEntityFilterSchema>;

// Child (CustomEntityValue)
export const CreateCustomEntityValueSchema = z.object({
  name: z.string().min(1).max(255),
  position: z.coerce.number().int().min(0).default(0),
});
export type CreateCustomEntityValueInput = z.infer<typeof CreateCustomEntityValueSchema>;

export const UpdateCustomEntityValueSchema = CreateCustomEntityValueSchema.partial();
export type UpdateCustomEntityValueInput = z.infer<typeof UpdateCustomEntityValueSchema>;
