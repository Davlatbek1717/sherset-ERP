import { z } from 'zod';

/** MK38 — mijoz taqsimoti HTTP shartnomasi. */

export const CustomerListQuerySchema = z.object({
  /** Egasi bo'yicha kesim. `unassigned=true` bilan birga ishlatilmaydi. */
  ownerId: z.string().uuid().optional(),
  /** Faqat egasiz mijozlar (erkin havza). */
  unassigned: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type CustomerListQueryInput = z.infer<typeof CustomerListQuerySchema>;

/**
 * Egalikni o'zgartirish (bir yoki bir nechta mijoz).
 *
 * `toOwnerId: null` = erkin havzaga qaytarish. `undefined` EMAS: «tegilmasin»
 * bilan «egasiz qilinsin» ikki boshqa amal, va ularni bitta shaklda
 * aralashtirish jimgina noto'g'ri natija berardi.
 */
export const ReassignBodySchema = z.object({
  counterpartyIds: z.array(z.string().uuid()).min(1).max(500),
  toOwnerId: z.string().uuid().nullable(),
});
export type ReassignBodyInput = z.infer<typeof ReassignBodySchema>;
