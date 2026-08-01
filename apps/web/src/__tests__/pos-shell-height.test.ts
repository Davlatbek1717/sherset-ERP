/**
 * POS qobig'i balandligi QAT'IY raqamga qaytmasin.
 *
 * Real hodisa (2026-08-01): `/sotuv` `h-[calc(100dvh-58px)]` bilan yozilgan edi —
 * faqat 58px navbar hisobga olingan. climart qobig'ida navbar USTIGA subnav ham
 * bor, natijada qobiq ~47px uzun bo'lib JAMI + to'lov tugmasi ekrandan chiqib
 * ketardi (egasi suratda ko'rsatdi). Brauzerda o'lchandi: eski variant 47px
 * qirqar, o'lchanadigan variant aynan sig'adi.
 *
 * Bu testni hech qanday tip yoki lint bermaydi: qat'iy raqamli variant ham
 * mukammal kompilyatsiya bo'ladi va faqat QOG'OZDA/ekranda ko'rinadi.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = path.join(process.cwd(), 'src', 'app', '(app)', 'sotuv', 'page.tsx');

/**
 * Izohlar skanerdan OLIB TASHLANADI — repo konventsiyasi
 * (`raw-element-conventions.test.ts` ham shunday qiladi). Aks holda sahifadagi
 * «avval calc(100dvh-58px) edi» degan tushuntirish izohining O'ZI testni
 * yiqitadi: nasihat kod bilan adashtirilmasin.
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('/sotuv qobiq balandligi', () => {
  const src = stripComments(fs.readFileSync(PAGE, 'utf8'));

  it('viewport balandligini qatiy raqam bilan kesmaydi', () => {
    const hardcoded = src.match(/calc\(\s*100d?vh\s*-\s*\d+px\s*\)/g) ?? [];
    expect(hardcoded).toEqual([]);
  });

  it('o`lchaydigan hook`ni ishlatadi', () => {
    expect(src).toContain('useFillViewport');
  });

  it('hook erta `return`dan YUQORIDA chaqiriladi (React #310)', () => {
    const hookAt = src.indexOf('useFillViewport<');
    const firstEarlyReturn = src.search(/^ {2}if \(!user \|\| isLoading\) \{/m);
    expect(hookAt).toBeGreaterThan(-1);
    expect(firstEarlyReturn).toBeGreaterThan(-1);
    expect(hookAt).toBeLessThan(firstEarlyReturn);
  });
});
