import { z } from 'zod';

/**
 * OnlineOrder — incoming order from a SalesChannel.
 *
 * FSM states:
 *   pending → accepted (via accept())
 *   pending → rejected (via reject())
 *   accepted → converted (via convertToCustomerOrder() — V1 stub)
 *
 * V1 deferred:
 *   - Actual CustomerOrder + Demand creation (V2)
 *   - Webhook ingestion endpoint (V2 — requires signature validation + queue)
 *   - Stock reservation (V2)
 */

export const ONLINE_ORDER_STATES = ['pending', 'accepted', 'rejected', 'converted'] as const;
export type OnlineOrderState = (typeof ONLINE_ORDER_STATES)[number];

export const OnlineOrderStateSchema = z.enum(ONLINE_ORDER_STATES);

export const OnlineOrderFilterSchema = z.object({
  channelId: z.string().uuid().optional(),
  state: OnlineOrderStateSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['receivedAt', 'sumMinor']).default('receivedAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type OnlineOrderFilterInput = z.infer<typeof OnlineOrderFilterSchema>;

export const CreateOnlineOrderSchema = z.object({
  channelId: z.string().uuid(),
  externalOrderId: z.string().min(1).max(100),
  customerName: z.string().max(255).nullish(),
  customerPhone: z.string().max(20).nullish(),
  customerAddress: z.string().nullish(),
  sumMinor: z.coerce.bigint().nonnegative().default(0n),
  currency: z.string().length(3).default('UZS'),
  items: z.unknown().optional(),
  receivedAt: z.coerce.date().optional(),
});
export type CreateOnlineOrderInput = z.infer<typeof CreateOnlineOrderSchema>;

export const AcceptOnlineOrderSchema = z.object({
  // No additional fields required — just a state transition
});
export type AcceptOnlineOrderInput = z.infer<typeof AcceptOnlineOrderSchema>;

export const RejectOnlineOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RejectOnlineOrderInput = z.infer<typeof RejectOnlineOrderSchema>;

/**
 * Konvertatsiya — HAQIQIY CustomerOrder ga bog'lash.
 *
 * `customerOrderId` majburiy va shu ijarachida mavjud bo'lishi tekshiriladi.
 * Ilgari bu yerda tasodifiy UUID generatsiya qilinardi (V1 stub) — bazada
 * hech qayerga ishora qilmaydigan havola qolardi.
 */
export const ConvertOnlineOrderSchema = z.object({
  customerOrderId: z.string().uuid('customerOrderId — haqiqiy buyurtma id si bo‘lishi kerak'),
});
export type ConvertOnlineOrderInput = z.infer<typeof ConvertOnlineOrderSchema>;
