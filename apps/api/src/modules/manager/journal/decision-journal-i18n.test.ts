import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHIFT_ACCEPTANCE_ACTION,
  SHIFT_REASON_CODES,
} from '../../cashier-session/shift-acceptance.js';
import { FORWARD } from '../../supply-approval/supply-approval.fsm.js';
import { DAILY_KPI_ACTION, REASON_CODES } from '../kpi/daily-kpi-fsm.js';
import { WORK_ITEM_ACTION, WORK_ITEM_REASON_CODES } from '../queue/work-item-fsm.js';
import { DECISION_SOURCES } from './decision-journal.js';

/**
 * MK21 — qaror jurnalidagi DINAMIK kalitlar tarjima qilinganmi (ru + uz).
 *
 * Nega bu test API tomonida: ekran kalitni ish paytida yasaydi
 * (`t(\`action_${row.action}\`)`), shuning uchun `pnpm i18n:gate` uni umuman
 * ko'rmaydi — u faqat matnda YOZILGAN kalitni topadi. Yagona haqiqat manbai
 * esa to'rtta FSM (bu yerda import qilingan), ya'ni tekshiruv ham shu yerda.
 *
 * Buzilganda ekranda kalitning O'ZI ko'rinadi («action_force_accept»), xato
 * chiqmaydi — jim nuqson (MK07 dagi bir xil sabab).
 */

const MESSAGES_DIR = resolve(process.cwd(), '../web/src/messages');
const LOCALES = ['ru', 'uz'] as const;

/** To'rt manbaning amallari — bitta yassi kalit fazosida (ma'nolari mos). */
const ACTIONS = [
  ...new Set([
    ...Object.values(DAILY_KPI_ACTION),
    ...Object.values(SHIFT_ACCEPTANCE_ACTION),
    ...Object.values(WORK_ITEM_ACTION),
    ...Object.keys(FORWARD),
    'reject',
  ]),
];

/** Sabab kodlari — uch qabul-FSM'ining yopiq ro'yxatlari birlashmasi. */
const REASONS = [
  ...new Set([
    ...Object.values(REASON_CODES).flat(),
    ...Object.values(SHIFT_REASON_CODES).flat(),
    ...Object.values(WORK_ITEM_REASON_CODES).flat(),
  ]),
];

/** Manbalardagi aktyor turlari (har FSM o'z tilida ataydi). */
const ACTOR_TYPES = [
  'system',
  'manager',
  'owner',
  'employee',
  'cashier',
  'supplier',
  'omborchi',
  'admin',
];

function decisionMessages(locale: string): Record<string, string> {
  const raw = readFileSync(resolve(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as {
    pages?: { managerDecisions?: Record<string, string> };
  };
  const block = parsed.pages?.managerDecisions;
  if (!block) throw new Error(`${locale}.json: pages.managerDecisions bo'limi yo'q`);
  return block;
}

describe('MK21 — qaror jurnalining dinamik kalitlari ru+uz da bor', () => {
  for (const locale of LOCALES) {
    it(`${locale}: har MANBA nomi tarjima qilingan`, () => {
      const m = decisionMessages(locale);
      expect(DECISION_SOURCES.filter((s) => !m[`source_${s}`]?.trim())).toEqual([]);
    });

    it(`${locale}: har AMAL nomi tarjima qilingan`, () => {
      const m = decisionMessages(locale);
      expect(ACTIONS.filter((a) => !m[`action_${a}`]?.trim())).toEqual([]);
    });

    it(`${locale}: har SABAB kodi tarjima qilingan`, () => {
      const m = decisionMessages(locale);
      expect(REASONS.filter((r) => !m[`reason_${r}`]?.trim())).toEqual([]);
    });

    it(`${locale}: har AKTYOR turi tarjima qilingan`, () => {
      const m = decisionMessages(locale);
      expect(ACTOR_TYPES.filter((a) => !m[`actor_${a}`]?.trim())).toEqual([]);
    });
  }
});
