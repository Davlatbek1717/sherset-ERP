import { z } from 'zod';

/** 5 doc types where MoySklad domain events drive a Telegram notification. */
export const HR_NOTIFICATION_DOC_TYPES = [
  'demand',
  'payment_in',
  'customer_order',
  'supply',
  'sales_return',
] as const;
export type HrNotificationDocType = (typeof HR_NOTIFICATION_DOC_TYPES)[number];

/** Event states inside a doc lifecycle that may trigger a notification. */
export const HR_NOTIFICATION_EVENT_TYPES = ['posted', 'created', 'updated', 'large_sale'] as const;
export type HrNotificationEventType = (typeof HR_NOTIFICATION_EVENT_TYPES)[number];

export const CreateHrNotificationTemplateSchema = z.object({
  docType: z.enum(HR_NOTIFICATION_DOC_TYPES),
  eventType: z.enum(HR_NOTIFICATION_EVENT_TYPES),
  templateText: z.string().min(1, "Shablon matni bo'sh bo'lmasligi kerak").max(4000),
  isActive: z.boolean().default(true),
  largeSaleMinThresholdMinor: z.union([z.string(), z.number(), z.bigint()]).optional().nullable(),
});
export type CreateHrNotificationTemplateInput = z.infer<typeof CreateHrNotificationTemplateSchema>;

export const UpdateHrNotificationTemplateSchema = CreateHrNotificationTemplateSchema.partial();
export type UpdateHrNotificationTemplateInput = z.infer<typeof UpdateHrNotificationTemplateSchema>;
