import { z } from 'zod';

/**
 * Currency (Валюта) — moysklad `currency` entity parity.
 *
 * Money discipline: the rate is NEVER stored as a float. The API
 * accepts a decimal `rate` string and stores `rateValue` = rate × 1e8
 * as an integer (BigInt-as-string), computed by integer string math
 * (no IEEE-754 drift). 1 unit of THIS currency = rate base-currency
 * units (or the inverse when `indirect`).
 *
 * moysklad rules enforced in the service (not here): валюта учёта
 * (default) rate is always 1 and cannot change; AUTO currency rate is
 * cron-managed and cannot be set manually; system-currency
 * name/code/isoCode are immutable; default/system currency cannot be
 * deleted.
 */

const RATE_RE = /^\d{1,12}(\.\d{1,8})?$/;

/** Decimal rate string → integer (×1e8) string. No float — string math. */
export function rateToRateValue(rate: string): string {
  const [intPart, fracRaw = ''] = rate.split('.');
  const frac = fracRaw.padEnd(8, '0').slice(0, 8);
  const combined = `${intPart}${frac}`.replace(/^0+(?=\d)/, '');
  return combined === '' ? '0' : combined;
}

/** Integer (×1e8) string → trimmed decimal rate string (display). */
export function rateValueToRate(rateValue: string): string {
  const neg = rateValue.startsWith('-');
  const abs = (neg ? rateValue.slice(1) : rateValue).padStart(9, '0');
  const intPart = abs.slice(0, -8).replace(/^0+(?=\d)/, '');
  const frac = abs.slice(-8).replace(/0+$/, '');
  return `${neg ? '-' : ''}${intPart}${frac ? `.${frac}` : ''}`;
}

const boolish = (def: boolean) =>
  z
    .preprocess((v) => {
      if (typeof v === 'string') return v === 'true' || v === '1';
      return v;
    }, z.boolean())
    .default(def);

const unitForm = z
  .object({ singular: z.string().max(50), plural: z.string().max(50) })
  .strict()
  .optional();

export const CreateCurrencySchema = z.object({
  // moysklad's currency model: `code` = ISO 4217 NUMERIC ("840"), `isoCode` = ISO
  // 4217 ALPHA ("USD") — this is what `seed-real` imports from /entity/currency and
  // what every existing row uses. (These two were SWAPPED here — code=alpha,
  // isoCode=numeric — which is how malformed rows like code:"USD"/isoCode:"840" got
  // created; it also rejected the correct numeric-code form the picker sends.)
  /** ISO 4217 NUMERIC code, e.g. "840". Unique per account. */
  code: z
    .string()
    .trim()
    .regex(/^\d{3}$/, 'code must be a 3-digit ISO 4217 numeric code'),
  /** ISO 4217 ALPHA code, e.g. "USD". moysklad requires it at creation. */
  isoCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'isoCode must be a 3-letter ISO 4217 alpha code')
    .transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1).max(100),
  fullName: z.string().trim().max(255).optional(),
  indirect: boolish(false),
  system: boolish(false),
  default: boolish(false),
  rateUpdateType: z.enum(['AUTO', 'MANUAL']).default('MANUAL'),
  /** Decimal rate string (> 0). Stored as rateValue = rate × 1e8. */
  rate: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().regex(RATE_RE, 'rate must be a positive decimal (≤8 dp)'))
    .refine((s) => rateToRateValue(s) !== '0', 'rate cannot be zero')
    .default('1'),
  multiplicity: z.coerce.number().int().min(1).max(100000).default(1),
  margin: z.coerce.number().min(0).max(100).optional(),
  majorUnit: unitForm,
  minorUnit: unitForm,
});
export type CreateCurrencyInput = z.infer<typeof CreateCurrencySchema>;

export const UpdateCurrencySchema = CreateCurrencySchema.partial();
export type UpdateCurrencyInput = z.infer<typeof UpdateCurrencySchema>;

export const CurrencyFilterSchema = z.object({
  archived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['code', 'name', 'createdAt']).default('code'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type CurrencyFilterInput = z.infer<typeof CurrencyFilterSchema>;
