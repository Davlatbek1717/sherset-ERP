/**
 * i18n configuration shared between client and server.
 *
 * Locale strategy:
 *   - Cookie-based (NEXT_LOCALE), no URL prefix
 *   - Default: uz (Uzbek-latin) — primary market
 *   - Available: uz, ru (English deferred to a later sprint)
 *
 * Locale resolution priority (server):
 *   1. NEXT_LOCALE cookie
 *   2. Accept-Language header (best-fit match)
 *   3. defaultLocale ('uz')
 */

export const locales = ['uz', 'ru'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'uz';

export const localeMeta: Record<Locale, { label: string; nativeLabel: string; flag: string }> = {
  uz: { label: 'Uzbek', nativeLabel: "O'zbek", flag: '🇺🇿' },
  ru: { label: 'Russian', nativeLabel: 'Русский', flag: '🇷🇺' },
};

export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
