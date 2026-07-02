/**
 * Currency registry — ISO 4217 codes + minor-unit factor (how many minor units per major).
 *
 * Clone scope: Moysklad API returns currency as a Meta ref. We keep a static registry for
 * UI + validation; DB stores custom currencies too (linked via Currency entity, accountId-scoped).
 */

export type CurrencyCode =
  | 'UZS'
  | 'USD'
  | 'EUR'
  | 'RUB'
  | 'KZT'
  | 'CNY'
  | 'GBP'
  | 'JPY'
  | 'CHF'
  | 'TRY';

export interface CurrencyMeta {
  readonly code: CurrencyCode;
  readonly numericCode: string; // ISO 4217
  readonly name: string;
  readonly symbol: string;
  readonly minorUnit: number; // decimal places (2 for most, 0 for JPY)
  readonly multiplier: bigint; // 10^minorUnit
}

const meta = (
  code: CurrencyCode,
  numericCode: string,
  name: string,
  symbol: string,
  minorUnit: number,
): CurrencyMeta => ({
  code,
  numericCode,
  name,
  symbol,
  minorUnit,
  multiplier: 10n ** BigInt(minorUnit),
});

export const CURRENCIES: Readonly<Record<CurrencyCode, CurrencyMeta>> = Object.freeze({
  UZS: meta('UZS', '860', "O'zbek so'mi", "so'm", 2),
  USD: meta('USD', '840', 'US Dollar', '$', 2),
  EUR: meta('EUR', '978', 'Euro', '€', 2),
  RUB: meta('RUB', '643', 'Russian Ruble', '₽', 2),
  KZT: meta('KZT', '398', 'Kazakhstani Tenge', '₸', 2),
  CNY: meta('CNY', '156', 'Chinese Yuan', '¥', 2),
  GBP: meta('GBP', '826', 'British Pound', '£', 2),
  JPY: meta('JPY', '392', 'Japanese Yen', '¥', 0),
  CHF: meta('CHF', '756', 'Swiss Franc', 'CHF', 2),
  TRY: meta('TRY', '949', 'Turkish Lira', '₺', 2),
});

export function getCurrency(code: CurrencyCode): CurrencyMeta {
  const meta = CURRENCIES[code];
  if (!meta) {
    throw new Error(`Unknown currency: ${code}`);
  }
  return meta;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}
