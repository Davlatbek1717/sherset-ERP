import { z } from 'zod';
import { DECISION_SOURCES } from './decision-journal.js';

/**
 * MK21 — «Qaror jurnali» HTTP shakllari.
 *
 * Yozuvchi endpoint YO'Q: ekran mavjud hodisa jurnallari ustidagi ko'rinish
 * (`decision-journal-read-only.test.ts` buni qulflaydi).
 */

/** Bir so'rovda qaytariladigan maksimal qator. Kesilsa — OSHKORA aytiladi. */
export const DECISION_ROW_CAP = 500;

/**
 * Har manbadan o'qiladigan maksimal hodisa. Cheklov JIM emas: chegaraga
 * tegilgan manba javobda `cappedSources` da nomma-nom qaytariladi, aks holda
 * «boshqa hech narsa bo'lmagan» degan yolg'on taassurot qolardi.
 */
export const SOURCE_READ_CAP = 1000;

/** Davr berilmasa — oxirgi 30 kun (menejerning odatiy ko'rish oynasi). */
export const DEFAULT_WINDOW_DAYS = 30;

export const DecisionJournalQuerySchema = z.object({
  /** ISO sana/vaqt. Kiradi. */
  from: z.coerce.date().optional(),
  /** ISO sana/vaqt. KIRMAYDI (yarim-ochiq oraliq). */
  to: z.coerce.date().optional(),
  /** Bo'sh = hamma manba. */
  sources: z
    .union([z.enum(DECISION_SOURCES as [string, ...string[]]), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? undefined : Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.enum(DECISION_SOURCES as [string, ...string[]])).optional()),
  /** Qarorni QABUL QILGAN xodim. */
  actorId: z.string().uuid().optional(),
  /** Qaror TEGISHLI bo'lgan xodim. */
  subjectEmployeeId: z.string().uuid().optional(),
  action: z.string().max(40).optional(),
  reasonCode: z.string().max(40).optional(),
  /** Tizim hodisalari (dvigatel yozuvlari) — sukut bo'yicha ko'rsatilmaydi. */
  includeSystem: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(DECISION_ROW_CAP).default(200),
});

export type DecisionJournalQuery = z.infer<typeof DecisionJournalQuerySchema>;
