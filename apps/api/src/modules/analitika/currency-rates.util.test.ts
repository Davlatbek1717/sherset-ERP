import { describe, expect, it, vi } from 'vitest';
import { loadSalePriceRates } from './currency-rates.util.js';

/**
 * Hisobot uchun valyuta kurslarini yuklash.
 *
 * Narx `currencyCode` bilan saqlanishi mumkin (2026-08-23), shuning uchun
 * hisobotlar ham kursni bilishi kerak. Baza valyutasi ATAYLAB tashlab
 * yuboriladi: uning kursi 1 va jadvalga qo'shilsa «bazani bazaga o'girish»
 * degan ortiqcha yo'l ochiladi.
 *
 * `multiplicity` Prisma'da `Int`, `rateValue` esa `BigInt` — ikkalasi
 * `@moysklad/money` kutgan BigInt shakliga keltiriladi (aralashtirilsa
 * o'girish jimgina noto'g'ri chiqadi).
 */
describe('loadSalePriceRates', () => {
  const client = (rows: unknown[]) =>
    ({ currency: { findMany: vi.fn(async () => rows) } }) as never;

  it("kodlar bo'yicha xarita quradi va tiplarni BigInt ga keltiradi", async () => {
    const rates = await loadSalePriceRates(
      client([{ code: 'USD', rateValue: 1_200_000_000_000n, multiplicity: 1, indirect: false }]),
      'acc',
    );
    expect(rates.USD).toEqual({
      rateValue: 1_200_000_000_000n,
      multiplicity: 1n,
      indirect: false,
    });
  });

  it('«кратность» va teskari kurs saqlanadi', async () => {
    const rates = await loadSalePriceRates(
      client([{ code: 'RUB', rateValue: 100_000_000n, multiplicity: 100, indirect: true }]),
      'acc',
    );
    expect(rates.RUB?.multiplicity).toBe(100n);
    expect(rates.RUB?.indirect).toBe(true);
  });

  it("valyuta bo'lmasa bo'sh xarita", async () => {
    expect(await loadSalePriceRates(client([]), 'acc')).toEqual({});
  });

  it("faqat baza BO'LMAGAN valyutalar so'raladi", async () => {
    const c = { currency: { findMany: vi.fn(async () => []) } };
    await loadSalePriceRates(c as never, 'acc-7');
    expect(c.currency.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: 'acc-7', default: false }),
      }),
    );
  });
});
