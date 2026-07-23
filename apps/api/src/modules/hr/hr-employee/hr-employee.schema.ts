import { z } from 'zod';

// IPv4 «доступ только с адресов» entry (moysklad employee card → Сеть).
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// IPv4 CIDR «доступ только из сети» entry, e.g. 192.168.0.0/24.
const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/**
 * moysklad employee card «Уведомления» matrix — one row per notification
 * group, three delivery channels. Stored (not yet delivered at runtime) in
 * Employee.attributes.__employee_system.
 */
export const NotificationRowSchema = z.object({
  enabled: z.boolean().optional(),
  web: z.boolean().optional(),
  email: z.boolean().optional(),
  phone: z.boolean().optional(),
});

export const CreateHrEmployeeSchema = z.object({
  name: z.string().min(1, 'Ism kiritilishi shart').max(255),
  email: z.string().email("Email noto'g'ri").max(255).optional(),
  phone: z.string().max(20).optional().nullable(),
  // Telegram phone with +998 format (santexnika do'koni standart)
  telegramPhone: z
    .string()
    .regex(/^\+?[0-9]{9,15}$/, "Telegram telefon raqami noto'g'ri")
    .optional()
    .nullable(),
  department: z.string().max(100).optional().nullable(),
  hrRoles: z.array(z.string().max(50)).default([]),
  isChecker: z.boolean().default(false),
  moyskladAgentId: z.string().uuid().optional().nullable(),
  // ── moysklad employee card (Настройки → Справочники → Сотрудники) ──
  lastName: z.string().max(100).optional().nullable(), // Фамилия
  firstName: z.string().max(100).optional().nullable(), // Имя
  middleName: z.string().max(100).optional().nullable(), // Отчество
  position: z.string().max(255).optional().nullable(), // Должность
  // Оклад — minor units (tiyin), same wire format as every *Minor field.
  salaryMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'salaryMinor must be a non-negative integer')
    .optional()
    .nullable(),
  inn: z.string().max(20).optional().nullable(), // ИНН
  description: z.string().max(4096).optional().nullable(), // Описание
  groupId: z.string().uuid().optional().nullable(), // Отдел
  // «Разрешить вход в систему» — stored in attributes.__employee_system.
  loginAllowed: z.boolean().optional(),
  // «Сеть»: Доступ только с адресов / только из сети.
  allowedIps: z.array(z.string().regex(IPV4, "IP manzil noto'g'ri")).max(50).optional(),
  allowedNetworks: z
    .array(z.string().regex(IPV4_CIDR, "IP-tarmoq (CIDR) noto'g'ri"))
    .max(50)
    .optional(),
  // «Уведомления» matrix, keyed by row id (customer_orders, stocks, ...).
  notifications: z.record(z.string().max(50), NotificationRowSchema).optional(),
});

export const UpdateHrEmployeeSchema = CreateHrEmployeeSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard — the same Employee row
  // is also editable from /analitika/staff and /auth/me, so the version this
  // form loaded must round-trip. Absent on Create (version starts at 1).
  version: z.number().int().nonnegative(),
});

/**
 * moysklad employee card «Изображение» — same wire format + caps as the
 * product-image upload (JSON base64; 6 MB encoded ≈ 4 MB binary backstop).
 */
export const SetEmployeeImageSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  dataBase64: z.string().min(1).max(6_000_000, 'Rasm hajmi 4 MB dan oshmasligi kerak'),
});
export type SetEmployeeImageInput = z.infer<typeof SetEmployeeImageSchema>;

export const SetPasswordSchema = z.object({
  // Owner 2026-07-19 (second report): the login is FREE-FORM — «xodim o'zi
  // xohlagan loginni erkin kirita olishi kerak». No character rules; only the
  // technical minimum stays: non-empty after trim and ≤50 (the DB column is
  // VarChar(50) — longer would P2000 into a raw 500). Uniqueness comes from
  // the partial DB index, mapped to a field-naming 409 by employee-unique.ts.
  username: z
    .string()
    .trim()
    .min(1, "Login bo'sh bo'lmasligi kerak")
    .max(50, 'Login 50 belgidan oshmasligi kerak'),
  password: z.string().min(4, 'Kamida 4 belgi').max(200),
});

/**
 * Query-string boolean. NOT z.coerce.boolean(): that runs Boolean("false")
 * → true, so a client sending `?archived=false` got the ARCHIVED list (the
 * active admin vanished, archived rows showed — owner-reported 2026-07-17).
 */
const queryBool = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const HrEmployeeFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  isChecker: queryBool.optional(),
  // moysklad «Состояние» (active/archived) toggle. Defaults to the active
  // list (archived=false); the «Извлечь из архива» bulk action is only
  // reachable from the archived view, so the page flips this to view them.
  archived: queryBool.optional().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateHrEmployeeInput = z.infer<typeof CreateHrEmployeeSchema>;
export type UpdateHrEmployeeInput = z.infer<typeof UpdateHrEmployeeSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;
export type HrEmployeeFilter = z.infer<typeof HrEmployeeFilterSchema>;
