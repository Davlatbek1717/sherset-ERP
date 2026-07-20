import { z } from 'zod';

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/** Provider key — extensible for future UZ SMS aggregators. */
export const SmsProviderSchema = z.enum(['eskiz', 'playmobile', 'custom']);
export type SmsProvider = z.infer<typeof SmsProviderSchema>;

/** Eskiz/Playmobile expect E.164-ish: +998XXXXXXXXX. We accept either form. */
const phoneSchema = z
  .string()
  .min(10)
  .max(20)
  .regex(/^\+?[0-9]+$/, "Faqat raqamlar va '+' belgi");

export const SaveSmsConfigSchema = z.object({
  provider: SmsProviderSchema.default('eskiz'),
  email: z.string().email().max(255),
  password: z.string().max(500).optional(),
  senderId: optionalEmpty(20),
});
export type SaveSmsConfigInput = z.infer<typeof SaveSmsConfigSchema>;

export const SendSmsSchema = z.object({
  toPhone: phoneSchema,
  body: z.string().min(1).max(1600),
  entity: z.string().max(50).nullish(),
  entityId: z.string().uuid().nullish(),
});
export type SendSmsInput = z.infer<typeof SendSmsSchema>;

export const SmsLogStatusSchema = z.enum(['pending', 'sent', 'dead', 'failed']);
export type SmsLogStatus = z.infer<typeof SmsLogStatusSchema>;

/** Mijozga ko'rsatiladigan kompaniya aloqa ma'lumotlari (CompanySettings). */
export const SaveContactsSchema = z.object({
  phone: optionalEmpty(30),
  card: optionalEmpty(40),
  cardOwner: optionalEmpty(120),
});
export type SaveContactsInput = z.infer<typeof SaveContactsSchema>;

export const ListSmsLogsSchema = z.object({
  status: SmsLogStatusSchema.optional(),
  toPhone: z.string().optional(),
  entity: z.string().max(50).optional(),
  entityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListSmsLogsInput = z.infer<typeof ListSmsLogsSchema>;
