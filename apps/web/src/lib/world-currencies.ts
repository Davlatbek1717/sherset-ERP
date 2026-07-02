/**
 * ISO 4217 world-currency reference (numeric code + alpha code + Russian name) —
 * the source list for the «Валюты» ADD picker (/settings/currencies).
 *
 * moysklad's «Добавить валюту» lets you PICK a currency from a fixed reference
 * (auto-filling its code / iso-code / name) instead of free-typing — which is
 * exactly what let malformed rows (swapped code↔isoCode, latin names) get created.
 * Limited to the currencies the money layer (@moysklad/money) can actually format,
 * so we never offer one we can't render.
 *
 * Currency.code = ISO 4217 NUMERIC ("840"), Currency.isoCode = ISO 4217 ALPHA
 * ("USD") — moysklad's currency model. (Reference data, not a field LABEL — no
 * per-render DOM grounding needed; CLAUDE.md §4 covers labels, not list contents.)
 */

import { CURRENCIES, type CurrencyCode } from '@moysklad/money/currencies';

export interface WorldCurrency {
  /** Currency.code — ISO 4217 NUMERIC (e.g. "840"). */
  code: string;
  /** Currency.isoCode — ISO 4217 ALPHA (e.g. "USD"). */
  isoCode: CurrencyCode;
  /** Short Russian name (moysklad display, e.g. «доллар»). */
  name: string;
  /** Full Russian name (e.g. «Доллар США»). */
  fullName: string;
}

// Russian names (moysklad parity — the «Валюты» list/picker show Russian regardless
// of UI locale). USD=«доллар», UZS=«сум» match the existing imported rows.
const RU_NAMES: Record<CurrencyCode, { name: string; fullName: string }> = {
  UZS: { name: 'сум', fullName: 'Узбекский сум' },
  USD: { name: 'доллар', fullName: 'Доллар США' },
  EUR: { name: 'евро', fullName: 'Евро' },
  RUB: { name: 'рубль', fullName: 'Российский рубль' },
  KZT: { name: 'тенге', fullName: 'Казахстанский тенге' },
  CNY: { name: 'юань', fullName: 'Китайский юань' },
  GBP: { name: 'фунт стерлингов', fullName: 'Фунт стерлингов' },
  JPY: { name: 'иена', fullName: 'Японская иена' },
  CHF: { name: 'франк', fullName: 'Швейцарский франк' },
  TRY: { name: 'лира', fullName: 'Турецкая лира' },
};

export const WORLD_CURRENCIES: WorldCurrency[] = (Object.keys(CURRENCIES) as CurrencyCode[]).map(
  (c) => ({
    code: CURRENCIES[c].numericCode,
    isoCode: c,
    name: RU_NAMES[c].name,
    fullName: RU_NAMES[c].fullName,
  }),
);
