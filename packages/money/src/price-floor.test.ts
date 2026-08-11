import { describe, expect, it } from 'vitest';
import { lineFloorBreach, priceFloorMinor } from './price-floor.js';

/**
 * P12 — NARX POLI (egasining qarori, 2026-08-11/12).
 *
 * Pol = tovarning sotib olingan narxi (`buyPrice`). Ikki qirrali holat egasidan
 * so'ralib hal qilindi (prodda 46 tovarda karta chakana narxining O'ZI tan
 * narxdan past — import xatosi): **pol = min(tan, karta chakana narxi)** — ya'ni
 * karta narxida sotish har doim mumkin, undan pastga esa yo'q.
 *
 * 🔴 NULL ≠ 0 (`retail-cost-freeze-null-contract`): tan narx NULL = «yig'ilmagan»
 * ⇒ pol YO'Q. Uni «pol = 0» deb o'qish 996 ta tovarni jimgina 0 so'mga ochib
 * berardi (prodda o'lchangan son).
 */
describe('priceFloorMinor', () => {
  it("tan narx NULL bo'lsa pol YO'Q — NULL nol emas", () => {
    expect(priceFloorMinor({ costMinor: null, basePriceMinor: 1_000_00n })).toBeNull();
  });

  it("tan narx 0 bo'lsa pol 0 — «yig'ilgan va haqiqatan nol»", () => {
    expect(priceFloorMinor({ costMinor: 0n, basePriceMinor: 1_000_00n })).toBe(0n);
  });

  it("karta chakana narxi yo'q bo'lsa pol = tan narx", () => {
    expect(priceFloorMinor({ costMinor: 800_00n, basePriceMinor: null })).toBe(800_00n);
  });

  it('odatiy tovarda (chakana > tan) pol = tan narx', () => {
    expect(priceFloorMinor({ costMinor: 800_00n, basePriceMinor: 1_000_00n })).toBe(800_00n);
  });

  it("karta narxi tan narxdan PAST bo'lsa pol = karta narxi (46 tovar holati)", () => {
    // Prod namunasi: «Rubilnik seriy 400A» — chakana 35 000 < tan 245 000.
    // Egasining qarori: bunday tovar o'z karta narxida sotilaveradi.
    expect(priceFloorMinor({ costMinor: 245_000_00n, basePriceMinor: 35_000_00n })).toBe(
      35_000_00n,
    );
  });

  it("ikkalasi ham NULL bo'lsa pol YO'Q", () => {
    expect(priceFloorMinor({ costMinor: null, basePriceMinor: null })).toBeNull();
  });
});

describe('lineFloorBreach', () => {
  const line = (over: Partial<Parameters<typeof lineFloorBreach>[0]> = {}) =>
    lineFloorBreach({
      quantity: '1',
      priceMinor: 1_000_00n,
      discount: '0',
      floorMinor: 800_00n,
      ...over,
    });

  it('pol ustidagi narx buzilish EMAS', () => {
    expect(line()).toBeNull();
  });

  it("polga TENG narx buzilish emas — pol o'zi ruxsat etilgan", () => {
    expect(line({ priceMinor: 800_00n })).toBeNull();
  });

  it('poldan past narx buzilish — qator jamlari bilan qaytadi', () => {
    expect(line({ priceMinor: 799_00n, quantity: '3' })).toEqual({
      effectiveLineMinor: 799_00n * 3n,
      floorLineMinor: 800_00n * 3n,
    });
  });

  it("pol YO'Q bo'lsa (tan narx NULL) 0 narx ham buzilish emas", () => {
    // 0-narx himoyasi ALOHIDA qoida — bu funksiya faqat polni biladi.
    expect(line({ floorMinor: null, priceMinor: 0n })).toBeNull();
  });

  it('chek chegirmasi narxni pol ostiga tushirsa — buzilish (egasining qarori: TAQIQ)', () => {
    // 1 000 so'm − 25% = 750 so'm < pol 800 so'm. Qator narxining o'zi pol
    // ustida turgani uchun buzilish faqat chegirmadan keyin ko'rinadi.
    expect(line({ discount: '25' })).toEqual({
      effectiveLineMinor: 750_00n,
      floorLineMinor: 800_00n,
    });
  });

  it("polni buzmaydigan chegirma o'tadi", () => {
    expect(line({ discount: '10' })).toBeNull();
  });

  it('kasr miqdorda pol jamisi qator jamisi bilan bir xil yaxlitlanadi', () => {
    // 1.5 kg × 799 so'm = 1 198,50 so'm; pol 1.5 × 800 = 1 200 so'm.
    expect(line({ quantity: '1.5', priceMinor: 799_00n })).toEqual({
      effectiveLineMinor: 119_850n,
      floorLineMinor: 120_000n,
    });
  });
});
