import { z } from 'zod';

export const UpsertSmsTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(1600),
  enabled: z.boolean().default(true),
});
export type UpsertSmsTemplateInput = z.infer<typeof UpsertSmsTemplateSchema>;

/** Kod ulaydigan shablon kalitlari (hozircha bittasi). */
export const SMS_TEMPLATE_KEYS = ['debt_reminder'] as const;
export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number];
export const SmsTemplateKeySchema = z.enum(SMS_TEMPLATE_KEYS);
