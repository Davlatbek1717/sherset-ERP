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

export const ExchangeRateFilterSchema = z.object({
  /// ISO-8601 date — defaults to today. Reads return the latest known
  /// rate on or before this date (i.e. carry-forward across weekends/holidays).
  date: z.coerce.date().optional(),
  currency: CurrencyCodeSchema.optional(),
});
export type ExchangeRateFilterInput = z.infer<typeof ExchangeRateFilterSchema>;
