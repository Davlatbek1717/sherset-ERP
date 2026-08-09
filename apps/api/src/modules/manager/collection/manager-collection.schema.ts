import { z } from 'zod';

/**
 * MK16 — «Qarz undirish ish ro'yxati» HTTP shakllari.
 *
 * `channel` ataylab `sms | telegram` bilan cheklangan: ikkalasi ham MAVJUD
 * jo'natgichlar (`DebtService.sendBulkReminders`). Bu yerda yangi kanal
 * ochilmaydi — qo'ng'iroq esa `POST /debts/:id/call` orqali qayd etiladi.
 */

/** Bir so'rovda qaytariladigan maksimal qator. Kesilsa — OSHKORA aytiladi. */
export const COLLECTION_ROW_CAP = 500;

export const CollectionQuerySchema = z.object({
  /**
   * `due` — muddati kelgan/o'tgan + muddatsizlar (menejerning kunlik ishi).
   * `all` — kelajakdagilar ham (rejalashtirish uchun).
   */
  scope: z.enum(['due', 'all']).default('due'),
  /** Javobgar bo'yicha kesim (mas'ul yoki qarzni bergan xodim). */
  responsibleId: z.string().uuid().optional(),
  /** Faqat «muammoli» deb belgilanganlar. */
  problemOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(COLLECTION_ROW_CAP).default(200),
});
export type CollectionQuery = z.infer<typeof CollectionQuerySchema>;

export const CollectionRemindSchema = z.object({
  debtIds: z.array(z.string().uuid()).min(1).max(200),
  channel: z.enum(['sms', 'telegram']),
  /** Ixtiyoriy shablon; berilmasa kanalning default shabloni ishlatiladi. */
  templateId: z.string().uuid().optional(),
});
export type CollectionRemindInput = z.infer<typeof CollectionRemindSchema>;
