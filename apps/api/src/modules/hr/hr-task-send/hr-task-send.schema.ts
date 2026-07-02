import { z } from 'zod';

export const DispatchTemplateSchema = z.object({
  templateId: z.string().uuid(),
  /** Override assignee — used when admin manually re-dispatches to a different employee. */
  employeeId: z.string().uuid().optional(),
});
export type DispatchTemplateInput = z.infer<typeof DispatchTemplateSchema>;

export const AnswerTaskSchema = z
  .object({
    type: z.enum(['yes', 'no', 'text']),
    text: z.string().max(2000).optional().nullable(),
  })
  .refine((v) => (v.type === 'text' ? !!v.text && v.text.trim().length > 0 : true), {
    path: ['text'],
    message: "'text' javob uchun matn kiritilishi shart",
  });
export type AnswerTaskInput = z.infer<typeof AnswerTaskSchema>;

export const HR_TASK_LOG_STATUSES = [
  'sent',
  'pending_review',
  'answered_yes',
  'answered_no',
  'answered_text',
  'approved',
  'rejected',
  'failed',
] as const;
export type HrTaskLogStatus = (typeof HR_TASK_LOG_STATUSES)[number];

export const ListLogsFilterSchema = z.object({
  templateId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(HR_TASK_LOG_STATUSES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type ListLogsFilter = z.infer<typeof ListLogsFilterSchema>;
