import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Brand-alias tokenlar ANIQLANGANLIGI qulfi (2026-08-15, kassa monoblokida).
 *
 * Bug-sinf: `bg-[var(--ms-brand)] text-white` uslubidagi tugma, token CSS'da
 * aniqlanmagan bo'lsa, SHAFFOF fonda OQ yozuv bo'lib butunlay ko'rinmas
 * bo'ladi. Hech bir gate (tc/biome/vitest) buni tutmaydi — jsdom uslub
 * hisoblamaydi, Playwright esa test-id bo'yicha bosaveradi («ko'rinadi» deb
 * o'lchami bor elementni hisoblaydi). POS «Qarz to'lovi» oynasining
 * «To'lovni qabul qilish» tugmasi aynan shu sabab prodda ko'rinmay, kassada
 * qarz to'lab bo'lmasdi — egasining jonli skrinshoti bilan topildi.
 *
 * Bu test tsx'larda ishlatiladigan QISQA brand-nomlarni DS globals.css'dagi
 * ta'rif bilan bog'lab qo'yadi. ⚠️ Kengroq audit (boshqa ~30 aniqlanmagan
 * --ms-* token: border/bg-input/danger…) — alohida vazifa (NEXT.md 15a),
 * ular currentColor/inherit'ga tushib «ko'rinadigan» holatda, bu uchlik esa
 * ko'rinmas-tugma sinfi edi.
 */

const DS_GLOBALS = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'design-system',
  'src',
  'globals.css',
);

const REQUIRED = ['--ms-brand', '--ms-brand-hover', '--ms-bg-brand'] as const;

describe('DS globals.css — qisqa brand aliaslar aniqlangan', () => {
  const css = readFileSync(DS_GLOBALS, 'utf8');

  for (const token of REQUIRED) {
    it(`${token}: ta'rifi bor (tugmalar ko'rinmas bo'lib qolmasin)`, () => {
      // `--ms-brand:` ta'rifi `--ms-brand-500:` ga mos kelmasin — aniq `:` chegarasi.
      const re = new RegExp(`^\\s*${token}\\s*:`, 'm');
      expect(css, `${token} DS globals.css'da aniqlanmagan — bg shaffof, tugma ko'rinmas`).toMatch(
        re,
      );
    });
  }
});
