import { z } from 'zod';

/**
 * MK12 HTTP shartnomasi (4M TZ §8).
 *
 * `yearMonth` — oy YORLIG'I ("YYYY-MM"), bazadagi CHECK bilan bir xil shakl.
 * Ikki joyda ham qulflangan: Zod noto'g'ri qiymatni 400 bilan qaytaradi,
 * baza esa API'ni chetlab o'tgan yozuvni rad etadi.
 */
const YEAR_MONTH = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth «YYYY-MM» ko'rinishida bo'lishi kerak");

export const BudgetReportQuerySchema = z.object({
  yearMonth: YEAR_MONTH,
  /**
   * Ogohlantirish chegarasi (rejaning %). Default `DEFAULT_WARN_PERCENT`
   * (`budget-variance.ts`) — TZ'da yo'q, shuning uchun kodda muzlatilmagan.
   */
  warnPercent: z.coerce.number().min(1).max(500).optional(),
  /** Arxivlangan moddalarni ham ko'rsatish (reja/fakt bo'lsa baribir chiqadi). */
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type BudgetReportQueryInput = z.infer<typeof BudgetReportQuerySchema>;

/**
 * Reja yozish (upsert: modda × oy = bitta qator).
 *
 * `plannedMinor` — tiyin, satr sifatida ham qabul qilinadi: JSON `number`
 * katta summani (`> 2^53`) buzadi va bu jimgina yumaloqlanishga olib kelardi.
 */
export const BudgetPlanBodySchema = z.object({
  expenseItemId: z.string().uuid(),
  yearMonth: YEAR_MONTH,
  plannedMinor: z
    .union([z.string().regex(/^\d+$/, "plannedMinor manfiy bo'lmagan butun son"), z.number().int()])
    .transform((v) => BigInt(v))
    .refine((v) => v >= 0n, "plannedMinor manfiy bo'la olmaydi"),
  currency: z.string().length(3).optional(),
  note: z.string().max(2000).nullable().optional(),
});
export type BudgetPlanBodyInput = z.infer<typeof BudgetPlanBodySchema>;
