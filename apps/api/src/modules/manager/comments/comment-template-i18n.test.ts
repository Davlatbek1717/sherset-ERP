import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMENT_TEMPLATE_KINDS } from './comment-templates.js';
import { TEMPLATE_ACTIONS } from './manager-comment-template.schema.js';

/**
 * MK20 — shablon TURI va AMAL nomlarining tarjimasi (ru + uz).
 *
 * Nega bu test API tomonida: kalitlar ekranda **dinamik** yasaladi
 * (`t(\`kind_${kind}\`)`, `t(\`action_${a}\`)`), shuning uchun `pnpm i18n:gate`
 * ularni umuman ko'rmaydi — u faqat matnda yozilgan kalitni topadi. Yagona
 * haqiqat manbai esa shu yerda (`COMMENT_TEMPLATE_KINDS`, `TEMPLATE_ACTIONS`).
 *
 * Buzilganda ekranda kalitning O'ZI ko'rinadi («action_dismiss») — jim nuqson.
 * MK07 da aynan shu naqsh ishlatilgan (`rule-i18n.test.ts`).
 */

const MESSAGES_DIR = resolve(process.cwd(), '../web/src/messages');
const LOCALES = ['ru', 'uz'] as const;

function block(locale: string): Record<string, string> {
  const raw = readFileSync(resolve(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as {
    pages?: { commentTemplates?: Record<string, string> };
  };
  const found = parsed.pages?.commentTemplates;
  if (!found) throw new Error(`${locale}.json: pages.commentTemplates bo'limi yo'q`);
  return found;
}

describe('MK20 — shablon turlari ru+uz da bor', () => {
  for (const locale of LOCALES) {
    it(`${locale}: HAR tur nomi tarjima qilingan`, () => {
      const messages = block(locale);
      const missing = COMMENT_TEMPLATE_KINDS.filter((k) => !messages[`kind_${k}`]?.trim());
      expect(missing).toEqual([]);
    });
  }
});

describe('MK20 — biriktiriladigan amallar ru+uz da bor', () => {
  for (const locale of LOCALES) {
    it(`${locale}: HAR amal nomi tarjima qilingan`, () => {
      const messages = block(locale);
      const missing = TEMPLATE_ACTIONS.filter((a) => !messages[`action_${a}`]?.trim());
      expect(missing).toEqual([]);
    });
  }
});

describe('MK20 — ekranning statik kalitlari ikkala tilda ham bor', () => {
  const REQUIRED = [
    'title',
    'hint',
    'add',
    'save',
    'cancel',
    'archive',
    'restore',
    'archived_badge',
    'show_archived',
    'empty_title',
    'empty_hint',
    'field_kind',
    'field_title',
    'field_body',
    'field_rules',
    'field_actions',
    'picker_label',
    'picker_placeholder',
  ];

  for (const locale of LOCALES) {
    it(`${locale}: majburiy kalitlar to'liq`, () => {
      const messages = block(locale);
      expect(REQUIRED.filter((k) => !messages[k]?.trim())).toEqual([]);
    });
  }
});
