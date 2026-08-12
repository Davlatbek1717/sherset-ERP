import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Storno KONKURENTLIK qo'riqchisi (manba-matn qulfi).
 *
 * NEGA manba-matn: `reversePayment` Prisma bilan chuqur bog'langan, poygani
 * unit-testda takrorlash uchun butun tx qatlamini soxtalashtirish kerak bo'lardi
 * va o'sha soxta qatlam aynan tekshirilayotgan atomiklikni «to'g'ri» qilib
 * ko'rsatardi. Shuning uchun SHART kodda borligini qulflaymiz — `remove()`
 * uchun ishlatilgan naqshning aynan o'zi.
 *
 * IKKI KIRISH NUQTASI (fix-round I-1). To'lovni storno qiladigan yo'l ikkita:
 * `reversePayment` (kassir/rahbar stornosi) va `cancelCallNote` (qo'ng'iroq
 * natijasi bekor qilinganda bog'langan to'lov ham qaytadi). Ikkalasi ham
 * `reverseCashDeskDelta` ni chaqiradi, ya'ni qulf FAQAT bittasiga qo'yilsa
 * yashiqdan pul hamon ikki marta chiqishi mumkin (`cancelCallNote` +
 * `reversePayment` yonma-yon). Shu sababli qoida BITTA joyda —
 * `claimPaymentForReversal` — va bu test ikkala chaqiruvchini ham qulflaydi.
 */
const SRC = readFileSync(join(import.meta.dirname, 'debt.service.ts'), 'utf8');

function methodBody(name: string): string {
  const start = SRC.indexOf(`async ${name}(`);
  expect(start, `${name} topilmadi`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  /**', start);
  return SRC.slice(start, end === -1 ? SRC.length : end);
}

describe('storno qulfi — atomik claim (yagona qoida)', () => {
  const body = methodBody('claimPaymentForReversal');

  it('`reversedAt` ni SHARTLI updateMany bilan da`vo qiladi', () => {
    expect(body).toMatch(/debtPayment\.updateMany\(/);
    // Claim shartida `reversedAt: null` BO'LISHI SHART — usiz ikki storno ham o'tadi.
    const claim = body.slice(body.indexOf('debtPayment.updateMany('));
    expect(claim.slice(0, 400)).toContain('reversedAt: null');
  });

  it('da`vo yutqazilsa (count 0) xato otadi — jimgina davom etmaydi', () => {
    expect(body).toMatch(/count === 0/);
  });

  it('yopilgan smenadagi to`lov stornosi BLOKLANADI', () => {
    expect(body).toMatch(/cashierSession/);
    expect(body).toMatch(/state: 'open'|state !== 'open'/);
  });
});

describe('storno qulfi — IKKALA kirish nuqtasi bir qoidadan yuradi', () => {
  // `reverseCashDeskDelta` ni chaqiradigan har yo'l qulfdan ham o'tishi shart.
  for (const entry of ['reversePayment', 'cancelCallNote']) {
    it(`${entry} qulfni chaqiradi va shartsiz \`debtPayment.update(\` QOLMAGAN`, () => {
      const entryBody = methodBody(entry);
      expect(entryBody, entry).toMatch(/this\.claimPaymentForReversal\(/);
      expect(entryBody, entry).not.toMatch(/tx\.debtPayment\.update\(/);
      // Qoida NUSXALANMAGAN: claim faqat helper ichida bo'lsin.
      expect(entryBody, entry).not.toMatch(/debtPayment\.updateMany\(/);
    });

    it(`${entry} pulga tegishdan OLDIN qulflaydi`, () => {
      const entryBody = methodBody(entry);
      const claimAt = entryBody.indexOf('this.claimPaymentForReversal(');
      const cashAt = entryBody.indexOf('this.reverseCashDeskDelta(');
      expect(claimAt, `${entry}: claim topilmadi`).toBeGreaterThan(-1);
      expect(cashAt, `${entry}: kassa harakati topilmadi`).toBeGreaterThan(-1);
      expect(claimAt, `${entry}: qulf yashiq harakatidan KEYIN`).toBeLessThan(cashAt);
    });
  }
});
