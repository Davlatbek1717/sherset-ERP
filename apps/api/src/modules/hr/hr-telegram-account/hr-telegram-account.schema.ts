import { z } from 'zod';

/**
 * MTProto account registration. apiId + apiHash are obtained from
 * https://my.telegram.org by the workspace admin — they're per-Telegram-account
 * credentials, NOT user identity. Stored encrypted; sessionEncrypted is set
 * later by the OTP login wizard (P4b2). slot ∈ {1, 2} for 2-slot failover.
 */
export const CreateHrTelegramAccountSchema = z.object({
  slot: z.union([z.literal(1), z.literal(2)]),
  phoneNumber: z
    .string()
    .min(9, 'Telefon raqami kamida 9 raqam')
    .max(20, 'Telefon raqami 20 belgidan oshmasin'),
  apiId: z.number().int().positive(),
  apiHash: z.string().min(20, 'API hash kamida 20 belgi').max(200),
});
export type CreateHrTelegramAccountInput = z.infer<typeof CreateHrTelegramAccountSchema>;

export const SetActiveHrTelegramAccountSchema = z.object({
  isActive: z.boolean(),
});
export type SetActiveHrTelegramAccountInput = z.infer<typeof SetActiveHrTelegramAccountSchema>;

/**
 * Soddalashtirilgan «faqat bitta telefon raqam» ulash (2026-07-17 talab).
 * apiId/apiHash — ILOVA kaliti (foydalanuvchiniki emas), serverda env'da
 * (TELEGRAM_API_ID / TELEGRAM_API_HASH); foydalanuvchi FAQAT telefonini
 * kiritadi. Har doim slot 1 (yagona raqam).
 */
export const ConnectHrTelegramSchema = z.object({
  phoneNumber: z
    .string()
    .min(9, 'Telefon raqami kamida 9 raqam')
    .max(20, 'Telefon raqami 20 belgidan oshmasin'),
  /** 1 = asosiy raqam, 2 = zaxira (flood-wait failover). Berilmasa — 1. */
  slot: z.union([z.literal(1), z.literal(2)]).default(1),
});
export type ConnectHrTelegramInput = z.infer<typeof ConnectHrTelegramSchema>;

/** Login wizard step 1: phone → server sends OTP. */
export const StartLoginSchema = z.object({
  accountId: z.string().uuid(),
});
export type StartLoginInput = z.infer<typeof StartLoginSchema>;

/** Login wizard step 2: OTP code (+ optional 2FA password). */
export const SubmitLoginCodeSchema = z.object({
  loginSessionId: z.string().min(1),
  code: z.string().min(1).max(20),
  password: z.string().max(200).optional(),
});
export type SubmitLoginCodeInput = z.infer<typeof SubmitLoginCodeSchema>;
