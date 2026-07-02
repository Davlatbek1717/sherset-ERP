import { z } from 'zod';

/**
 * Filter for the items list. Mirrors the Alibobo reference
 * (`use-items.ts`) query shape:
 * `groupId/search/sort/order/lowStock/noPartner/onlyInCart/inCartIds/
 * salesFrom/salesTo/page/pageSize`. All booleans accept "true"/"1" strings
 * (query params), numeric fields accept stringified ints, list fields accept
 * comma-separated UUID strings.
 */
const numFromString = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v : Number.parseInt(v, 10)));

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1' || v === 'yes'));

const uuidListFromString = z
  .union([z.array(z.string().uuid()), z.string()])
  .transform((v) =>
    Array.isArray(v)
      ? v
      : v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
  )
  .pipe(z.array(z.string().uuid()));

export const ITEMS_SORT_FIELDS = ['name', 'code', 'stock', 'soldQty', 'sellPrice'] as const;
export type ItemsSortField = (typeof ITEMS_SORT_FIELDS)[number];

export const ITEMS_SORT_ORDERS = ['asc', 'desc'] as const;
export type ItemsSortOrder = (typeof ITEMS_SORT_ORDERS)[number];

export const ItemsFilterSchema = z.object({
  groupId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(ITEMS_SORT_FIELDS).default('name'),
  order: z.enum(ITEMS_SORT_ORDERS).default('asc'),
  lowStock: boolFromString.optional(),
  noPartner: boolFromString.optional(),
  onlyInCart: boolFromString.optional(),
  inCartIds: uuidListFromString.optional(),
  /** Sotilgan ustuni uchun sana oralig'i (ISO datetime). */
  salesFrom: z.string().datetime().optional(),
  salesTo: z.string().datetime().optional(),
  page: numFromString.pipe(z.number().int().min(1)).default(1),
  pageSize: numFromString.pipe(z.number().int().min(1).max(200)).default(50),
});
export type ItemsFilterInput = z.infer<typeof ItemsFilterSchema>;

/** Stats endpoint shares the row filter so the KPI counts match the table. */
export const ItemsStatsFilterSchema = z.object({
  groupId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  onlyInCart: boolFromString.optional(),
  inCartIds: uuidListFromString.optional(),
});
export type ItemsStatsFilterInput = z.infer<typeof ItemsStatsFilterSchema>;

/**
 * Low-stock threshold (Product is "low" when current Stock.qty falls below).
 * Constant for now — moysklad's Product model has no per-product minStock
 * field; configurable threshold can come later (P-IT follow-up).
 */
export const LOW_STOCK_THRESHOLD = 10;
