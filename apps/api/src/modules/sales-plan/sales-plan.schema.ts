import { z } from 'zod';
import { SALES_PLAN_TYPE, isMoneyPlanType } from './sales-plan-types.js';

/**
 * MK37 HTTP shartnomasi.
 *
 * `yearMonth` — oy YORLIG'I ("YYYY-MM"), `ExpenseBudget` bilan bir xil shakl.
 * Ikki qatlamda qulflangan: Zod 400 qaytaradi, bazadagi CHECK esa API'ni
 * chetlab o'tgan yozuvni rad etadi.
 */
const YEAR_MONTH = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth «YYYY-MM» ko'rinishida bo'lishi kerak");

export const SalesPlanReportQuerySchema = z.object({
  yearMonth: YEAR_MONTH,
  /** Bitta xodim kesimi (xodim kartasi uchun). */
  employeeId: z.string().uuid().optional(),
  /** Rejasi ham, fakti ham yo'q xodimlarni ham ko'rsatish. */
  includeEmpty: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type SalesPlanReportQueryInput = z.infer<typeof SalesPlanReportQuerySchema>;

/**
 * Reja yozish (upsert: xodim × oy × tur = bitta qator).
 *
 * `targetValue` satr sifatida ham qabul qilinadi: JSON `number` 2^53 dan katta
 * tiyin summasini jimgina yumaloqlaydi (`plannedMinor` bilan bir xil sabab).
 */
export const SalesPlanBodySchema = z
  .object({
    employeeId: z.string().uuid(),
    yearMonth: YEAR_MONTH,
    planType: z.nativeEnum(SALES_PLAN_TYPE),
    targetValue: z
      .union([
        z.string().regex(/^\d+$/, "targetValue manfiy bo'lmagan butun son"),
        z.number().int(),
      ])
      .transform((v) => BigInt(v))
      .refine((v) => v >= 0n, "targetValue manfiy bo'la olmaydi"),
    /** Pul turida majburiy (servis bazaga qo'yadi), sanoq turida taqiqlangan. */
    currency: z.string().length(3).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  // 🔴 Birlik lug'atlari aralashmasin — bazadagi CHECK bilan bir xil qoida,
  // lekin foydalanuvchi 500 emas, 400 va tushunarli xabar oladi.
  .refine((v) => isMoneyPlanType(v.planType) || v.currency == null, {
    message: "Sanoq rejasida valyuta bo'lmaydi",
    path: ['currency'],
  });
export type SalesPlanBodyInput = z.infer<typeof SalesPlanBodySchema>;
