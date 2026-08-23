import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { purchaseLinePriceMinor } from '@/lib/purchase-line-price';
import { describe, expect, it } from 'vitest';

/**
 * Qabul/xarid hujjatida qator narxi = TAN NARX (buyPrice).
 *
 * 🔴 Bug-class (2026-08-23 auditi): `supplies/new` bir faylda ikki qarama-qarshi
 * shartnomani saqlardi — tanlangan tovar qatori CHAKANA sotish narxi bilan
 * to'lardi (`retailPriceTypeId`, «owner 2026-07-27»), «Сохранить цены» esa
 * o'sha sonni `PATCH /products/:id { buyPrice }` bilan TAN NARXga yozardi.
 * Post paytida qator narxi partiyaning `costMinor` iga ham aylanadi. Natijada
 * bir marta «Сохранить цены» bosilsa tovarning tan narxi o'z chakana narxi
 * bilan almashardi: marja 0 ga tushadi, narx poli (`min(tan, karta)`) chakana
 * narxgacha ko'tariladi.
 *
 * Egasining qarori (2026-08-23): qator TAN NARX bilan to'ladi — ikkala
 * iste'molchi ham (Сохранить цены + costMinor) uni tan narx deb ishlatgani
 * uchun ziddiyat yo'qoladi.
 *
 * Qulflanadi:
 *   1. yordamchi tan narxni oladi, sotuv narxlariga UMUMAN qaramaydi;
 *   2. tan narx yo'q bo'lsa `'0'` (sotuv narxiga tushib ketmaydi);
 *   3. qabul sahifalari qator narxini `salePrices` dan seed QILMAYDI.
 */

describe('purchaseLinePriceMinor', () => {
  it('tan narxni oladi', () => {
    expect(purchaseLinePriceMinor({ buyPrice: '1500000' })).toBe('1500000');
  });

  it("tan narx yo'q bo'lsa 0 — sotuv narxiga TUSHMAYDI", () => {
    expect(
      purchaseLinePriceMinor({
        buyPrice: null,
        salePrices: [{ priceTypeId: 'pt-1', value: '9900000' }],
      }),
    ).toBe('0');
  });

  it("tan narx 0 bo'lsa 0 qoladi (NULL bilan aralashmaydi)", () => {
    expect(purchaseLinePriceMinor({ buyPrice: '0' })).toBe('0');
  });

  it('tovar umuman berilmasa 0', () => {
    expect(purchaseLinePriceMinor(undefined)).toBe('0');
  });
});

describe('qabul sahifalari — qator narxi sotuv narxidan seed qilinmaydi', () => {
  const PAGES = ['src/app/(app)/supplies/new/page.tsx', 'src/app/(app)/supplies/[id]/page.tsx'];

  it('«retailPriceTypeId» qabul sahifalarida qolmagan', () => {
    const offenders = PAGES.filter((p) =>
      readFileSync(join(__dirname, '..', '..', p), 'utf8').includes('retailPriceTypeId'),
    );
    expect(offenders).toEqual([]);
  });

  it('ikkala sahifa ham umumiy yordamchini ishlatadi', () => {
    for (const p of PAGES) {
      const src = readFileSync(join(__dirname, '..', '..', p), 'utf8');
      expect(src).toContain('purchaseLinePriceMinor');
    }
  });
});
