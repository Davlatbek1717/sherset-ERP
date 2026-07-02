'use server';

import { LOCALE_COOKIE, type Locale, isLocale } from '@/i18n/config';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

/**
 * Server action — switch the active locale by writing the NEXT_LOCALE cookie
 * and revalidating the current path so the new translations render.
 */
export async function setLocale(next: string): Promise<void> {
  if (!isLocale(next)) {
    throw new Error(`Invalid locale: ${next}`);
  }
  const c = await cookies();
  c.set(LOCALE_COOKIE, next satisfies Locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  // Revalidate root so all pages re-render with new messages
  revalidatePath('/', 'layout');
}
