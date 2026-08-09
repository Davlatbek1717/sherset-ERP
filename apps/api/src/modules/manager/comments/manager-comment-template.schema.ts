import { z } from 'zod';
import { DAILY_KPI_ACTION } from '../kpi/daily-kpi-fsm.js';
import { WORK_ITEM_ACTION } from '../queue/work-item-fsm.js';
import { MANAGER_RULES } from '../queue/work-item-rules.js';
import { COMMENT_TEMPLATE_KINDS, MAX_COMMENT_LENGTH } from './comment-templates.js';

/**
 * MK20 HTTP shartnomasi.
 *
 * `ruleTypes` va `actions` — YOPIQ ro'yxatlar, registrdan/FSM'dan olinadi.
 * Erkin matn qabul qilinsa, bitta harf xatosi («BIG_DEPT») shablonni HECH
 * QACHON taklif qilinmaydigan qilib qo'yardi va menejer «yaratdim-u
 * ko'rinmaydi» degan jim nuqsonga duch kelardi. Ro'yxat shu yerda
 * TAKRORLANMAYDI — manbadan hisoblanadi (MK07 ning `manager-queue.schema.ts`
 * naqshi).
 */

const kinds = COMMENT_TEMPLATE_KINDS as unknown as [string, ...string[]];
const ruleTypes = Object.keys(MANAGER_RULES) as [string, ...string[]];

/**
 * Shablon biriktirilishi mumkin bo'lgan amallar: navbat (MK06/MK07) + kun
 * qabuli (MK01). Ikkala FSM ham izohni jurnalga yozadi.
 *
 * ⚠️ Faqat QO'LDA bajariladigan amallar. `open_for_review` va `mark_stale` —
 * TIZIM amallari (cron/planner yozadi, odam emas): ularga shablon biriktirish
 * hech qachon ishlamaydigan sozlama bo'lardi, lekin ekranda tanlanadigan
 * bo'lib ko'rinardi.
 */
export const TEMPLATE_ACTIONS = [
  ...new Set<string>([
    ...Object.values(WORK_ITEM_ACTION),
    DAILY_KPI_ACTION.accept,
    DAILY_KPI_ACTION.reject,
    DAILY_KPI_ACTION.explain,
    DAILY_KPI_ACTION.forceAccept,
    DAILY_KPI_ACTION.adjust,
  ]),
] as [string, ...string[]];

/** Interfeys tillari — `apps/web/src/messages` bilan bir xil. */
const LOCALES = ['ru', 'uz'] as const;

export const CommentTemplateListQuerySchema = z.object({
  kind: z.enum(kinds).optional(),
  locale: z.enum(LOCALES).optional(),
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});
export type CommentTemplateListQuery = z.infer<typeof CommentTemplateListQuerySchema>;

export const CommentTemplateSuggestQuerySchema = z.object({
  action: z.enum(TEMPLATE_ACTIONS).optional(),
  ruleType: z.enum(ruleTypes).optional(),
  locale: z.enum(LOCALES).optional(),
});
export type CommentTemplateSuggestQuery = z.infer<typeof CommentTemplateSuggestQuerySchema>;

export const CommentTemplateCreateSchema = z.object({
  kind: z.enum(kinds),
  locale: z.enum(LOCALES).default('uz'),
  title: z.string().trim().min(2).max(120),
  /**
   * Tana uzunligi izoh chegarasi bilan BIR XIL: uzunroq shablon jurnalga
   * kesilib tushardi yoki (BE kesmasa) HTTP sxemasi rad etadigan izohni
   * yaratardi. Baza CHECK'i ham aynan shu raqamni ushlaydi.
   */
  body: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
  ruleTypes: z.array(z.enum(ruleTypes)).max(30).optional().default([]),
  actions: z.array(z.enum(TEMPLATE_ACTIONS)).max(30).optional().default([]),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).optional().default(0),
});
export type CommentTemplateCreateInput = z.infer<typeof CommentTemplateCreateSchema>;

export const CommentTemplateUpdateSchema = CommentTemplateCreateSchema.partial();
export type CommentTemplateUpdateInput = z.infer<typeof CommentTemplateUpdateSchema>;
