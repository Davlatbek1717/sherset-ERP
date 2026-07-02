import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, type Locale, defaultLocale, isLocale, locales } from './config';

/**
 * Resolve the active locale for the current request.
 *
 * Strategy (highest priority first):
 *   1. NEXT_LOCALE cookie (user explicitly chose a language)
 *   2. Accept-Language header best-fit
 *   3. defaultLocale fallback
 */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const hdrs = await headers();
  const accept = hdrs.get('accept-language') ?? '';
  // Crude best-fit: scan accept-language tags for the first match against locales
  const accepted = accept
    .split(',')
    .map((tag) => tag.split(';')[0]?.trim().toLowerCase().split('-')[0] ?? '')
    .filter(Boolean);
  for (const tag of accepted) {
    if (isLocale(tag)) return tag;
  }
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  // Dynamic import keeps the message bundle tree-shakeable per locale. (In dev,
  // edits to the JSON may need a server recompile to bust the module cache —
  // touch this file to force it.)
  const messages = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    // Hour:minute, day-month-year defaults aligned to UZ conventions
    formats: {
      dateTime: {
        short: { day: '2-digit', month: '2-digit', year: 'numeric' },
        long: { day: '2-digit', month: 'long', year: 'numeric' },
      },
    },
  };
});

export { locales, defaultLocale };
