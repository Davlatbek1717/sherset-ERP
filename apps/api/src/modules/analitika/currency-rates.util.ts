import type { Prisma } from '@moysklad/db';
import type { SalePriceRates } from './sale-price.util.js';

/** Faqat valyuta jadvalini o'qiy oladigan mijoz (to'liq client ham, tx ham). */
type CurrencyClient = Pick<Prisma.TransactionClient, 'currency'>;

/**
 * Hisobga olish valyutasiga o'girish uchun akkauntning valyuta kurslari.
 *
 * Tovar narxi `currencyCode` bilan saqlanishi mumkin (2026-08-23 auditi:
 * ilgari bu maydonni birorta o'quvchi o'qimasdi va «10 доллар» hisobotda
 * 10 so'm bo'lib chiqardi).
 *
 * Baza valyutasi ham xaritaga KIRADI va alohida `base` sifatida qaytadi:
 * server sxemasi `currencyCode` ni majburiy qilib sukut `'UZS'` yozadi, ya'ni
 * oddiy so'mlik narxda ham kod bo'ladi — bazani bilmasak u «noma'lum valyuta»
 * bo'lib 0 ga aylanardi.
 *
 * `multiplicity` sxemada `Int`, `rateValue` esa `BigInt`; `@moysklad/money`
 * ikkalasini ham BigInt kutadi, shuning uchun keltirish shu yerda — bir joyda.
 */
export async function loadSalePriceRates(
  client: CurrencyClient,
  accountId: string,
): Promise<SalePriceRates> {
  const rows = await client.currency.findMany({
    where: { accountId },
    select: { code: true, rateValue: true, multiplicity: true, indirect: true, default: true },
  });
  const byCode: Record<string, { rateValue: bigint; multiplicity: bigint; indirect: boolean }> = {};
  let base: string | null = null;
  for (const r of rows) {
    if (r.default) base = r.code;
    byCode[r.code] = {
      rateValue: r.rateValue,
      multiplicity: BigInt(r.multiplicity),
      indirect: r.indirect,
    };
  }
  return { base, byCode };
}
