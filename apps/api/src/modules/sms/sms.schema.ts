import { z } from 'zod';

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

/**
 * Provider key.
 *   eskiz/playmobile — pullik UZ agregatorlar (Eskiz ulangan).
 *   phone_gateway    — foydalanuvchining O'Z SIM'i (Android «SMS Gateway» ilova,
 *                      bulut rejim) orqali BEPUL yuborish. `email`=login, `password`=parol.
 */
export const SmsProviderSchema = z.enum(['eskiz', 'playmobile', 'custom', 'phone_gateway']);
export type SmsProvider = z.infer<typeof SmsProviderSchema>;

/** Eskiz/Playmobile expect E.164-ish: +998XXXXXXXXX. We accept either form. */
const phoneSchema = z
  .string()
  .min(10)
  .max(20)
  .regex(/^\+?[0-9]+$/, "Faqat raqamlar va '+' belgi");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const SaveSmsConfigSchema = z
  .object({
    provider: SmsProviderSchema.default('eskiz'),
    // `email` maydoni: Eskiz uchun EMAIL, telefon-gateway uchun LOGIN (oddiy matn).
    email: z.string().min(1).max(255),
    password: z.string().max(500).optional(),
    senderId: optionalEmpty(20),
  })
  .superRefine((v, ctx) => {
    // Telefon-gateway'da login email bo'lishi shart emas; boshqa provayderlarda email.
    if (v.provider !== 'phone_gateway' && !EMAIL_RE.test(v.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: "Email formati noto'g'ri",
      });
    }
  });
export type SaveSmsConfigInput = z.infer<typeof SaveSmsConfigSchema>;

export const SendSmsSchema = z.object({
  toPhone: phoneSchema,
  body: z.string().min(1).max(1600),
  entity: z.string().max(50).nullish(),
  entityId: z.string().uuid().nullish(),
});
export type SendSmsInput = z.infer<typeof SendSmsSchema>;

/**
 * Umumiy SMS-tarqatma (qarzdan alohida): tanlangan kontragentlar + qo'lda
 * kiritilgan raqamlar, tayyor shablon bilan. Kamida bitta qabul qiluvchi shart.
 */
export const BroadcastSmsSchema = z
  .object({
    templateId: z.string().uuid(),
    counterpartyIds: z.array(z.string().uuid()).max(5000).default([]),
    phones: z.array(z.string().min(3).max(20)).max(5000).default([]),
  })
  .refine((v) => v.counterpartyIds.length + v.phones.length > 0, {
    message: "Hech bo'lmasa bitta qabul qiluvchi tanlang",
  });
export type BroadcastSmsInput = z.infer<typeof BroadcastSmsSchema>;

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
