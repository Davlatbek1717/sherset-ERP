import { z } from 'zod';

/**
 * ISO-4217 currency code shape — three uppercase letters.
 * We don't lock the enum to a fixed list because CBRU's catalog evolves;
 * the FK contract is just "valid currency code".
 */
export const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'currency must be 3 uppercase letters');
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

/**
 * The raw payload shape returned by CBRU's public JSON endpoint
 * `https://cbu.uz/uz/arkhiv-kursov-valyut/json/[YYYY-MM-DD]/`.
 *
 * CBRU returns date as DD.MM.YYYY string and Rate/Nominal as strings —
 * we coerce + validate at the boundary.
 */
export const CbruRowSchema = z.object({
  Ccy: CurrencyCodeSchema,
  Rate: z.string().regex(/^\d+(\.\d+)?$/, 'CBRU.Rate must be a positive decimal string'),
  Nominal: z.string().regex(/^\d+$/, 'CBRU.Nominal must be a positive integer string'),
  Date: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, 'CBRU.Date must be DD.MM.YYYY'),
});
export type CbruRow = z.infer<typeof CbruRowSchema>;

export const CbruResponseSchema = z.array(CbruRowSchema);

// --- Read filter ---

// --- Qo'lda kurs qo'yish (2026-08-17, egasi: «dollar kursini qo'lda o'zgartirsam») ---

/**
 * Aql-bovar chegarasi. Nega kerak: kurs bitta maydonga qo'lda kiritiladi va
 * xato bir raqam butun kassani buzadi — `12` (nol tushib qolgan) yoki
 * `120000000` (ortiqcha nol) darhol sotuv narxini yolg'on qiladi. Chegara
 * so'm-dollar uchun real diapazon: 100 … 1 000 000.
 */
export const MANUAL_RATE_MIN = 100;
export const MANUAL_RATE_MAX = 1_000_000;

/**
 * `PUT /exchange-rates/manual` tanasi.
 *
 * `rate` STRING sifatida keladi va string bo'lib qoladi: pul-kritik qiymat
 * IEEE-754 `number` ga aylantirilmaydi (Prisma.Decimal bilan ishlanadi).
 * Chegara tekshiruvi uchun `Number()` faqat SOLISHTIRISHDA ishlatiladi —
 * saqlanadigan qiymat baribir asl string.
 */
export const ManualRateSchema = z.object({
  currency: CurrencyCodeSchema,
  rate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'rate must be a positive decimal with at most 6 decimals')
    .refine((v) => Number(v) >= MANUAL_RATE_MIN, {
      message: `rate must be at least ${MANUAL_RATE_MIN}`,
    })
    .refine((v) => Number(v) <= MANUAL_RATE_MAX, {
      message: `rate must not exceed ${MANUAL_RATE_MAX}`,
    }),
});
export type ManualRateInput = z.infer<typeof ManualRateSchema>;

export const ExchangeRateFilterSchema = z.object({
  /// ISO-8601 date — defaults to today. Reads return the latest known
  /// rate on or before this date (i.e. carry-forward across weekends/holidays).
  date: z.coerce.date().optional(),
  currency: CurrencyCodeSchema.optional(),
});
export type ExchangeRateFilterInput = z.infer<typeof ExchangeRateFilterSchema>;
