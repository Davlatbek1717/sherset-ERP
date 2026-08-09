import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RULE_REASON_CODES, WORK_ITEM_REASON_CODES } from './work-item-fsm.js';
import { MANAGER_RULES } from './work-item-rules.js';

/**
 * MK07 — QOIDA va SABAB nomlarining tarjimasi bormi (ru + uz).
 *
 * Nega bu test API tomonida turibdi: kalitlar ekranda **dinamik** yasaladi
 * (`t(`rule_${row.ruleType}`)`, `t(`reason_${code}`)`), shuning uchun
 * `pnpm i18n:gate` ularni umuman ko'rmaydi — u faqat matnda yozilgan kalitni
 * topadi. Yagona haqiqat manbai esa shu yerda (`MANAGER_RULES`,
 * `RULE_REASON_CODES`), ya'ni tekshiruv ham shu yerda bo'lishi kerak.
 *
 * Buzilganda ekranda kalitning O'ZI ko'rinadi («rule_BIG_DEBT»), xato esa
 * chiqmaydi — jim nuqson. Aynan shu klass repoda POS'da 88 marta yuz bergan.
 */

const MESSAGES_DIR = resolve(process.cwd(), '../web/src/messages');
const LOCALES = ['ru', 'uz'] as const;

function queueMessages(locale: string): Record<string, string> {
  const raw = readFileSync(resolve(MESSAGES_DIR, `${locale}.json`), 'utf8');
  const parsed = JSON.parse(raw) as {
    pages?: { managerQueue?: Record<string, string> };
  };
  const block = parsed.pages?.managerQueue;
  if (!block) throw new Error(`${locale}.json: pages.managerQueue bo'limi yo'q`);
  return block;
}

describe('MK07 — qoida nomlari ru+uz da bor', () => {
  for (const locale of LOCALES) {
    it(`${locale}: HAR qoida turining nomi tarjima qilingan`, () => {
      const messages = queueMessages(locale);
      const missing = Object.keys(MANAGER_RULES).filter(
        (ruleType) => !messages[`rule_${ruleType}`]?.trim(),
      );
      expect(missing).toEqual([]);
    });
  }
});

describe('MK07 §5.3 — sabab kodlari ru+uz da bor', () => {
  const allCodes = [
    ...new Set([
      ...Object.values(WORK_ITEM_REASON_CODES).flat(),
      ...Object.values(RULE_REASON_CODES).flat(),
    ]),
  ];

  it('katalog bo`sh emas (test o`z-o`zini aldab yashil bo`lmasin)', () => {
    expect(allCodes.length).toBeGreaterThan(40);
  });

  for (const locale of LOCALES) {
    it(`${locale}: HAR sabab kodi tarjima qilingan`, () => {
      const messages = queueMessages(locale);
      const missing = allCodes.filter((code) => !messages[`reason_${code}`]?.trim());
      expect(missing).toEqual([]);
    });
  }

  it('ru va uz bir xil kalit to`plamiga ega (bir tomonlama qo`shish qulfi)', () => {
    const keysOf = (locale: string) =>
      Object.keys(queueMessages(locale))
        .filter((k) => k.startsWith('rule_') || k.startsWith('reason_'))
        .sort();
    expect(keysOf('uz')).toEqual(keysOf('ru'));
  });
});
