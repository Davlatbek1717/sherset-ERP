import { z } from 'zod';

/**
 * Haydovchi naqd topshirig'i (HR TZ §7.2) DTO'lari.
 *
 * Ikki bosqich ATAYLAB ajratilgan:
 *  1. `collect` — HAYDOVCHI «mijozdan shuncha naqd oldim» deydi. Bu pul
 *     harakati EMAS, faqat qarz e'lonи: pul haydovchining qo'lida.
 *  2. `handOver` — KASSIR pulni sanab qabul qiladi va aynan shu qadamda
 *     ПКО yaratiladi. Kassa qoldig'i faqat shu payt o'zgaradi.
 *
 * Agar bitta qadam qilinsa, haydovchi e'lon qilishi bilan kassa qoldig'i
 * oshib ketardi — kassada esa pul yo'q. Aynan shu farqni ko'rsatish uchun
 * jadval qurilyapti.
 */

export const CollectCashSchema = z.object({
  /** tiyin, musbat. */
  amountMinor: z.coerce.string().regex(/^\d+$/, "amountMinor manfiy bo'lmagan butun son"),
  /** Qaysi yetkazmadan (ixtiyoriy — telefon buyurtmasi ham bo'ladi). */
  tripId: z.string().uuid().nullish(),
  note: z.string().max(1000).nullish(),
});
export type CollectCashInput = z.infer<typeof CollectCashSchema>;

/**
 * Qabul qilish. Kassir ПКО uchun kerakli uchta ma'lumotni beradi — ular
 * `CashIn` sxemasining MAJBURIY maydonlari va ularni taxmin qilib bo'lmaydi:
 * qaysi kontragent nomidan, qaysi tashkilotga, qaysi kassaga.
 */
export const HandOverCashSchema = z.object({
  agentId: z.string().uuid(),
  organizationId: z.string().uuid(),
  cashDeskId: z.string().uuid(),
  /** Optimistik qulf — ikki kassir bir vaqtda qabul qilib ikki ПКО yaratmasin. */
  version: z.number().int().nonnegative(),
});
export type HandOverCashInput = z.infer<typeof HandOverCashSchema>;

export const DriverCashFilterSchema = z.object({
  driverId: z.string().uuid().optional(),
  status: z.enum(['pending', 'handed', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type DriverCashFilterInput = z.infer<typeof DriverCashFilterSchema>;
