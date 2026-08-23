import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * «Narx qavati» drift-lock — `resolveDefaultSalePrice*` DOIM narx-turi id'si
 * bilan chaqirilishi shart.
 *
 * 🔴 Bug-class (2026-08-23 auditi): `lib/sale-price.ts` ikkinchi argument
 * berilmasa `'default'` sentinel'ini qidiradi va topolmasa **`list[0]`** ni
 * oladi. `Product.salePrices` — JSON massiv, tartibi yozilish tartibi
 * (`product.repository.ts` `[...byType.values()]`), narx-turi pozitsiyasi
 * bo'yicha KAFOLAT yo'q. Ya'ni massivda «Оптовая» birinchi turgan tovar
 * zakaz/qaytarishga OPTOM narxda tushardi va ekranda buni hech narsa
 * bildirmasdi. `invoices-out/new` va POS id'ni to'g'ri uzatgan, uchta sahifa
 * esa uzatmagan — bir xil funksiya bir joyda to'g'ri, boshqasida noto'g'ri.
 *
 * 2026-08-23 dan buyon bu yanada og'irroq: tanlov oynasi («Выбор товара»)
 * endi shu qiymatni «Цена» maydonining SUKUT qiymati qilib oladi, ya'ni
 * noto'g'ri qavat hujjatga bir Enter bilan tushadi.
 *
 * Qulflanadi:
 *   1. `apps/web/src/app` ostidagi HAR bir chaqiruvda ikkinchi argument bor;
 *   2. skanerning o'zi sun'iy buzg'unchini tutadi (vakuum emas).
 */

const APP_DIR = join(__dirname, '..', 'app');
const CALL = /resolveDefaultSalePrice(?:OrZero)?\(/g;

/** Call sites whose argument list has NO top-level comma → tier not pinned. */
function findUnpinnedCalls(src: string): number[] {
  const offenders: number[] = [];
  for (const m of src.matchAll(CALL)) {
    let depth = 1;
    let hasTopLevelComma = false;
    for (let i = m.index + m[0].length; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 1) hasTopLevelComma = true;
    }
    if (!hasTopLevelComma) offenders.push(m.index);
  }
  return offenders;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('sotuv narxi qavati — chaqiruvda narx-turi id majburiy', () => {
  it("hech bir sahifa `resolveDefaultSalePrice*` ni id'siz chaqirmaydi", () => {
    const offenders: string[] = [];
    for (const file of walk(APP_DIR)) {
      const src = readFileSync(file, 'utf8');
      const hits = findUnpinnedCalls(src);
      if (hits.length > 0) {
        const rel = file.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
        offenders.push(`${rel} (${hits.length})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("skaner sun'iy buzg'unchini tutadi (vakuum emas)", () => {
    expect(
      findUnpinnedCalls('const x = resolveDefaultSalePriceOrZero(p.salePrices);'),
    ).toHaveLength(1);
    expect(
      findUnpinnedCalls('const x = resolveDefaultSalePriceOrZero(p.salePrices, defaultId);'),
    ).toHaveLength(0);
    // Ichki qavs top-level vergulni yashirmasligi kerak.
    expect(
      findUnpinnedCalls('const x = resolveDefaultSalePriceOrZero(f(a, b), defaultId);'),
    ).toHaveLength(0);
    expect(findUnpinnedCalls('const x = resolveDefaultSalePriceOrZero(f(a, b));')).toHaveLength(1);
  });
});
