import { z } from 'zod';

/** Reports period — required range; metric selects the aggregate dimension. */
export const ReportPeriodSchema = z.object({
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  /** 'sales' = posted Demand sum; 'messages' = outbox sent count. */
  metric: z.enum(['sales', 'messages']).default('sales'),
});
export type ReportPeriodInput = z.infer<typeof ReportPeriodSchema>;
