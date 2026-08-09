import { z } from 'zod';
import { MAX_COMMENT_LENGTH } from '../comments/comment-templates.js';
import { WORK_ITEM_ACTION, WORK_ITEM_STATUS } from './work-item-fsm.js';
import { MANAGER_RULES, RULE_MODE, THRESHOLD_UNIT } from './work-item-rules.js';

/**
 * MK06 HTTP shartnomasi (4M TZ §5).
 *
 * `ruleType` va `action` YOPIQ ro'yxatlar — registrdan/FSM dan olinadi, ya'ni
 * MK07 yangi qoida qo'shganda sxema o'z-o'zidan kengayadi va qo'lda
 * yangilanishi kerak bo'lgan ikkinchi ro'yxat paydo bo'lmaydi.
 */

const ruleTypes = Object.keys(MANAGER_RULES) as [string, ...string[]];
const actions = Object.values(WORK_ITEM_ACTION) as [string, ...string[]];
const statuses = Object.values(WORK_ITEM_STATUS) as [string, ...string[]];

export const QueueListQuerySchema = z.object({
  status: z.enum(statuses).optional(),
  /** `true` = faqat ochiq ish (open + in_review). Default xulq. */
  openOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  ruleType: z.enum(ruleTypes).optional(),
  employeeId: z.string().uuid().optional(),
  /** Faqat eskirganlar — «nima e'tibordan qolgan». */
  staleOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type QueueListQueryInput = z.infer<typeof QueueListQuerySchema>;

export const QueueSyncBodySchema = z.object({
  /** Manbani qancha orqaga qarab o'qish. */
  sinceDays: z.coerce.number().int().min(1).max(365).optional(),
  /** Eskirish chegarasi (§5.1 default = 3 kun). */
  staleAfterDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type QueueSyncBodyInput = z.infer<typeof QueueSyncBodySchema>;

export const QueueActionBodySchema = z.object({
  action: z.enum(actions),
  reasonCode: z.string().min(1).max(40).optional(),
  comment: z.string().max(MAX_COMMENT_LENGTH).optional(),
  /**
   * MK20 — tanlangan shablon. Jurnalga uning MATNI ko'chiriladi, havola EMAS
   * (`comment-templates.ts`). `comment` ham berilsa — tahrirlangan matn ustun.
   */
  templateId: z.string().uuid().optional(),
});
export type QueueActionBodyInput = z.infer<typeof QueueActionBodySchema>;

/**
 * Qoida sozlamasi. `mode` da `block` YO'Q — Zod darajasidagi uchinchi qulf
 * (bazada CHECK, registrda literal tip).
 */
export const RuleConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  thresholdValue: z.coerce.number().min(0).nullable().optional(),
  thresholdUnit: z
    .enum([THRESHOLD_UNIT.percent, THRESHOLD_UNIT.minor, THRESHOLD_UNIT.days, THRESHOLD_UNIT.qty])
    .nullable()
    .optional(),
  mode: z.enum([RULE_MODE.observe, RULE_MODE.notify]).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});
export type RuleConfigBodyInput = z.infer<typeof RuleConfigBodySchema>;
