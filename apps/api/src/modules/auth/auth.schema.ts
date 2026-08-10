import { z } from 'zod';

const HR_ACCESS_LEVEL = z.enum(['full', 'read', 'own_only']);
type HrAccessLevel = z.infer<typeof HR_ACCESS_LEVEL>;

/**
 * Login accepts EITHER email or username. Backwards compat: clients can
 * still pass `email` directly. New HR clients can pass `username`. Either
 * way the resolved identifier reaches the service.
 */
export const LoginSchema = z
  .object({
    email: z.string().max(255).optional(),
    username: z.string().max(50).optional(),
    identifier: z.string().max(255).optional(),
    password: z.string().min(1, 'Parol kiritilishi shart').max(200),
  })
  .transform((data, ctx) => {
    const id = data.identifier ?? data.email ?? data.username;
    if (!id || id.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identifier'],
        message: 'Email yoki username kiritilishi shart',
      });
      return z.NEVER;
    }
    return { identifier: id.trim(), password: data.password };
  });

export type LoginInput = { identifier: string; password: string };

/** Change-password request: user provides current + new password. */
export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Eski parol kiritilishi shart'),
  newPassword: z.string().min(8, "Yangi parol kamida 8 belgidan iborat bo'lishi kerak"),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/**
 * Self-update request for /auth/me. Only two safe-to-self-edit fields —
 * fullName + phone. Everything else (email, username, position, roles,
 * archived) requires admin permission and goes through /analitika/staff.
 */
const phonePattern = /^\+?\d{9,15}$/;
const emptyToUndef = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

export const UpdateMeSchema = z.object({
  fullName: emptyToUndef.pipe(z.string().max(310).optional()),
  phone: emptyToUndef.pipe(
    z
      .string()
      .refine((v) => phonePattern.test(v), 'Telefon formati notoʼgʼri')
      .optional(),
  ),
});
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

export interface AuthenticatedUser {
  sub: string; // employee id
  accountId: string;
  email: string;
  name: string;
  username: string | null;
  hrRoles: string[];
  isChecker: boolean;
  /**
   * Interfeys rejimi (kassa TZ §3.1). `kiosk` — faqat POS; `KioskGuard`
   * server tomonda ham cheklaydi. ERP rollaridan hisoblanadi
   * (`kiosk-policy.resolveUiMode`): bitta rol `full` bo'lsa — `full`.
   *
   * Ixtiyoriy: eski tokenlarda bu da'vo yo'q va u holda `full` deb
   * qaraladi — refresh'gacha hech kim cheklanib qolmaydi.
   */
  uiMode?: 'full' | 'kiosk';
  hrPermissions: Array<{
    pageKey: string;
    section: string | null;
    accessLevel: HrAccessLevel;
  }>;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    accountId: string;
    email: string;
    name: string;
    position: string | null;
    /**
     * Subscription plan code from Account.plan ('trial', 'basic', 'pro', ...).
     * Surfaced here so the frontend can show the moysklad-style trial banner
     * without a second round-trip. Defaults to 'trial' for newly seeded
     * accounts (matches the Account schema default).
     */
    accountPlan: string;
    username: string | null;
    hrRoles: string[];
    isChecker: boolean;
    /** Kiosk qobig i uchun (kassa TZ §3.1). Yashirish — qulaylik;
     *  haqiqiy cheklov serverdagi `KioskGuard` da. */
    uiMode?: 'full' | 'kiosk';
    hrPermissions: Array<{
      pageKey: string;
      section: string | null;
      accessLevel: HrAccessLevel;
    }>;
  };
}

/**
 * POS PIN (kassa TZ §3.2) — 4–6 raqam.
 *
 * Uzunlik chegarasi ataylab tor: PIN qulay qaytish vositasi, parol emas.
 * Uzaytirish kassirni yozib qo'yishga majbur qiladi va qulfni zaiflashtiradi.
 */
export const SetPosPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN 4-6 raqamdan iborat bo`lishi kerak'),
});
export type SetPosPinInput = z.infer<typeof SetPosPinSchema>;

/**
 * Kassa qurilmasidan PIN bilan KIRISH (tokensiz endpoint).
 *
 * `deviceSecret` majburiy: PIN'da foydalanuvchi nomi yo'q, shuning uchun
 * qurilma kaliti «kim so'rayapti» savoliga javob beradi. Usiz endpoint
 * ochiq internetda 10 000 variantli taxmin maydoniga aylanardi.
 */
export const PosLoginSchema = z.object({
  deviceId: z.string().uuid(),
  deviceSecret: z.string().min(32),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN 4-6 raqamdan iborat bo`lishi kerak'),
});
export type PosLoginInput = z.infer<typeof PosLoginSchema>;

/** Qurilmani do'kon/kassa/tashkilotga bog'lash (JWT + hr `employees:full`). */
export const PairPosDeviceSchema = z.object({
  name: z.string().min(1).max(200),
  storeId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export type PairPosDeviceInput = z.infer<typeof PairPosDeviceSchema>;
