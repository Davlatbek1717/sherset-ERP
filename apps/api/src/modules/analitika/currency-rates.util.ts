import type { Prisma } from '@moysklad/db';
import type { SalePriceRates } from './sale-price.util.js';

/** Faqat valyuta jadvalini o'qiy oladigan mijoz (to'liq client ham, tx ham). */
type CurrencyClient = Pick<Prisma.TransactionClient, 'currency'>;

/**
 * Hisobga olish valyutasiga o'girish uchun akkauntning valyuta kurslari.
 *
 * Tovar narxi `currencyCode` bilan saqlanishi mumkin (2026-08-23 auditi:
 * ilgari bu maydonni birorta o'quvchi o'qimasdi va «10 доллар» hisobotda
 * 10 so'm bo'lib chiqardi). Baza valyutasining O'ZI xaritaga qo'shilmaydi —
 * valyutasi ko'rsatilmagan narx allaqachon bazada deb qabul qilinadi.
 *
 * `multiplicity` sxemada `Int`, `rateValue` esa `BigInt`; `@moysklad/money`
 * ikkalasini ham BigInt kutadi, shuning uchun keltirish shu yerda — bir joyda.
 */
export async function loadSalePriceRates(
  client: CurrencyClient,
  accountId: string,
): Promise<SalePriceRates> {
  const rows = await client.currency.findMany({
    where: { accountId, default: false },
    select: { code: true, rateValue: true, multiplicity: true, indirect: true },
  });
  const out: Record<string, { rateValue: bigint; multiplicity: bigint; indirect: boolean }> = {};
  for (const r of rows) {
    out[r.code] = {
      rateValue: r.rateValue,
      multiplicity: BigInt(r.multiplicity),
      indirect: r.indirect,
    };
  }
  return out;
}
