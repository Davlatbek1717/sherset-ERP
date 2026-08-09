import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Klass-qulf: ochiq (guard'siz) endpointlarda sir solishtirish DOIM
 * constant-time bo'lsin — Faza 21 (`INT-14` LOW, `INT-01` HIGH).
 *
 * Timing'ni o'lchab test qilib bo'lmaydi (flaky), shuning uchun qulf
 * MANBA-matn darajasida: bu uchta joy sirni `secretEquals()` (SHA-256
 * digest + `crypto.timingSafeEqual`) orqali solishtirishi shart va xom
 * `===` bilan solishtirishga qaytmasligi kerak.
 *
 * Non-vacuous: fixgacha `payme.protocol.ts:127` `return pass === secretKey;`,
 * `click.protocol.ts:113` `return expected === params.sign_string;`, va
 * `telegram-webhook.controller.ts` sarlavhani umuman solishtirmasdi —
 * uchala tekshiruv ham o'sha holatda YIQILADI.
 */
const HERE = import.meta.dirname;

/**
 * Kommentlarni olib tashlaydi — `forbidden` naqshlari faqat HAQIQIY kodga
 * qo'llansin. (Fixning o'zi «ilgari `pass === secretKey` edi» deb izohlaydi;
 * xom matn skani buni regressiya deb o'qib qulfni yolg'on-yiqitardi.)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const GUARDED = [
  {
    name: 'payme.protocol',
    file: ['..', 'payment-gateway', 'payme.protocol.ts'],
    // Payme Basic-auth paroli
    forbidden: [/\bpass\s*===\s*secretKey\b/, /\bsecretKey\s*===\s*pass\b/],
    required: /secretEquals\(\s*pass\s*,\s*secretKey\s*\)/,
  },
  {
    name: 'click.protocol',
    file: ['..', 'payment-gateway', 'click.protocol.ts'],
    // Click MD5 imzosi
    forbidden: [
      /\bexpected\s*===\s*params\.sign_string\b/,
      /\bparams\.sign_string\s*===\s*expected\b/,
    ],
    required: /secretEquals\(\s*expected\s*,\s*params\.sign_string\s*\)/,
  },
];

describe('constant-time secret compare — klass qulfi', () => {
  for (const g of GUARDED) {
    it(`${g.name}: secretEquals ishlatadi, xom === EMAS`, () => {
      const src = readFileSync(join(HERE, ...g.file), 'utf8');
      expect(src).toMatch(/from '\.\.\/shared\/timing-safe\.js'/);
      const code = stripComments(src);
      expect(code).toMatch(g.required);
      for (const bad of g.forbidden) expect(code).not.toMatch(bad);
    });
  }

  it('telegram-webhook controller secret-tekshiruvsiz handleInbound chaqirmaydi', () => {
    // Kommentsiz — tartib tekshiruvi docblock'dagi eslatmadan emas, HAQIQIY
    // chaqiruvlardan o'lchansin.
    const src = stripComments(
      readFileSync(join(HERE, '..', 'telegram', 'telegram-webhook.controller.ts'), 'utf8'),
    );
    const assertAt = src.indexOf('assertWebhookSecret');
    const inboundAt = src.indexOf('handleInbound');
    expect(assertAt).toBeGreaterThan(-1);
    expect(inboundAt).toBeGreaterThan(-1);
    // Tekshiruv chaqiruvdan OLDIN turishi shart (va await bilan).
    expect(assertAt).toBeLessThan(inboundAt);
    expect(src).toMatch(/await\s+this\.svc\.assertWebhookSecret\(/);
    // Sarlavha «ataylab ishlatilmagan» (`_`-prefiks) holatiga qaytmasin.
    expect(src).not.toMatch(/_secretHeader/);
  });

  it('assertWebhookSecret servis tomonda secretEquals bilan tekshiradi', () => {
    const src = readFileSync(join(HERE, '..', 'telegram', 'telegram.service.ts'), 'utf8');
    expect(src).toMatch(/assertWebhookSecret\s*\(/);
    expect(src).toMatch(/secretEquals\(/);
    expect(src).toMatch(/UnauthorizedException/);
  });
});
