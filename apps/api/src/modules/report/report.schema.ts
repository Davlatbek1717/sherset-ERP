import { z } from 'zod';

const uuid = z.string().uuid();

export const SalesGroupBy = z.enum([
  'none',
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'counterparty',
  'organization',
  'store',
  'product',
  'owner',
]);
export type SalesGroupByValue = z.infer<typeof SalesGroupBy>;

export const SalesReportFilterSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    groupBy: SalesGroupBy.default('month'),
    counterpartyId: uuid.optional(),
    organizationId: uuid.optional(),
    storeId: uuid.optional(),
    productId: uuid.optional(),
    /** Limit only applies when grouping (cap on rows). */
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  })
  .refine((f) => f.dateFrom <= f.dateTo, {
    message: 'dateFrom must be ≤ dateTo',
    path: ['dateFrom'],
  });
export type SalesReportFilterInput = z.infer<typeof SalesReportFilterSchema>;

/**
 * Product movement feed («История» widget on products/[id]) — purchases
 * (SupplyPosition) + sales (DemandPosition) for one product. Read-only.
 */
export const ProductMovementQuerySchema = z.object({
  productId: uuid,
  /** Cap on rows per list (purchases / sales each). */
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ProductMovementQueryInput = z.infer<typeof ProductMovementQuerySchema>;
