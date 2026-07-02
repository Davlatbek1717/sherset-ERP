import { z } from 'zod';

/**
 * Position discount as a percentage, kept as a decimal STRING (BigInt-safe — the
 * services round it via integer fixed-point, never a float). moysklad caps the
 * per-line discount at 100%; above that, `(100 - disc)` goes negative and the
 * line total (and every total that cascades from it — profit, payment status,
 * the linked order's shippedSum) flips negative. customer-orders already bounded
 * this (`z.number().max(100)`); this is the shared baseline for the 8 document
 * schemas that carried an unbounded `/^\d+(\.\d{1,2})?$/` regex.
 *
 * Compose per schema: `discountPercent.optional()` or `discountPercent.default('0')`.
 *
 *   discountPercent.parse('12.5') // ok
 *   discountPercent.parse('100')  // ok
 *   discountPercent.parse('150')  // throws — exceeds 100%
 */
export const discountPercent = z.coerce
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'discount must be a percentage with up to 2 decimals')
  .refine((v) => Number(v) <= 100, 'discount must not exceed 100%');
