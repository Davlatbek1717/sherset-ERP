import { z } from 'zod';

/**
 * WebhookStock — separate subscription type for stock-movement events.
 * moysklad treats this as a distinct entity from regular Webhook because
 * the payload shape (per-product/per-store deltas) and rate limits differ.
 *
 * Triggered by: Demand.post · Supply.post · Move.post · Loss.post · Enter.post ·
 * Inventory.post · SalesReturn.post · PurchaseReturn.post — any operation
 * that moves stock counters.
 */
export const StockTypeSchema = z.enum(['STOCK', 'RESERVE', 'IN_TRANSIT']);
export type StockType = z.infer<typeof StockTypeSchema>;

export const ReportTypeSchema = z.enum(['BY_PRODUCT', 'BY_STORE', 'COMBINED']);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const CreateWebhookStockSchema = z.object({
  stockType: StockTypeSchema,
  reportType: ReportTypeSchema,
  reportUrl: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'URL must be http(s)://'),
  enabled: z.boolean().optional().default(true),
});
export type CreateWebhookStockInput = z.infer<typeof CreateWebhookStockSchema>;

export const UpdateWebhookStockSchema = CreateWebhookStockSchema.partial();
export type UpdateWebhookStockInput = z.infer<typeof UpdateWebhookStockSchema>;

export const WebhookStockFilterSchema = z.object({
  stockType: StockTypeSchema.optional(),
  enabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursor: z.string().uuid().optional(),
});
export type WebhookStockFilter = z.infer<typeof WebhookStockFilterSchema>;
