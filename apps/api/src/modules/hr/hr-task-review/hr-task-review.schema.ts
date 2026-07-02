import { z } from 'zod';

export const ReviewActionSchema = z.object({
  comment: z.string().max(1000).optional().nullable(),
});
export type ReviewActionInput = z.infer<typeof ReviewActionSchema>;

export const RejectActionSchema = z.object({
  comment: z.string().min(1, 'Rad etish uchun izoh majburiy').max(1000),
});
export type RejectActionInput = z.infer<typeof RejectActionSchema>;

export const ReviewListFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type ReviewListFilter = z.infer<typeof ReviewListFilterSchema>;
