import { z } from 'zod';

const uuid = z.string().uuid();

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * «Обороты» (turnover / stock-movement) report filter. Mirrors the moysklad
 * Склад → Обороты report: a date period plus optional store / search.
 *
 * Dates are date-only ("YYYY-MM-DD") coerced to UTC midnight; the service
 * converts them to Asia/Tashkent calendar-day bounds via reportDateBounds.
 * Both default in the service when absent (current month → today).
 */
export const TurnoverFilterSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  /** Restrict to one store; otherwise all stores in the account. */
  storeId: uuid.optional(),
  /** Free-text search on product name / code / article (case-insensitive). */
  search: z.string().max(100).optional(),
  assortmentKind: z.enum(['product', 'variant', 'bundle']).optional(),
  /** Hide rows with no opening balance and no movement in the period. */
  hideEmpty: boolFromString.optional().default(true),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type TurnoverFilterInput = z.infer<typeof TurnoverFilterSchema>;
