import { z } from 'zod';

// 3-6-or-8 hex chars after '#' — accepts '#16A34A' and '#16A34AFF'.
const HEX_COLOUR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const CreateTaskTypeSchema = z.object({
  name: z.string().trim().min(1).max(255),
  color: z.string().regex(HEX_COLOUR).max(9).nullish(),
  position: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type CreateTaskTypeInput = z.infer<typeof CreateTaskTypeSchema>;

export const UpdateTaskTypeSchema = CreateTaskTypeSchema.partial();
export type UpdateTaskTypeInput = z.infer<typeof UpdateTaskTypeSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const TaskTypeFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['position', 'name', 'createdAt']).default('position'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type TaskTypeFilterInput = z.infer<typeof TaskTypeFilterSchema>;
