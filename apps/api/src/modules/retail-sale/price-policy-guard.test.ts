import { describe, expect, it } from 'vitest';
import { checkSalePricePolicy } from './price-policy-guard.js';

/**
 * P12 — chekni post qilishdagi IKKI narx qoidasi (egasining qarori 2026-08-12).
 *
 *  1. **0-narx TAQIQ.** Prodda 488 tovarda chakana narx umuman yo'q (o'lchangan)
 *     ⇒ savatga tushsa 0 so'mlik qator bo'lib ketardi. Chek YOPILMAYDI.
 *  2. **Narx POLI.** Pozitsiya narxi (chek chegirmasidan KEYIN) `priceFloorMinor`
 *     dan past bo'lsa — rad. Ekrandagi qulf himoya emas: POS chetlab o'tilishi
 *     mumkin, haqiqiy chegara shu yerda.
 *
 * Qo'riqchi SOF — Prisma mock'siz sinaladi (`compute-positions.ts`,
 * `retail-tenders.ts` naqshi).
 */

const FLOORS = new Map([
  // Odatiy tovar: tan 800, chakana 1 000 ⇒ pol 800.
  ['p-normal', { costMinor: 80_000n, basePriceMinor: 100_000n }],
  // Tan narx yig'ilmagan ⇒ pol YO'Q (996 ta prod tovari shu holatda).
  ['p-nocost', { costMinor: null, basePriceMinor: 100_000n }],
  // Karta narxi tan narxdan past (46 tovar) ⇒ pol = karta narxi 350.
  ['p-inverted', { costMinor: 2_400_00n, basePriceMinor: 350_00n }],
]);

const line = (over: Partial<Parameters<typeof checkSalePricePolicy>[0][number]> = {}) => ({
  productId: 'p-normal',
  productName: 'Kabel VVG 3x2.5',
  quantity: '1',
  priceMinor: 100_000n,
  discount: '0',
  ...over,
});

describe('checkSalePricePolicy — 0-narx taqiqi', () => {
  it("narxsiz qator chekni yopishga qo'ymaydi", () => {
    const err = checkSalePricePolicy([line({ priceMinor: 0n })], FLOORS);
    expect(err).toContain('Kabel VVG 3x2.5');
    expect(err).toMatch(/narx/i);
  });

  it("tan narxi yo'q tovarda ham 0-narx taqiqlanadi (pol yo'qligi teshik emas)", () => {
    const err = checkSalePricePolicy([line({ productId: 'p-nocost', priceMinor: 0n })], FLOORS);
    expect(err).not.toBeNull();
  });

  it('100% chegirma ham 0-narx — qator tekin ketmaydi', () => {
    const err = checkSalePricePolicy([line({ productId: 'p-nocost', discount: '100' })], FLOORS);
    expect(err).not.toBeNull();
  });

  it("xizmat qatori (productId yo'q) ham narxsiz o'tmaydi", () => {
    const err = checkSalePricePolicy([line({ productId: null, priceMinor: 0n })], FLOORS);
    expect(err).not.toBeNull();
  });
});

describe('checkSalePricePolicy — narx poli', () => {
  it("pol ustidagi odatiy chek o'tadi", () => {
    expect(checkSalePricePolicy([line()], FLOORS)).toBeNull();
  });

  it('polga teng narx qabul qilinadi', () => {
    expect(checkSalePricePolicy([line({ priceMinor: 80_000n })], FLOORS)).toBeNull();
  });

  it('poldan past narx rad etiladi — xato matnida tovar nomi va minimal bor', () => {
    const err = checkSalePricePolicy([line({ priceMinor: 79_900n })], FLOORS);
    expect(err).toContain('Kabel VVG 3x2.5');
    expect(err).toContain('800');
  });

  it("tan narx NULL bo'lsa pol yo'q — past narx ham rad etilmaydi", () => {
    // NULL ≠ 0: yig'ilmagan tan narxdan chegara to'qib bo'lmaydi.
    expect(
      checkSalePricePolicy([line({ productId: 'p-nocost', priceMinor: 1_00n })], FLOORS),
    ).toBeNull();
  });

  it('karta narxi tan narxdan past tovarda karta narxi qabul qilinadi', () => {
    expect(
      checkSalePricePolicy([line({ productId: 'p-inverted', priceMinor: 350_00n })], FLOORS),
    ).toBeNull();
  });

  it("karta narxidan ham past bo'lsa rad etiladi (o'sha 46 tovar)", () => {
    expect(
      checkSalePricePolicy([line({ productId: 'p-inverted', priceMinor: 349_00n })], FLOORS),
    ).not.toBeNull();
  });

  it('chek chegirmasi polni buzsa rad etiladi', () => {
    // 1 000 so'm − 25% = 750 < pol 800.
    const err = checkSalePricePolicy([line({ discount: '25' })], FLOORS);
    expect(err).not.toBeNull();
  });

  it("polni buzmaydigan chegirma o'tadi", () => {
    expect(checkSalePricePolicy([line({ discount: '10' })], FLOORS)).toBeNull();
  });

  it('kartasi topilmagan pozitsiya polsiz — jimgina rad etilmaydi', () => {
    expect(
      checkSalePricePolicy([line({ productId: 'p-unknown', priceMinor: 1_00n })], FLOORS),
    ).toBeNull();
  });

  it('bir nechta buzilishda birinchi buzilgan qator xabar qiladi', () => {
    const err = checkSalePricePolicy(
      [line(), line({ productName: 'Rozetka', priceMinor: 10_00n })],
      FLOORS,
    );
    expect(err).toContain('Rozetka');
  });
});
