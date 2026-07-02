import { z } from 'zod';

const uuid = z.string().uuid();

const StageType = z.enum(['open', 'won', 'lost']);

export const StageInputSchema = z.object({
  id: uuid.optional(),
  name: z.string().min(1).max(100),
  type: StageType.default('open'),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 7-char hex like #3B82F6')
    .nullish()
    .or(z.literal('').transform(() => null)),
});
export type StageInput = z.infer<typeof StageInputSchema>;

export const CreatePipelineSchema = z.object({
  name: z.string().min(1).max(255),
  isDefault: z.coerce.boolean().default(false),
  stages: z.array(StageInputSchema).min(1).max(20),
});
export type CreatePipelineInput = z.infer<typeof CreatePipelineSchema>;

export const UpdatePipelineSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isDefault: z.coerce.boolean().optional(),
  stages: z.array(StageInputSchema).min(1).max(20).optional(),
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard. Absent on Create.
  version: z.number().int().nonnegative(),
});
export type UpdatePipelineInput = z.infer<typeof UpdatePipelineSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const PipelineFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type PipelineFilterInput = z.infer<typeof PipelineFilterSchema>;
