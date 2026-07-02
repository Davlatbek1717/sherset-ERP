import { z } from 'zod';

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
  // Login credentials — optional on create (can be set later via set-password).
  username: z
    .string()
    .min(3, 'Kamida 3 belgi')
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Faqat lotin harf, raqam, _ va -')
    .optional(),
  password: z.string().min(4, 'Kamida 4 belgi').max(200).optional(),
});

export const UpdateHrEmployeeSchema = CreateHrEmployeeSchema.partial().extend({
  // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
  // caller cannot silently bypass the lost-update guard — the same Employee row
  // is also editable from /analitika/staff and /auth/me, so the version this
  // form loaded must round-trip. Absent on Create (version starts at 1).
  version: z.number().int().nonnegative(),
});

export const SetPasswordSchema = z.object({
  username: z
    .string()
    .min(3, 'Kamida 3 belgi')
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Faqat lotin harf, raqam, _ va -'),
  password: z.string().min(4, 'Kamida 4 belgi').max(200),
});

export const HrEmployeeFilterSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  isChecker: z.coerce.boolean().optional(),
  // moysklad «Состояние» (active/archived) toggle. Defaults to the active
  // list (archived=false); the «Извлечь из архива» bulk action is only
  // reachable from the archived view, so the page flips this to view them.
  archived: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type CreateHrEmployeeInput = z.infer<typeof CreateHrEmployeeSchema>;
export type UpdateHrEmployeeInput = z.infer<typeof UpdateHrEmployeeSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;
export type HrEmployeeFilter = z.infer<typeof HrEmployeeFilterSchema>;
