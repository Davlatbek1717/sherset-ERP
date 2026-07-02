import { z } from 'zod';

/**
 * Create an Analitika order ("Buyurtma shakllantirish"). Lines reference
 * existing products; quantities are positive. The counterparty is optional
 * (product-cart flow has none). Prices/sums are snapshotted server-side.
 */
export const CreateOrderSchema = z.object({
  counterpartyId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().positive(),
      }),
    )
    .min(1),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const ORDER_STATES = ['draft', 'formed', 'done'] as const;

export const OrderFilterSchema = z.object({
  search: z.string().max(100).optional(),
  state: z.enum(ORDER_STATES).optional(),
});
export type OrderFilterInput = z.infer<typeof OrderFilterSchema>;
