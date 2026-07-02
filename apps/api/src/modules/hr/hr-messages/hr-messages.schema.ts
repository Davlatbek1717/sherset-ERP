import { z } from 'zod';

export const HR_MESSAGE_STATUSES = ['pending', 'retry', 'sent', 'failed'] as const;
export type HrMessageStatus = (typeof HR_MESSAGE_STATUSES)[number];

/**
 * Outbox list filter. All fields optional — admin tunes by status, date
 * window, counterparty, or full-text search across messageText + toPhone.
 * Pagination is cursor-less (page/limit) to match other HR list endpoints.
 */
export const ListHrMessagesFilterSchema = z.object({
  status: z.enum(HR_MESSAGE_STATUSES).optional(),
  counterpartyId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type ListHrMessagesFilter = z.infer<typeof ListHrMessagesFilterSchema>;

/** Used by the per-counterparty ChatPanel slide-over. */
export const ChatHistoryFilterSchema = z.object({
  counterpartyId: z.string().uuid(),
  limit: z.coerce.number().int().positive().max(200).default(40),
});
export type ChatHistoryFilter = z.infer<typeof ChatHistoryFilterSchema>;
