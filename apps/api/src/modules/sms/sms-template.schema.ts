import { z } from 'zod';

export const CHANNELS = ['sms', 'telegram'] as const;
export type TemplateChannel = (typeof CHANNELS)[number];
export const TemplateChannelSchema = z.enum(CHANNELS);

export const CreateMessageTemplateSchema = z.object({
  channel: TemplateChannelSchema,
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(4096),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export type CreateMessageTemplateInput = z.infer<typeof CreateMessageTemplateSchema>;

/** Tahrirda kanal o'zgarmaydi (channel omit); barcha maydonlar ixtiyoriy. */
export const UpdateMessageTemplateSchema = CreateMessageTemplateSchema.omit({ channel: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Hech bo'lmasa bitta maydon kerak" });
export type UpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateSchema>;
