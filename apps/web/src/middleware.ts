import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE, defaultLocale, isLocale, locales } from './i18n/config';

/**
 * Cookie-based locale middleware.
 *
 * On every request:
 *   - If NEXT_LOCALE cookie is present + valid, do nothing
 *   - Otherwise, sniff Accept-Language and write the cookie
 *
 * No URL routing — same paths serve all locales. The locale resolver in
 * src/i18n/request.ts reads the cookie at render time.
 */
export function middleware(req: NextRequest) {
  const existing = req.cookies.get(LOCALE_COOKIE)?.value;
  if (existing && isLocale(existing)) {
    return NextResponse.next();
  }

  // Pick best-fit from Accept-Language
  const accept = req.headers.get('accept-language') ?? '';
  const accepted = accept
    .split(',')
    .map((t) => t.split(';')[0]?.trim().toLowerCase().split('-')[0] ?? '')
    .filter(Boolean);
  const picked =
    accepted.find((tag) => (locales as readonly string[]).includes(tag)) ?? defaultLocale;

  const res = NextResponse.next();
  res.cookies.set(LOCALE_COOKIE, picked, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
  return res;
}

export const config = {
  // Skip Next.js internals and static assets
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
