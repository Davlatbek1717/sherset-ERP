import { z } from 'zod';

/**
 * Filter for the counterparty list. Mirrors the reference Alibobo
 * `partners?search&groupName&showDeleted&page&pageSize` query shape.
 */
const numFromString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)));
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CounterpartyListFilterSchema = z.object({
  search: z.string().max(100).optional(),
  groupName: z.string().max(255).optional(),
  showDeleted: boolFromString.optional(),
  page: numFromString.pipe(z.number().int().min(1)).default(1),
  pageSize: numFromString.pipe(z.number().int().min(1).max(200)).default(50),
});
export type CounterpartyListFilterInput = z.infer<typeof CounterpartyListFilterSchema>;

/**
 * Date window for the counterparty analysis. Defaults (applied in the service)
 * to the last 30 days. Purchased/sold quantities and money are restricted to
 * this window; "last purchase/sale" dates and current stock are all-time.
 */
export const AnalysisFilterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AnalysisFilterInput = z.infer<typeof AnalysisFilterSchema>;
