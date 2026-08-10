import { z } from 'zod';
import { LOST_REASON_CODES } from './lost-customers.js';

/** MK17 — «yo'qolgan mijozlar» HTTP shartnomasi. */

export const LostCustomerQuerySchema = z.object({
  /**
   * `lost` (sukut) — faqat yo'qolganlar (menejerning bugungi ishi) ·
   * `all` — faol/xaridsizlar bilan birga (tekshirish va kesim uchun).
   */
  scope: z.enum(['lost', 'all']).default('lost'),
  /** Sotuvchi kesimi. `unassigned=true` bilan birga ishlatilmaydi. */
  ownerId: z.string().uuid().optional(),
  unassigned: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  /** Faqat sabab BELGILANMAGANLAR — «kim bilan gaplashish kerak» ro'yxati. */
  unmarkedOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type LostCustomerQueryInput = z.infer<typeof LostCustomerQuerySchema>;

/**
 * Sabab belgisi. `code` — YOPIQ ro'yxat: erkin matn `note` da qoladi, aks
 * holda taqsimot «narx»/«Narx»/«narxi qimmat» ni uch sabab qilib ko'rsatardi.
 */
export const MarkLostReasonSchema = z.object({
  counterpartyId: z.string().uuid(),
  code: z.enum(LOST_REASON_CODES),
  note: z.string().max(500).nullable().optional(),
});
export type MarkLostReasonInput = z.infer<typeof MarkLostReasonSchema>;
