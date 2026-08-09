import { z } from 'zod';

export const WebhookActionSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);
export type WebhookAction = z.infer<typeof WebhookActionSchema>;

/** Whitelist of entity types that can have webhooks. Lowercase moysklad slugs. */
export const WebhookEntityTypeSchema = z.enum([
  // Documents (16 we currently support + room for future)
  'customerorder',
  'demand',
  'invoiceout',
  'salesreturn',
  'purchaseorder',
  'supply',
  'invoicein',
  'purchasereturn',
  'move',
  'loss',
  'enter',
  'inventory',
  'paymentin',
  'paymentout',
  'cashin',
  'cashout',
  'retailshift',
  'retaildemand',
  'retailsalesreturn',
  // Reference data
  'product',
  'variant',
  'bundle',
  'service',
  'productfolder',
  'counterparty',
  'contactperson',
  'organization',
  'store',
  'employee',
  'project',
  'contract',
  'cashdesk',
  'pricetype',
  'currency',
  'state',
  'task',
  'opportunity',
]);
export type WebhookEntityType = z.infer<typeof WebhookEntityTypeSchema>;

/** Diff payload mode: 'NONE' = no field list, 'FIELDS' = include updatedFields[] */
export const WebhookDiffTypeSchema = z.enum(['NONE', 'FIELDS']);

export const CreateWebhookSchema = z.object({
  entityType: WebhookEntityTypeSchema,
  action: z.array(WebhookActionSchema).min(1, 'At least one action required'),
  url: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'URL must be http(s)://'),
  secretHash: z.string().min(8).max(255).nullish(),
  diffType: WebhookDiffTypeSchema.optional().default('NONE'),
  enabled: z.boolean().optional().default(true),
  authContext: z.record(z.string(), z.unknown()).nullish(),
});
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = CreateWebhookSchema.partial();
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookSchema>;

export const WebhookFilterSchema = z.object({
  entityType: WebhookEntityTypeSchema.optional(),
  enabled: z.coerce.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  cursor: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'entityType']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type WebhookFilter = z.infer<typeof WebhookFilterSchema>;

/** Status values stored on WebhookDelivery rows.
 *  `sending` — Faza 28 claim holati: worker POST qilmoqda (ijara bilan). */
export const WebhookDeliveryStatusSchema = z.enum(['pending', 'sending', 'sent', 'dead']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

/** Filter for the per-webhook delivery history endpoint (admin UI). */
export const WebhookDeliveryFilterSchema = z.object({
  status: WebhookDeliveryStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
});
export type WebhookDeliveryFilter = z.infer<typeof WebhookDeliveryFilterSchema>;
