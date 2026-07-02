import { z } from 'zod';

const uuid = z.string().uuid();

export const PnlGroupBy = z.enum(['none', 'day', 'week', 'month', 'quarter', 'year']);
export type PnlGroupByValue = z.infer<typeof PnlGroupBy>;

export const PnlFilterSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    groupBy: PnlGroupBy.default('month'),
    /** Restrict to one of the account's organizations (multi-org tenants). */
    organizationId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .refine((f) => f.dateFrom <= f.dateTo, {
    message: 'dateFrom must be ≤ dateTo',
    path: ['dateFrom'],
  });
export type PnlFilterInput = z.infer<typeof PnlFilterSchema>;
