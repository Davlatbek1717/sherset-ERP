import { describe, expect, it } from 'vitest';
import { checkSalePricePolicy } from './price-policy-guard.js';

/**
 * 🔴 2026-08-16, egasining qarori: KASSADA NARX CHEKLOVI YO'Q.
 *
 * P12 da yoqilgan ikki qoida (0-narx taqiqi va narx poli) O'CHIRILDI —
 * `price-policy-guard.ts` → `PRICE_POLICY_ENFORCED = false`. Kassir istalgan
 * narxda, shu jumladan BEPULGA sotadi.
 *
 * Bu testlar shu shartnomani QULFLAYDI: ilgari rad etilgan har bir holat endi
 * `null` (ya'ni «to'siq yo'q») qaytarishi shart. Agar kimdir qoidani
 * bilmasdan qayta yoqsa — bu fayl darhol qizil bo'ladi.
 *
 * Pol MATEMATIKASI o'chirilmadi va o'z testlari bilan qoplangan
 * (`packages/money/src/price-floor.test.ts`) — qoida qaytarilsa bayroqni
 * `true` qilish kifoya.
 */

const FLOORS = new Map([
  // Odatiy tovar: tan 800, chakana 1 000 ⇒ pol bo'lsa 800 bo'lardi.
  ['p-normal', { costMinor: 80_000n, basePriceMinor: 100_000n }],
  // Tan narx yig'ilmagan.
  ['p-nocost', { costMinor: null, basePriceMinor: 100_000n }],
  // Karta narxi tan narxdan past (prodda 46 tovar).
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

describe('checkSalePricePolicy — cheklov O`CHIRILGAN (2026-08-16)', () => {
  it('0 so`mlik qator chekni YOPADI — bepul sotish ruxsat etilgan', () => {
    expect(checkSalePricePolicy([line({ priceMinor: 0n })], FLOORS)).toBeNull();
  });

  it('100% chegirma ham to`smaydi', () => {
    expect(checkSalePricePolicy([line({ discount: '100' })], FLOORS)).toBeNull();
  });

  it('xizmat qatori (productId yo`q) narxsiz o`tadi', () => {
    expect(checkSalePricePolicy([line({ productId: null, priceMinor: 0n })], FLOORS)).toBeNull();
  });

  it('tan narxdan past narx o`tadi', () => {
    expect(checkSalePricePolicy([line({ priceMinor: 79_900n })], FLOORS)).toBeNull();
  });

  it('karta narxidan ham past narx o`tadi (o`sha 46 tovar)', () => {
    expect(
      checkSalePricePolicy([line({ productId: 'p-inverted', priceMinor: 1n })], FLOORS),
    ).toBeNull();
  });

  it('chegirma polni buzsa ham chek qabul qilinadi', () => {
    expect(checkSalePricePolicy([line({ discount: '25' })], FLOORS)).toBeNull();
  });

  it('manfiy narx ham to`silmaydi — hech qanday cheklov qo`yilmagan', () => {
    expect(checkSalePricePolicy([line({ priceMinor: -100n })], FLOORS)).toBeNull();
  });

  it('bir nechta muammoli qator ham o`tadi', () => {
    expect(
      checkSalePricePolicy(
        [line({ priceMinor: 0n }), line({ productName: 'Rozetka', priceMinor: 10_00n })],
        FLOORS,
      ),
    ).toBeNull();
  });

  it('odatiy, muammosiz chek avvalgidek o`tadi', () => {
    expect(checkSalePricePolicy([line()], FLOORS)).toBeNull();
  });
});
