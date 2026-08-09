import { z } from 'zod';
import { SLA_THRESHOLD_UNIT } from './stuck-sla.js';

/**
 * MK10 HTTP shartnomasi (4M TZ §8).
 *
 * `thresholdUnit` da faqat VAQT birliklari bor — `percent`/`minor`/`qty`
 * SLA uchun ma'nosiz va ular Zod darajasidayoq kirmaydi. Bu MK06 dagi
 * «birlik chegaradan ajralmaydi» qoidasining shu paneldagi ko'rinishi.
 */

export const SlaBoardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type SlaBoardQueryInput = z.infer<typeof SlaBoardQuerySchema>;

export const SlaStageConfigBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    /**
     * `null` QABUL QILINMAYDI: «chegarasiz SLA» = hech qachon qotib
     * qolmaydi degani, buning uchun `enabled: false` bor va u ekranda
     * ochiq ko'rinadi.
     */
    thresholdValue: z.coerce.number().positive().max(100_000).optional(),
    thresholdUnit: z.enum([SLA_THRESHOLD_UNIT.hours, SLA_THRESHOLD_UNIT.days]).optional(),
    severity: z.enum(['info', 'warning', 'critical']).optional(),
  })
  .superRefine((v, ctx) => {
    // Raqam birliksiz kelsa, servis uni JIM rad etardi va menejer chegarani
    // o'zgartirdim deb o'ylab qolardi — bu yerda ochiq 400 beriladi.
    if (v.thresholdValue !== undefined && v.thresholdUnit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['thresholdUnit'],
        message: 'thresholdValue bilan birga thresholdUnit MAJBURIY',
      });
    }
  });
export type SlaStageConfigBodyInput = z.infer<typeof SlaStageConfigBodySchema>;
