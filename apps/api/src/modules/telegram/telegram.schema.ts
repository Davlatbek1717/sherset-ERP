import { z } from 'zod';

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

export const SaveTelegramConfigSchema = z.object({
  botToken: z.string().min(20).max(500).optional(),
  webhookUrl: optionalEmpty(500),
  webhookSecret: optionalEmpty(255),
  defaultChatId: optionalEmpty(40),
});
export type SaveTelegramConfigInput = z.infer<typeof SaveTelegramConfigSchema>;

export const SendTelegramSchema = z.object({
  chatId: z.string().min(1).max(40),
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['HTML', 'MarkdownV2']).default('HTML'),
});
export type SendTelegramInput = z.infer<typeof SendTelegramSchema>;

export const TelegramOutboxStatusSchema = z.enum(['pending', 'sent', 'dead', 'failed']);

export const ListTelegramOutboxSchema = z.object({
  status: TelegramOutboxStatusSchema.optional(),
  chatId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListTelegramOutboxInput = z.infer<typeof ListTelegramOutboxSchema>;
