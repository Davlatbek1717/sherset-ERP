import { z } from 'zod';

const uuid = z.string().uuid();

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const StockBalanceFilterSchema = z.object({
  /** Restrict to one store; otherwise all stores accessible to the account. */
  storeId: uuid.optional(),
  /** Filter to a single product (debug / drill-down). */
  productId: uuid.optional(),
  /** Free-text search on product name / code (case-insensitive). */
  search: z.string().max(100).optional(),
  /**
   * 'product' (default) — physical inventory.
   * 'variant' — shows variant-level stock.
   * 'bundle' — bundles aren't stocked in the qty sense, but listing
   *            them lets the UI show "available bundles" computed
   *            from components in a follow-up.
   */
  assortmentKind: z.enum(['product', 'variant', 'bundle']).optional(),
  /** Hide rows where qty + reserved + inTransit are all zero. */
  hideEmpty: boolFromString.optional(),
  /** Group qty by product across all stores (else per-store rows). */
  groupBy: z.enum(['none', 'product']).default('none'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type StockBalanceFilterInput = z.infer<typeof StockBalanceFilterSchema>;
