import { z } from 'zod';
import {
  DAILY_KPI_ACTION,
  DAILY_KPI_STATES,
  type DailyKpiAction,
  reasonCodesFor,
} from './daily-kpi-fsm.js';

/**
 * Menejer KPI HTTP shartnomasi (4M.2).
 *
 * Sabab kodlari ro'yxati Zod'da TAKRORLANMAYDI — `reasonCodesFor()` FSM'dan
 * o'qiladi. Aks holda ikki ro'yxat vaqt o'tib bir-biridan uzoqlashardi va
 * frontend ko'rsatgan kod backend'da rad etilardi.
 */

export const QueueFilterSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  employeeId: z.string().uuid().optional(),
  /** Bo'sh bo'lsa — navbatdagi hamma holat (FSM `QUEUE_STATES`). */
  states: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (typeof v === 'string' ? v.split(',') : v))
    .pipe(z.array(z.enum(DAILY_KPI_STATES as [string, ...string[]])).optional()),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type QueueFilter = z.infer<typeof QueueFilterSchema>;

/** Menejer bajaradigan o'tishlar (tizim amallari HTTP orqali ochilmaydi). */
const MANUAL_ACTIONS = [
  DAILY_KPI_ACTION.accept,
  DAILY_KPI_ACTION.reject,
  DAILY_KPI_ACTION.explain,
  DAILY_KPI_ACTION.escalate,
  DAILY_KPI_ACTION.forceAccept,
  DAILY_KPI_ACTION.reopen,
] as const satisfies readonly DailyKpiAction[];

export const TransitionSchema = z
  .object({
    action: z.enum(MANUAL_ACTIONS),
    reasonCode: z.string().max(40).optional().nullable(),
    comment: z.string().max(2000).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const codes = reasonCodesFor(v.action);
    if (v.reasonCode && codes.length > 0 && !codes.includes(v.reasonCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCode'],
        message: `Noma'lum sabab kodi. Mumkin: ${codes.join(', ')}`,
      });
    }
  });
export type TransitionInput = z.infer<typeof TransitionSchema>;

export const AdjustSchema = z.object({
  metricKey: z.string().min(1).max(50),
  /**
   * Tuzatilgan qiymat — tiyin/dona, BUTUN son MATN sifatida. Raqam turi
   * ATAYLAB ishlatilmaydi: JSON `number` 2^53 dan katta summani jimgina
   * buzadi. `null` = tuzatmani BEKOR QILISH.
   */
  adjustValue: z
    .string()
    .regex(/^-?\d+$/, 'Butun son bo`lishi kerak')
    .nullable(),
  reasonCode: z.enum(reasonCodesFor(DAILY_KPI_ACTION.adjust) as unknown as [string, ...string[]]),
  comment: z.string().max(2000).optional().nullable(),
});
export type AdjustInput = z.infer<typeof AdjustSchema>;

export const DrilldownQuerySchema = z.object({
  metric: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type DrilldownQuery = z.infer<typeof DrilldownQuerySchema>;
