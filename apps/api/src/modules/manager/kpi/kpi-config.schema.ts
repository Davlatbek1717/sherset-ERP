import { z } from 'zod';

/**
 * Har-xodim KPI config DTO (TZ 4M.2 — «har xodim uchun alohida»).
 *
 * Menejer xodimga qaysi ko'rsatkichlar, qanday og'irlik va qanday kunlik
 * maqsad bilan qo'llanishini belgilaydi. Saqlash HAR SAFAR yangi profil
 * VERSIYASINI yozadi (§2.3 — o'tgan kun raqami muzlaydi).
 */
export const SaveKpiConfigSchema = z.object({
  metrics: z
    .array(
      z.object({
        /** Katalog kaliti (`kpi-metrics.ts`). Server katalogga tekshiradi. */
        metricKey: z.string().trim().min(1).max(50),
        /** Kompozit balldagi og'irligi, foiz (0–100). 0 = faqat ko'rsatiladi. */
        weight: z.coerce.number().min(0).max(100),
        /**
         * Kunlik maqsad-raqam, ko'rsatkichning O'Z birligida BUTUN son
         * (pul = tiyin, dona = dona, daqiqa = daqiqa). null / yo'q = maqsadsiz.
         */
        target: z.coerce.number().int().min(0).nullish(),
      }),
    )
    .max(50),
  /** Ixtiyoriy izoh — nega o'zgardi (versiya jurnali uchun). */
  note: z.string().trim().max(300).nullish(),
});
export type SaveKpiConfigInput = z.infer<typeof SaveKpiConfigSchema>;
