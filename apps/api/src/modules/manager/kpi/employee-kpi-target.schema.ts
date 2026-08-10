import { z } from 'zod';

/**
 * Biriktirilgan KPI HTTP shartnomasi (KPI-02).
 *
 * ## `unit`/`currency` DTO'da ATAYLAB YO'Q
 * Ular **katalogdan** olinadi (`kpi-metrics.ts` + hisobning o'z ko'rsatkichlari)
 * va hisob valyutasidan. Klient yubora olsa, `money` qatoriga `currency: null`
 * yozib DB CHECK'iga urilardi yoki «5 dona UZS da» kabi ma'nosiz qator paydo
 * bo'lardi — metrika birligi va chegara birligi ikki xil lug'at
 * ([[manager-kpi-unit-vocabularies]]).
 *
 * ## `targetValue` — MATN, `number` EMAS
 * JSON `number` 2^53 dan katta summani JIMGINA buzadi. Naqsh `AdjustSchema`
 * dan olindi. Qiymat **ko'rinish birligida** keladi (pul = so'm), servis uni
 * minorga (tiyin) o'giradi — bitta joyda, ikki tomonda emas.
 */

/** TZ §2.5 davr lug'ati. Haftalik/oylik kunlik ballga jimgina bo'linmaydi. */
export const KPI_TARGET_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type KpiTargetPeriod = (typeof KPI_TARGET_PERIODS)[number];

/**
 * Ko'rinish birligidagi maqsad: `5000` yoki `1234.56`.
 *
 * Manfiy qiymat rad etiladi (DB CHECK `target_value >= 0` bilan bir xil), tiyin
 * kasri esa 2 xonadan oshmaydi. Sanoq/vaqt metrikasida kasr **servisda** rad
 * etiladi — bu yerda birlik ma'lum emas.
 */
const DisplayAmount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Musbat son bo`lishi kerak (masalan 5000 yoki 1234.56)');

/**
 * Og'irlik — **NULL bo'lishi mumkin va bu 0 EMAS**.
 * NULL = oylik balldan tashqarida (faqat kuzatiladi); 0 = «ballandi va nolga
 * arziydi». Aynan shu farq «og'irlik ixtiyoriy» qarorining yagona manbai.
 */
const Weight = z.number().min(0).max(100).nullable();

export const CreateEmployeeKpiTargetSchema = z.object({
  metricKey: z.string().min(1).max(50),
  period: z.enum(KPI_TARGET_PERIODS),
  targetValue: DisplayAmount.nullable().optional(),
  weight: Weight.optional(),
});
export type CreateEmployeeKpiTargetInput = z.infer<typeof CreateEmployeeKpiTargetSchema>;

/**
 * Qisman tahrir. `metricKey` ATAYLAB yo'q: kalit o'zgarsa qatorга bog'langan
 * kunlik faktlar tarixi uzilib qolardi (`kpi_metric_defs` naqshi bilan bir xil
 * qaror). Kalitni almashtirish = o'chirib qayta qo'shish.
 */
export const UpdateEmployeeKpiTargetSchema = z.object({
  period: z.enum(KPI_TARGET_PERIODS).optional(),
  targetValue: DisplayAmount.nullable().optional(),
  weight: Weight.optional(),
  active: z.boolean().optional(),
});
export type UpdateEmployeeKpiTargetInput = z.infer<typeof UpdateEmployeeKpiTargetSchema>;

/** «Bajarildi» / «qayta ochish» — faqat qo'lda o'lchanadigan metrikada. */
export const MarkKpiTargetDoneSchema = z.object({
  done: z.boolean().default(true),
});
export type MarkKpiTargetDoneInput = z.infer<typeof MarkKpiTargetDoneSchema>;

/** Menejer ekrani filtri (`/menejer/kpi`). */
export const ListAllKpiTargetsQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  period: z.enum(KPI_TARGET_PERIODS).optional(),
});
export type ListAllKpiTargetsQuery = z.infer<typeof ListAllKpiTargetsQuerySchema>;
