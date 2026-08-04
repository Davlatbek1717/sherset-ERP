import { z } from 'zod';
import { KPI_REASON_CODES } from './daily-kpi.fsm.js';

/**
 * Kunlik KPI qabul qilish DTO'lari (TZ 4M.2 §3).
 *
 * Sabab kodi YOPIQ ro'yxatdan — erkin matn bo'lsa «zararga sotuvlarning 30%
 * raqobatchi narxi» degan tahlilni keyin qurib bo'lmaydi (§5.3).
 */

const ReasonCode = z.enum(KPI_REASON_CODES);
const Note = z.string().trim().max(1000).nullish();

/** Qabul qilish / tushuntirish — sabab ixtiyoriy. */
export const KpiDecisionSchema = z.object({
  reasonCode: ReasonCode.nullish(),
  note: Note,
});
export type KpiDecisionInput = z.infer<typeof KpiDecisionSchema>;

/** Rad etish · qayta ochish · majburiy yopish — sabab MAJBURIY. */
export const KpiReasonedDecisionSchema = z.object({
  reasonCode: ReasonCode,
  note: Note,
});
export type KpiReasonedDecisionInput = z.infer<typeof KpiReasonedDecisionSchema>;

/**
 * Ko'rsatkich tuzatmasi. Qiymat MATN sifatida keladi: pul tiyinda saqlanadi va
 * JS `number` katta summani jimgina yaxlitlaydi (BigInt shartnomasi).
 * `value: null` = tuzatmani olib tashlash (avtomat qiymatga qaytish).
 */
export const KpiAdjustSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'Butun son kutilgan (pul — tiyinda)')
    .nullable(),
  reasonCode: ReasonCode,
  note: Note,
});
export type KpiAdjustInput = z.infer<typeof KpiAdjustSchema>;

/** Navbat filtri. */
export const KpiQueueQuerySchema = z.object({
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  employeeId: z.string().uuid().optional(),
  states: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? undefined : Array.isArray(v) ? v : v.split(','))),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type KpiQueueQuery = z.infer<typeof KpiQueueQuerySchema>;
