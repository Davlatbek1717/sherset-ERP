import { describe, expect, it } from 'vitest';
import { pickSalePriceMinor } from './sale-price.util.js';

/**
 * Hisobotlarda tovar sotuv narxi — valyutali narx JORIY kurs bilan bazaga
 * o'giriladi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): tovar kartasi har narx qatoriga valyuta
 * tanlatadi va uni `currencyCode` bilan saqlaydi, lekin BIROR o'quvchi uni
 * o'qimasdi — na ekran, na hisobot. «Розничная = 10 доллар» tovar hisobotda
 * 10 SO'M bo'lib chiqardi (~12 000× xato). Egasining qarori: kurs bilan
 * o'qilsin. O'girish `@moysklad/money` dagi ANIQ formula bilan — ya'ni web
 * bilan bir xil arifmetika (кратность + teskari kurs, oxirida bitta
 * yaxlitlash).
 *
 * ⚠️ Chegara (hujjatlangan): kursi noma'lum valyuta 0 bo'lib qaytadi. Bu
 * «narx yo'q» bilan bir xil ko'rinadi — hisobotda bu qiymat kamaytiradi,
 * lekin xom sonni o'tkazish (12 000× oshirib yuborish) bundan battar bo'lardi.
 */
describe('pickSalePriceMinor — valyuta', () => {
  const id = 'pt-1';
  // 1 USD = 12 000 UZS
  const rates = { USD: { rateValue: 12_000n * 100_000_000n, multiplicity: 1n, indirect: false } };

  it('valyutasiz narx tegilmaydi', () => {
    expect(pickSalePriceMinor([{ priceTypeId: id, value: '4500000' }], id, rates)).toBe(4500000n);
  });

  it("USD narx kurs bilan so'mga o'giriladi", () => {
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'USD' }];
    expect(pickSalePriceMinor(sp, id, rates)).toBe(12000000n);
  });

  it("kursi noma'lum valyuta 0 (xom son O'TKAZILMAYDI)", () => {
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'EUR' }];
    expect(pickSalePriceMinor(sp, id, rates)).toBe(0n);
  });

  it('kurs jadvali berilmasa valyutali narx 0', () => {
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'USD' }];
    expect(pickSalePriceMinor(sp, id)).toBe(0n);
  });

  it("mavjud xulq saqlanadi: narx yo'q → 0, buzuq qiymat → 0", () => {
    expect(pickSalePriceMinor([], id)).toBe(0n);
    expect(pickSalePriceMinor(null, id)).toBe(0n);
    expect(pickSalePriceMinor([{ priceTypeId: id, value: 'abc' }], id)).toBe(0n);
  });
});
