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
 */
const SRC = readFileSync(join(import.meta.dirname, 'debt.service.ts'), 'utf8');

function methodBody(name: string): string {
  const start = SRC.indexOf(`async ${name}(`);
  expect(start, `${name} topilmadi`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  /**', start);
  return SRC.slice(start, end === -1 ? SRC.length : end);
}

describe('reversePayment — atomik claim', () => {
  const body = methodBody('reversePayment');

  it('`reversedAt` ni SHARTLI updateMany bilan da`vo qiladi', () => {
    expect(body).toMatch(/debtPayment\.updateMany\(/);
    // Claim shartida `reversedAt: null` BO'LISHI SHART — usiz ikki storno ham o'tadi.
    const claim = body.slice(body.indexOf('debtPayment.updateMany('));
    expect(claim.slice(0, 400)).toContain('reversedAt: null');
  });

  it('da`vo yutqazilsa (count 0) xato otadi — jimgina davom etmaydi', () => {
    expect(body).toMatch(/count === 0/);
  });

  it('shartsiz `debtPayment.update(` QOLMAGAN (eski yo`l)', () => {
    expect(body).not.toMatch(/tx\.debtPayment\.update\(/);
  });

  it('yopilgan smenadagi to`lov stornosi BLOKLANADI', () => {
    expect(body).toMatch(/cashierSession/);
    expect(body).toMatch(/state: 'open'|state !== 'open'/);
  });
});
