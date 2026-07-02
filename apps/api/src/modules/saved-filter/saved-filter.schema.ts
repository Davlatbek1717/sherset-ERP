import { z } from 'zod';

const ENTITY_REGEX = /^[a-z][a-z0-9-]{1,49}$/;

export const CreateSavedFilterSchema = z.object({
  entity: z.string().regex(ENTITY_REGEX),
  name: z.string().min(1).max(100),
  queryString: z.string().max(2000),
  position: z.number().int().min(0).max(1000).optional(),
});
export type CreateSavedFilterInput = z.infer<typeof CreateSavedFilterSchema>;

export const UpdateSavedFilterSchema = CreateSavedFilterSchema.partial();
export type UpdateSavedFilterInput = z.infer<typeof UpdateSavedFilterSchema>;

export const ListSavedFilterSchema = z.object({
  entity: z.string().regex(ENTITY_REGEX),
});
export type ListSavedFilterInput = z.infer<typeof ListSavedFilterSchema>;
