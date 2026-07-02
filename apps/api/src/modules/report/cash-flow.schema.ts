import { z } from 'zod';

const uuid = z.string().uuid();

export const CashFlowGroupBy = z.enum([
  'none',
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'counterparty',
  'organization',
  'channel',
]);
export type CashFlowGroupByValue = z.infer<typeof CashFlowGroupBy>;

export const CashFlowChannel = z.enum(['cash_in', 'cash_out', 'payment_in', 'payment_out']);
export type CashFlowChannelValue = z.infer<typeof CashFlowChannel>;

export const CashFlowFilterSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    groupBy: CashFlowGroupBy.default('month'),
    counterpartyId: uuid.optional(),
    organizationId: uuid.optional(),
    /** Restrict to a specific channel; if omitted, all 4 are aggregated. */
    channel: CashFlowChannel.optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .refine((f) => f.dateFrom <= f.dateTo, {
    message: 'dateFrom must be ≤ dateTo',
    path: ['dateFrom'],
  });
export type CashFlowFilterInput = z.infer<typeof CashFlowFilterSchema>;
