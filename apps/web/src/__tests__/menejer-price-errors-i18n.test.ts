import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import uz from '../messages/uz.json';

/**
 * MK18 — «Xato narxlar» ekrani (4M TZ §8.1/4).
 *
 * NEGA MANBA-SKAN (`menejer-live-boards.test.ts` bilan bir naql): ekranning
 * butun so'z boyligi BE'dagi YOPIQ ro'yxatlardan keladi — `PRICE_ERROR` va
 * `PRICE_UNCHECKED` (`price-error-control.ts`). FE ularni
 * `t(`kind_${f.kind}`)` / `t(`unchecked_${u}`)` kabi **dinamik** kalit bilan
 * chaqiradi, ya'ni `pnpm i18n:gate` ularni KO'RMAYDI (u faqat statik `t('x')`
 * ni sanaydi — 282 dinamik kalit «skipped» bo'lib o'tadi).
 *
 * MK08 da xuddi shu bo'shliq HAQIQIY bug bergan: `duty_shift_unaccepted`
 * yorlig'i ru+uz da yo'q edi va gate yashil qolgan. BE'ga yangi detektor
 * qo'shilsa, bu test yiqilishi kerak — ekranda xom `kind_YANGI_TUR` chiqib
 * turmasin.
 */

const API_MODULE = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'apps',
  'api',
  'src',
  'modules',
  'manager',
  'inventory',
  'price-error-control.ts',
);

const FE_PAGE = join(__dirname, '..', 'app', '(app)', 'menejer', 'xato-narx', 'page.tsx');

const source = readFileSync(API_MODULE, 'utf8');
const pageSource = readFileSync(FE_PAGE, 'utf8');

/** `export const NAME = { key: 'VALUE', … } as const;` dan qiymatlarni oladi. */
function constValues(name: string): string[] {
  const block = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`).exec(source);
  if (!block?.[1]) throw new Error(`${name} manbada topilmadi — test eskirgan`);
  return [...block[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1] as string);
}

const KINDS = constValues('PRICE_ERROR');
const UNCHECKED = constValues('PRICE_UNCHECKED');
/** Ekrandagi hujjat filtri — `all` FE'ning o'z qiymati, qolgani BE turlari. */
const DOC_TYPES = ['all', 'retailsale', 'demand'];

const ns = (bundle: unknown, name: string) =>
  ((bundle as { pages?: Record<string, Record<string, string>> }).pages?.[name] ?? {}) as Record<
    string,
    string
  >;

describe('MK18 — BE yopiq ro`yxatlari FE tarjimasi bilan qoplangan', () => {
  it('manba-skan haqiqatan ro`yxat topdi (test o`zi bo`sh o`tmasin)', () => {
    expect(KINDS.length).toBeGreaterThanOrEqual(5);
    expect(UNCHECKED.length).toBeGreaterThanOrEqual(5);
  });

  for (const [locale, bundle] of [
    ['ru', ru],
    ['uz', uz],
  ] as const) {
    const labels = ns(bundle, 'menejerPriceErrors');

    it(`${locale}: har xato turi uchun kind_* yorlig'i`, () => {
      const missing = KINDS.filter((k) => !labels[`kind_${k}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har «tekshirilmadi» sababi uchun unchecked_* yorlig'i`, () => {
      const missing = UNCHECKED.filter((u) => !labels[`unchecked_${u}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: har hujjat turi uchun doc_* yorlig'i`, () => {
      const missing = DOC_TYPES.filter((d) => !labels[`doc_${d}`]);
      expect(missing, `yo'q: ${missing.join(', ')}`).toEqual([]);
    });

    it(`${locale}: subnav yozuvi bor`, () => {
      const subnav = (bundle as { subnav?: Record<string, Record<string, string>> }).subnav
        ?.menejer;
      expect(subnav?.price_errors).toBeTruthy();
    });
  }

  it('ru va uz kalit to`plamlari BIR XIL (bir tomonlama tarjima bo`lmasin)', () => {
    const rk = Object.keys(ns(ru, 'menejerPriceErrors')).sort();
    const uk = Object.keys(ns(uz, 'menejerPriceErrors')).sort();
    expect(rk).toEqual(uk);
  });
});

describe('MK18 — ekranning shartnomasi', () => {
  it('«bloklamaydi» izohi ekranda DOIMIY turadi', () => {
    // TZ §5.1 — ekran «tasdiqlash oynasi» deb o'qilmasligi kerak.
    expect(pageSource).toContain("t('no_block_note')");
  });

  it('«tekshirib bo`lmadi» sanog`i alohida ko`rsatiladi', () => {
    // «0 xato» va «0 xato, lekin 400 qator tekshirilmadi» — bir xil xabar emas.
    expect(pageSource).toContain('uncheckedLineCount');
  });

  it('qamrov cheklovi ekranda OCHIQ yozilgan', () => {
    expect(pageSource).toContain("t('scope_note')");
  });
});
