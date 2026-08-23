import { productRowFields, replaceRowProductPatch } from '@/lib/product-row-fields';
import { describe, expect, it } from 'vitest';

/**
 * Qatorga tovar qo'yish/almashtirish — tovardan keladigan maydonlar YAGONA
 * joydan.
 *
 * 🔴 Bug-class (2026-08-23 auditi): `supplies/new` da qatordagi tovarni
 * «Заменить» qilganda faqat 5 maydon yangilanardi (`assortmentId`,
 * `productLabel`, `productUom`, `priceMinor`, `vat`). Qolganlari — `stock`,
 * `salePrices`, `productCode`, `imageUrl` va eng muhimi **`cellId`/`cell`** —
 * ESKI tovardan qolardi. Ya'ni A tovar «Zona1/A-05» yacheykasiga bog'langan
 * qatorda B tovar tanlansa, post paytida B tovar A ning YACHEYKASIGA yozilardi;
 * «Остаток» ustuni ham A ning qoldig'ini ko'rsatib turardi. Boshqa sahifalar
 * (purchase-orders, invoices-out, customer-orders) 10-12 maydonni yangilardi —
 * ya'ni bitta amal sahifadan sahifaga har xil edi.
 *
 * Yacheyka ALMASHTIRISHDA tozalanadi: u eski tovar uchun tanlangan bo'ladi,
 * jimgina meros qilib qoldirish — omborda noto'g'ri joyga yozish demak.
 */

const RAW = {
  code: '05107',
  uom: 'шт',
  buyPrice: '1500000',
  vat: 12,
  stock: { onHand: '10', reserved: '2', available: '8', inTransit: '1' },
  salePrices: [{ priceTypeId: 'pt-1', value: '2000000' }],
  productFolder: { id: 'f-1', name: 'Kabellar', pathName: 'Elektr/Kabellar' },
  mainImageId: 'img-1',
};

describe('productRowFields', () => {
  it('tovardan keladigan hamma maydonni beradi', () => {
    const f = productRowFields({ id: 'p-9', primary: 'Kabel VVG', raw: RAW });
    expect(f).toMatchObject({
      assortmentId: 'p-9',
      productLabel: 'Kabel VVG',
      productCode: '05107',
      productUom: 'шт',
      vat: '12',
      stock: '10',
      reserve: '2',
      available: '8',
      folderPath: 'Elektr/Kabellar',
    });
    expect(f.salePrices).toEqual(RAW.salePrices);
  });

  it("bo'sh tovarda ham yiqilmaydi", () => {
    const f = productRowFields({ id: 'p-1', primary: 'X' });
    expect(f.assortmentId).toBe('p-1');
    expect(f.productUom).toBeNull();
    expect(f.salePrices).toBeNull();
  });

  it("nomi React tuguni bo'lsa ham satrga aylanadi", () => {
    expect(productRowFields({ id: 'p-1', primary: 42 as unknown as string }).productLabel).toBe(
      '42',
    );
  });
});

describe('replaceRowProductPatch', () => {
  it('yacheykani TOZALAYDI — eski tovarnikini meros qilmaydi', () => {
    const patch = replaceRowProductPatch({ id: 'p-9', primary: 'Kabel', raw: RAW });
    expect(patch.cellId).toBeUndefined();
    expect(patch.cell).toBeUndefined();
    // Kalitlar MAVJUD bo'lishi shart: patch spread qilinadi, ya'ni kalit
    // bo'lmasa eski yacheyka o'z joyida qolardi.
    expect('cellId' in patch).toBe(true);
    expect('cell' in patch).toBe(true);
  });

  it('qolgan maydonlar tovardan keladi', () => {
    const patch = replaceRowProductPatch({ id: 'p-9', primary: 'Kabel', raw: RAW });
    expect(patch).toMatchObject({ productCode: '05107', stock: '10', available: '8' });
  });
});
