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
 * POS PIN (kassa TZ §3.2) — AYNAN 4 raqam.
 *
 * Uzunlik chegarasi ataylab tor: PIN qulay qaytish vositasi, parol emas.
 * Uzaytirish kassirni yozib qo'yishga majbur qiladi va qulfni zaiflashtiradi.
 *
 * 🔴 2026-08-12: `4,6` diapazoni AYNAN 4 ga toraytirildi — sabab va migratsiya
 * eslatmasi `kiosk-policy.ts` → `POS_PIN_RE` da.
 */
export const SetPosPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN 4 raqamdan iborat bo`lishi kerak'),
});
export type SetPosPinInput = z.infer<typeof SetPosPinSchema>;

/**
 * Admin boshqa xodimga PIN qo'yishi / O'CHIRISHI.
 *
 * `null` ATAYLAB ruxsat etilgan: xodim ketganda PIN olib tashlanishi kerak,
 * aks holda uning kassaga kirish yo'li ochiq qolardi. Bo'sh satr (`''`) esa
 * rad etiladi — u «o'chirish» degan NIYATNI bildirmaydi, ko'pincha tozalanmagan
 * forma maydoni bo'ladi.
 */
export const SetEmployeePosPinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{4}$/, 'PIN 4 raqamdan iborat bo`lishi kerak')
    .nullable(),
});
export type SetEmployeePosPinInput = z.infer<typeof SetEmployeePosPinSchema>;

/**
 * Kassa qurilmasidan PIN bilan KIRISH (tokensiz endpoint).
 *
 * `deviceSecret` majburiy: PIN'da foydalanuvchi nomi yo'q, shuning uchun
 * qurilma kaliti «kim so'rayapti» savoliga javob beradi. Usiz endpoint
 * ochiq internetda 10 000 variantli taxmin maydoniga aylanardi.
 */
/**
 * Kassa kirishi — PIN.
 *
 * 🔴 `deviceId`/`deviceSecret` 2026-08-11 da IXTIYORIY qilindi (egasining aniq
 * talabi: «juftlash degan narsani to'liq olib tashla, faqat PIN chiqadi»).
 * Ular berilsa qurilma AVVALGIDEK tekshiriladi (eski o'rnatmalar buzilmaydi);
 * berilmasa xodim PIN bo'yicha topiladi.
 *
 * NIMA YO'QOTILDI (ochiq yozib qo'yilsin): qurilma kaliti ikkinchi omil edi —
 * usiz kassa hisobiga kirish 4 raqamga qoladi va manzilni bilgan har kim
 * PIN sinab ko'ra oladi. Egasi bu almashuvdan xabardor holda qaror qildi.
 * (2026-08-12 da maydon yana toraydi: 4–6 emas, AYNAN 4 ⇒ 10 000 variant.
 * Buni ushlab turadigan yagona narsa — `POS_PIN_MAX_ATTEMPTS = 5` qulfi.)
 */
export const PosLoginSchema = z.object({
  deviceId: z.string().uuid().optional(),
  deviceSecret: z.string().min(32).optional(),
  pin: z.string().regex(/^\d{4}$/, 'PIN 4 raqamdan iborat bo`lishi kerak'),
  /**
   * Electron qobig'i versiyasi (`app.getVersion()`). IXTIYORIY: brauzerdan
   * kirishda yo'q. Faqat qayd uchun — hech qanday qarorga ta'sir qilmaydi (K07).
   */
  shellVersion: z.string().max(32).optional(),
});
export type PosLoginInput = z.infer<typeof PosLoginSchema>;

/**
 * F7 — kassirni almashtirish (`POST /auth/pos-pin/switch`, spec §8).
 *
 * `.strict()` ATAYLAB: Zod sukutda noma'lum kalitni JIM tashlaydi
 * (`pos-terminal-debt-payment-broken` xotirasi — jim tashlash real bug
 * keltirgan). Almashinuv — auth-amal; klient nimadir ortiqcha yuborsa bu
 * shartnoma-buzilish va u baland ovozda 400 bo'lishi kerak.
 *
 * `deviceId`/`deviceSecret` pos-login bilan bir xil IXTIYORIY (2026-08-11
 * egasi qarori — juftlashsiz o'rnatmalar bor): berilsa qurilma-juftlik
 * tekshiriladi, berilmasa kiosk-belgisi sifatida token `uiMode` xizmat qiladi.
 */
export const PosSwitchSchema = z
  .object({
    employeeId: z.string().uuid(),
    pin: z.string().regex(/^\d{4}$/, 'PIN 4 raqamdan iborat bo`lishi kerak'),
    deviceId: z.string().uuid().optional(),
    deviceSecret: z.string().min(32).optional(),
  })
  .strict();
export type PosSwitchInput = z.infer<typeof PosSwitchSchema>;

/** Qurilmani do'kon/kassa/tashkilotga bog'lash (JWT + hr `employees:full`). */
export const PairPosDeviceSchema = z.object({
  name: z.string().min(1).max(200),
  storeId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export type PairPosDeviceInput = z.infer<typeof PairPosDeviceSchema>;
