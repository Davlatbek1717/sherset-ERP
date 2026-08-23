import { describe, expect, it } from 'vitest';
import {
  resolveDefaultSalePrice,
  resolveDefaultSalePriceOrZero,
  resolveSalePriceByType,
  resolveWholesaleSalePrice,
} from './sale-price';

describe('resolveDefaultSalePrice', () => {
  const realId = '712de53f-3bd4-4ec9-a009-14266b5c0671';

  it('matches the real default price-type id when known', () => {
    const sp = [
      { priceTypeId: 'c98c-wholesale', value: '999' },
      { priceTypeId: realId, value: '500' },
    ];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('500');
  });

  it('falls back to the legacy "default" sentinel when the id is unknown', () => {
    const sp = [{ priceTypeId: 'default', value: '300' }];
    expect(resolveDefaultSalePrice(sp)).toBe('300');
    // also when an id is passed but not present (mid-migration data)
    expect(resolveDefaultSalePrice(sp, realId)).toBe('300');
  });

  it('falls back to the first entry when neither id nor sentinel match', () => {
    const sp = [{ priceTypeId: 'some-other-id', value: '700' }];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('700');
  });

  it('returns null for empty / missing prices', () => {
    expect(resolveDefaultSalePrice([])).toBeNull();
    expect(resolveDefaultSalePrice(null)).toBeNull();
    expect(resolveDefaultSalePrice(undefined)).toBeNull();
  });

  it('OrZero variant yields "0" instead of null', () => {
    expect(resolveDefaultSalePriceOrZero(null)).toBe('0');
    expect(resolveDefaultSalePriceOrZero([{ priceTypeId: 'default', value: '42' }])).toBe('42');
  });

  it('prefers the real id over the sentinel when both are present', () => {
    const sp = [
      { priceTypeId: 'default', value: '111' },
      { priceTypeId: realId, value: '222' },
    ];
    expect(resolveDefaultSalePrice(sp, realId)).toBe('222');
  });
});

/**
 * Valyutali narx — JORIY kurs bilan baza valyutasiga o'giriladi.
 *
 * 🔴 Bug-class (2026-08-23 auditi): tovar formasi har narx qatoriga valyuta
 * tanlatadi va uni `currencyCode` bilan saqlaydi, LEKIN birorta o'quvchi uni
 * o'qimasdi — na POS, na hujjatlar, na hisobotlar. Ya'ni «Розничная = 10
 * доллар» deb qo'yilgan tovar kassada 10 SO'Mga sotilardi (~12 000× arzon).
 * Server sxemasi buni ochiq tan olgan: «stored amount is as-entered in this
 * currency; downstream cost math assumes base».
 *
 * Egasining qarori (2026-08-23): kurs bilan o'qilsin — narx kurs bilan birga
 * o'zgaradi. O'girish `@moysklad/money` dagi ANIQ formula orqali
 * (`toBaseMinor`: ×10^8 kurs + «кратность» + teskari kotirovka, oxirida bitta
 * yaxlitlash) — hisobotlar bilan AYNAN bir xil arifmetika.
 *
 * ⚠️ Kursi NOMA'LUM valyuta → `null` («hisobga olinmaydi»), xom son EMAS:
 * xom sonni qaytarish aynan o'sha 12 000× xatoni qayta tug'diradi. Bu
 * loyihaning mavjud shartnomasi bilan bir xil («kursi yo'q pul jamiga
 * qo'shilmaydi»).
 *
 * Bugungi ma'lumotda birorta narxda valyuta YO'Q (lokal bazada 9411 yozuv,
 * hammasi bo'sh) — ya'ni bu qoida oldinga qarab ishlaydi.
 */
describe('sale price — valyuta konvertatsiyasi', () => {
  const id = 'pt-1';
  // 1 USD = 12 000 UZS → ×10^8 shkalada.
  const rates = {
    base: 'UZS',
    loaded: true,
    byCode: {
      UZS: { rateValue: 100_000_000n.toString() },
      USD: { rateValue: (12_000n * 100_000_000n).toString() },
    },
  };

  it('valyutasiz qiymat tegilmaydi (baza valyutasi)', () => {
    expect(resolveDefaultSalePrice([{ priceTypeId: id, value: '4500000' }], id, rates)).toBe(
      '4500000',
    );
  });

  it("USD narx joriy kurs bilan so'mga o'giriladi", () => {
    // 10 dollar = 1000 tsent → 1000 × 12 000 = 12 000 000 tiyin (120 000 so'm)
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'USD' }];
    expect(resolveDefaultSalePrice(sp, id, rates)).toBe('12000000');
  });

  it("kursi noma'lum valyuta → null (xom son QAYTARILMAYDI)", () => {
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'EUR' }];
    expect(resolveDefaultSalePrice(sp, id, rates)).toBeNull();
    expect(resolveDefaultSalePriceOrZero(sp, id, rates)).toBe('0');
  });

  it('kurs jadvali umuman berilmasa ham valyutali narx null', () => {
    const sp = [{ priceTypeId: id, value: '1000', currencyCode: 'USD' }];
    expect(resolveDefaultSalePrice(sp, id)).toBeNull();
  });

  /**
   * Server sxemasida `currencyCode` MAJBURIY va sukut qiymati `'UZS'`
   * (`SalePriceSchema`), ya'ni saqlanadigan HAR BIR yangi narxda kod bo'ladi.
   * Agar baza valyutasi «noma'lum» hisoblansa, oddiy so'mlik narx ham
   * ekrandan yo'qolardi — shu sabab baza kodi alohida bilinadi.
   */
  it("baza valyutasi (UZS) o'girilmaydi — qiymat aynan qoladi", () => {
    const sp = [{ priceTypeId: id, value: '4500000', currencyCode: 'UZS' }];
    expect(resolveDefaultSalePrice(sp, id, rates)).toBe('4500000');
  });

  /**
   * Jadval hali kelmagan oyna: qiymat XOMLIGICHA ko'rsatiladi (kechagi xulq).
   * Muqobili — har sahifa yuklanishida barcha narxlarni bo'shatib qo'yish.
   */
  it("jadval yuklanmagan bo'lsa qiymat xomligicha ko'rsatiladi", () => {
    const loading = { base: null, loaded: false, byCode: {} };
    const sp = [{ priceTypeId: id, value: '4500000', currencyCode: 'UZS' }];
    expect(resolveDefaultSalePrice(sp, id, loading)).toBe('4500000');
  });

  it("optom qavat ham xuddi shunday o'giriladi", () => {
    const sp = [{ priceTypeId: 'wholesale', value: '500', currencyCode: 'USD' }];
    expect(resolveWholesaleSalePrice(sp, null, rates)).toBe('6000000');
  });
});

/**
 * «Расценить» — TANLANGAN narx qavati bo'yicha qayta narxlash.
 *
 * 🔴 2026-08-23: 13 ta hujjat sahifasi bu ishni `salePrices.find(...)?.value`
 * bilan XOM qilardi, ya'ni valyuta konvertatsiyasini butunlay chetlab o'tardi —
 * aynan resolver shartnomasi to'sib turgan «10 dollar = 10 so'm» yo'li,
 * boshqa eshikdan. Endi tanlash ham shu yerda, o'girish ham.
 */
describe('resolveSalePriceByType', () => {
  const rates = {
    base: 'UZS',
    loaded: true,
    byCode: {
      UZS: { rateValue: 100_000_000n.toString() },
      USD: { rateValue: (12_000n * 100_000_000n).toString() },
    },
  };

  it('tanlangan qavat qiymatini beradi', () => {
    const sp = [
      { priceTypeId: 'pt-1', value: '100' },
      { priceTypeId: 'pt-2', value: '200' },
    ];
    expect(resolveSalePriceByType(sp, 'pt-2', rates)).toBe('200');
  });

  it("valyutali qavat kurs bilan o'giriladi", () => {
    const sp = [{ priceTypeId: 'pt-1', value: '1000', currencyCode: 'USD' }];
    expect(resolveSalePriceByType(sp, 'pt-1', rates)).toBe('12000000');
  });

  it("kursi noma'lum valyuta → null (qator narxi O'ZGARMAYDI)", () => {
    const sp = [{ priceTypeId: 'pt-1', value: '1000', currencyCode: 'EUR' }];
    expect(resolveSalePriceByType(sp, 'pt-1', rates)).toBeNull();
  });

  it('qavat topilmasa null — chaqiruvchi qatorga tegmasligi uchun', () => {
    expect(resolveSalePriceByType([{ priceTypeId: 'pt-1', value: '1' }], 'pt-9', rates)).toBeNull();
    expect(resolveSalePriceByType(null, 'pt-1', rates)).toBeNull();
  });
});
