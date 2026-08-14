import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FE-01 (CRITICAL) — WIRING qulfi: `/sotuv` qaytarish ekrani naqdni
 * `cart-math.refundPayoutMinor` orqali hisoblashi SHART.
 *
 * `cart-math.test.ts` formulani sinaydi — lekin formula to'g'ri bo'lib,
 * sahifa uni ishlatmasa, xato joyida qoladi. Aynan shu bo'lgan edi:
 * sahifa `BigInt(p.priceMinor) * BigInt(returnQty[p.id])` deb chegirmani
 * e'tiborsiz qoldirardi va kassa mijoz to'lamagan pulni qaytarardi.
 *
 * SALES-01 tuzatilgach server bunday so'rovni 400 bilan rad etadi, ya'ni
 * regress endi chegirmali chekni umuman qaytarib bo'lmaydigan qiladi.
 * Buni na typecheck, na unit-test tutadi — faqat shunday skaner tutadi.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
// F1 (POS redizayn): qaytarish ekrani (`ChekDetailPanel`) `page.tsx` dan
// `_components/cheklar-mode.tsx` ga ko'chdi — qulf ham u bilan birga ko'chadi.
const POS_PAGE = join(
  REPO_ROOT,
  'apps',
  'web',
  'src',
  'app',
  '(app)',
  'sotuv',
  '_components',
  'cheklar-mode.tsx',
);

function posSource(): string {
  return readFileSync(POS_PAGE, 'utf8');
}

describe('POS qaytarish — naqd asl chekning chegirmali summasidan', () => {
  it('sahifa `refundPayoutMinor` ni import qiladi', () => {
    expect(posSource()).toMatch(/refundPayoutMinor/);
  });

  it('naqd `priceMinor × qty` dan hisoblanMAYDI (chegirma tushib qolardi)', () => {
    const src = posSource();
    // Ikkala eski shakl: refundMut tanasi va ekrandagi «Qaytariladigan summa».
    expect(src).not.toMatch(/BigInt\(\s*pos\.priceMinor\s*\)\s*\*/);
    expect(src).not.toMatch(/BigInt\(\s*p\.priceMinor\s*\)\s*\*\s*BigInt\(\s*returnQty/);
  });

  it('server so`roviga mijoz narxi emas, miqdor yuboriladi', () => {
    const src = posSource();
    const at = src.indexOf('/refund`');
    expect(at, '`/retail-sales/:id/refund` chaqiruvi topilmadi').toBeGreaterThan(-1);
    // Chaqiruvdan oldingi payload qurilishi shu funksiyani ishlatsin.
    expect(src.slice(0, at)).toMatch(/refundPayoutMinor\(/);
  });
});
