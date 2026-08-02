/**
 * Savat qatoridagi tan narx / optom chegara / foyda wiring'i buzilmasin
 * (kassa TZ §5.2–§5.3).
 *
 * Nega source-scan: bu yerdagi butun xavf — RAQAM YOLG'ON bo'lib chiqishi, va
 * yolg'on raqam mukammal kompilyatsiya bo'ladi. `costMinor ?? 0n` deb yozilsa
 * typecheck ham, lint ham, render testi ham jim o'tadi — savat esa tan narxi
 * yig'ilmagan tovarni «100% foyda» deb ko'rsatib turadi. Aynan shu bug-klass
 * `profitability.service.ts` dagi `0::bigint AS cost` bo'lib, har kassa chekini
 * 100% marja bilan ko'rsatgan.
 *
 * Shu sababli test uch narsani qulflaydi:
 *   1. savat qatori uchta narxni ham OLIB YURADI (prop-drop klassi:
 *      [[documenteditor-prop-drop-bug]] — maydon qo'shilib, uzatilmay qolishi);
 *   2. formulalar YAGONA manbadan (`@moysklad/money`) keladi, sahifada qayta
 *      yozilmaydi — ikki joyda ikki javob bo'lmasin;
 *   3. noma'lum tan narx nolga aylantirilmaydi.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = path.join(process.cwd(), 'src', 'app', '(app)', 'sotuv', 'page.tsx');

/** Izohlar skanerdan olib tashlanadi — repo konventsiyasi (pos-shell-height). */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('/sotuv savat foydasi', () => {
  const src = stripComments(fs.readFileSync(PAGE, 'utf8'));

  it('savat qatori tan narx / optom / asos narxni olib yuradi', () => {
    for (const field of ['costMinor', 'wholesaleMinor', 'basePriceMinor']) {
      expect(src).toContain(`${field}:`);
    }
  });

  it('uchala raqam ham kartochkadan haqiqatan o`qiladi (maydon bo`sh qolmasin)', () => {
    // `cardPrices` — yagona o'qish nuqtasi; u ham qo'shishda, ham «Tayyor»
    // chekni savatga tortishda ishlatiladi.
    expect(src).toContain('resolveWholesaleSalePrice(');
    expect(src).toContain('cardPrices(product.buyPrice, product.salePrices)');
    expect(src).toContain('cardPrices(p.product.buyPrice, p.product.salePrices)');
  });

  it('formulalar umumiy paketdan keladi, sahifada qayta yozilmaydi', () => {
    for (const fn of ['classifyPrice', 'lineProfitMinor', 'marginPercent', 'sumCostMinor']) {
      expect(src).toContain(fn);
    }
    // Qo'lda yozilgan «(narx − tan) × soni» yoki foiz formulasi bo'lmasin.
    expect(src).not.toMatch(/priceMinor\s*-\s*\w*[cC]ostMinor/);
    expect(src).not.toMatch(/\*\s*100n?\s*\)\s*\/\s*\w*[rR]evenue/);
  });

  it('noma`lum tan narx NOLGA aylantirilmaydi', () => {
    // `?? 0n` / `|| 0n` — «tan narx yo'q» ni «tan narx nol» ga aylantiradigan
    // yagona yozuv; u kirsa, savat 100% foyda ko'rsata boshlaydi.
    expect(src).not.toMatch(/[cC]ostMinor\s*(\?\?|\|\|)\s*0n/);
    expect(src).not.toMatch(/[bB]asePriceMinor\s*(\?\?|\|\|)\s*0n/);
  });

  it('noma`lum tan narxda foyda o`rniga «—» chiqadi', () => {
    expect(src).toContain('lineProfit == null');
    expect(src).toContain('cartProfitMinor == null');
  });

  it('zarar va optomdan past holatlar ko`rinadi', () => {
    expect(src).toContain("band === 'loss'");
    expect(src).toContain("band === 'below-wholesale'");
    expect(src).toContain('cart_loss');
    expect(src).toContain('cart_below_wholesale');
  });

  it('chek bo`yicha jami foyda chegirmadan KEYINGI summadan olinadi', () => {
    // Chegirma hisobga olinmasa, kassir 30% tushirib bergan chekda ham to'liq
    // foyda ko'rinardi — nazorat raqami emas, taskin bo'lib qolardi.
    expect(src).toContain('discountedTotal - cartCost.costMinor');
    // ...va bironta qator tan narxsiz bo'lsa, jami umuman ko'rsatilmaydi.
    expect(src).toContain('cartCost.complete ?');
  });
});
