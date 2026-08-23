import { type CurrencyRate, toBaseMinor } from '@moysklad/money';

/**
 * Pick a product's sale price (minor units) from its `salePrices` JSON.
 * Prefers the account's default price type; falls back to the first listed
 * price; 0 when the product has no prices. Pure — no DB access.
 *
 * salePrices shape (moysklad): `[{ priceTypeId, value, currencyCode? }]` where
 * value is a minor-unit string (tiyin) IN `currencyCode` — the account's base
 * currency when that field is absent.
 */
export type SalePricesJson =
  | Array<{ priceTypeId?: string; value?: string; currencyCode?: string | null }>
  | null
  | undefined;

/** Valyuta kodi → kurs ma'lumoti (hisobga olish valyutasining O'ZI bo'lmaydi). */
export type SalePriceRates = Readonly<Record<string, CurrencyRate>>;

/**
 * `rates` berilsa, valyutali narx JORIY kurs bilan baza valyutasiga o'giriladi
 * (`@moysklad/money` dagi aniq formula — web bilan AYNAN bir xil arifmetika).
 *
 * 🔴 2026-08-23 auditi: tovar kartasi narx qatoriga valyuta tanlatadi va uni
 * saqlaydi, lekin birorta o'quvchi uni o'qimasdi — «10 доллар» hisobotda
 * 10 so'm bo'lib chiqardi. Egasining qarori: kurs bilan o'qilsin.
 *
 * ⚠️ Hujjatlangan chegara: kursi NOMA'LUM valyuta `0n` qaytaradi, ya'ni
 * hisobotda «narx yo'q» bilan bir xil ko'rinadi va jamini kamaytiradi. Xom
 * sonni o'tkazish (12 000× oshirib yuborish) bundan battar bo'lgani uchun
 * ataylab shunday; kurs qo'yilishi bilan qiymat o'z-o'zidan to'g'rilanadi.
 */
export function pickSalePriceMinor(
  salePrices: SalePricesJson,
  defaultPriceTypeId?: string | null,
  rates?: SalePriceRates,
): bigint {
  const prices = salePrices ?? [];
  const chosen =
    (defaultPriceTypeId ? prices.find((p) => p.priceTypeId === defaultPriceTypeId) : undefined) ??
    prices[0];
  let minor: bigint;
  try {
    minor = BigInt(chosen?.value ?? '0');
  } catch {
    return 0n;
  }
  const code = chosen?.currencyCode;
  if (!code) return minor;
  const rate = rates?.[code];
  if (!rate) return 0n;
  return toBaseMinor(minor, rate);
}
