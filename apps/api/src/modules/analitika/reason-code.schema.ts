import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CreateReasonCodeSchema = z.object({
  label: z.string().min(1).max(100),
  active: z.boolean().default(true),
});
export type CreateReasonCodeInput = z.infer<typeof CreateReasonCodeSchema>;

export const UpdateReasonCodeSchema = CreateReasonCodeSchema.partial();
export type UpdateReasonCodeInput = z.infer<typeof UpdateReasonCodeSchema>;

export const ReasonCodeFilterSchema = z.object({
  activeOnly: boolFromString.optional(),
});
export type ReasonCodeFilterInput = z.infer<typeof ReasonCodeFilterSchema>;
