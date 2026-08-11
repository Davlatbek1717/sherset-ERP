import { describe, expect, it } from 'vitest';
// Sof mapper `packages/db` da turadi (u yerda `Product.salePrices` shakli
// yashaydi va uni ikkala import yo'li ham chaqiradi: `scripts/ops-import-products.ts`
// va `prisma/seed-real.ts`). Testi shu yerda — vitest faqat apps/* va
// packages/money da yuguradi; nisbiy import kichik-yo'l (subpath) alias
// tuzog'ini ham chetlab o'tadi (`vitest-alias-swallows-subpath` xotirasi).
import { mapSalePriceTiers } from '../../../../../packages/db/src/sale-price-tiers.js';

/**
 * P12 — MoySklad importidagi NARX-QAVAT mapping bug'i (2026-08-12 da topildi).
 *
 * Prodda o'lchangan: 4905 tovardan **3960 tasida optom narx YO'Q** (81%).
 * Sabab kod satrida: ikkala import yo'li ham har bir MoySklad narx qavatini
 * AYNI `defaultPriceTypeId` bilan muhrlardi —
 *   `r.salePrices.map((p) => ({ priceTypeId: defaultPtId, value }))`
 * ⇒ «Оптовая цена» qatori ham `default` turi bilan yozilar, `resolveWholesaleMinor`
 * esa optom TURINI qidiradi va hech qachon topmasdi. Optom ogohlantirishi
 * (sariq tasma) shu sababdan katalogning 81% ida o'lik edi.
 */
const TYPES = [
  { id: 'pt-retail', name: 'Розничная цена' },
  { id: 'pt-wholesale', name: 'Оптовая цена' },
];

describe('mapSalePriceTiers', () => {
  it('har qavatni NOMI bo‘yicha o‘z narx turiga bog‘laydi', () => {
    expect(
      mapSalePriceTiers(
        [
          { value: 1_000_000, priceType: { name: 'Розничная цена' } },
          { value: 800_000, priceType: { name: 'Оптовая цена' } },
        ],
        TYPES,
      ),
    ).toEqual([
      { priceTypeId: 'pt-retail', value: '1000000' },
      { priceTypeId: 'pt-wholesale', value: '800000' },
    ]);
  });

  it('nomlar teskari tartibda kelsa ham to‘g‘ri turga tushadi', () => {
    expect(
      mapSalePriceTiers(
        [
          { value: 800_000, priceType: { name: 'Оптовая цена' } },
          { value: 1_000_000, priceType: { name: 'Розничная цена' } },
        ],
        TYPES,
      ),
    ).toEqual([
      { priceTypeId: 'pt-wholesale', value: '800000' },
      { priceTypeId: 'pt-retail', value: '1000000' },
    ]);
  });

  it('nom yo‘q bo‘lsa TARTIB bo‘yicha bog‘lanadi (MoySklad qavatlarni tartibda beradi)', () => {
    expect(mapSalePriceTiers([{ value: 1_000_000 }, { value: 800_000 }], TYPES)).toEqual([
      { priceTypeId: 'pt-retail', value: '1000000' },
      { priceTypeId: 'pt-wholesale', value: '800000' },
    ]);
  });

  it('akkauntda yo‘q qavat TASHLAB ketiladi — default turga quyilmaydi', () => {
    // 🔴 Aynan shu bug edi: uchinchi qavat ham `default` bo'lib yozilar va
    // chakana narxni o'zi bilan almashtirib yuborishi mumkin edi.
    expect(
      mapSalePriceTiers([{ value: 1_000_000 }, { value: 800_000 }, { value: 700_000 }], TYPES),
    ).toEqual([
      { priceTypeId: 'pt-retail', value: '1000000' },
      { priceTypeId: 'pt-wholesale', value: '800000' },
    ]);
  });

  it('bitta turga ikki qavat tushsa BIRINCHISI qoladi (dublikat tur = eski bug)', () => {
    expect(
      mapSalePriceTiers(
        [
          { value: 1_000_000, priceType: { name: 'Розничная цена' } },
          { value: 900_000, priceType: { name: 'Розничная цена' } },
        ],
        TYPES,
      ),
    ).toEqual([{ priceTypeId: 'pt-retail', value: '1000000' }]);
  });

  it('narx yo‘q bo‘lsa bo‘sh ro‘yxat (narx TO‘QILMAYDI)', () => {
    expect(mapSalePriceTiers(undefined, TYPES)).toEqual([]);
    expect(mapSalePriceTiers([], TYPES)).toEqual([]);
  });

  it('kasr qiymat yaxlitlanadi va SATR bo‘lib saqlanadi (minor birlik)', () => {
    expect(mapSalePriceTiers([{ value: 1_000_000.4 }], TYPES)).toEqual([
      { priceTypeId: 'pt-retail', value: '1000000' },
    ]);
  });

  it('akkauntda narx turi yo‘q bo‘lsa hech nima yozilmaydi', () => {
    expect(mapSalePriceTiers([{ value: 1_000_000 }], [])).toEqual([]);
  });
});
