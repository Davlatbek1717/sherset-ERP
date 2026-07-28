'use client';

/**
 * Last-resort error boundary (MASTER-TODO #144).
 *
 * Fires only when the ROOT layout itself throws — i.e. before/while
 * `NextIntlClientProvider` mounts. Next.js replaces the entire document, so
 * this component must render its own `<html>`/`<body>` and cannot use
 * `useTranslations` (there is no provider above it, by construction).
 *
 * i18n is therefore done by hand: read the same `NEXT_LOCALE` cookie the
 * server resolver uses (`src/i18n/request.ts`) and pick from the dictionary
 * below. The strings are VERBATIM copies of `errors.*` in
 * `src/messages/{ru,uz}.json`; `__tests__/global-error-i18n.test.ts` locks them
 * to the message files so they cannot drift.
 */

import { LOCALE_COOKIE, defaultLocale, isLocale } from '@/i18n/config';
import { useEffect, useState } from 'react';
import './globals.css';

/** VERBATIM mirror of `errors.*` — kept in sync by global-error-i18n.test.ts. */
export const GLOBAL_ERROR_STRINGS = {
  uz: {
    crash_title: "Nimadir noto'g'ri ketdi",
    crash_hint: "Sahifani ochib bo'lmadi. Ma'lumotlaringiz yo'qolmadi — qayta urinib ko'ring.",
    retry: 'Qayta urinish',
  },
  ru: {
    crash_title: 'Что-то пошло не так',
    crash_hint: 'Не удалось открыть страницу. Ваши данные не потеряны — попробуйте ещё раз.',
    retry: 'Повторить',
  },
} as const;

function readLocale(): keyof typeof GLOBAL_ERROR_STRINGS {
  if (typeof document === 'undefined') return defaultLocale;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return isLocale(raw) ? raw : defaultLocale;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Cookie is only readable on the client — start from the default so the
  // server-rendered markup and the first client paint agree (no hydration
  // mismatch), then correct it.
  const [locale, setLocale] = useState<keyof typeof GLOBAL_ERROR_STRINGS>(defaultLocale);
  useEffect(() => setLocale(readLocale()), []);
  useEffect(() => {
    console.error('[global-error-boundary]', error);
  }, [error]);

  const s = GLOBAL_ERROR_STRINGS[locale];

  return (
    <html lang={locale}>
      <body>
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          data-test-id="global-error-boundary"
          role="alert"
        >
          <h1 className="mb-2 font-semibold text-[20px] text-[var(--ms-text-primary)]">
            {s.crash_title}
          </h1>
          <p className="mb-5 max-w-[460px] text-[13px] text-[var(--ms-text-muted)] leading-relaxed">
            {s.crash_hint}
          </p>
          {/* Plain <button>: the design-system Button pulls the provider tree
              this boundary exists precisely to survive without. */}
          <button
            type="button"
            onClick={reset}
            className="h-[var(--ms-control-h)] rounded-[var(--ms-radius-sm)] bg-[var(--ms-action-primary)] px-4 text-[13px] text-white hover:bg-[var(--ms-action-primary-hover)]"
          >
            {s.retry}
          </button>
          {error.digest ? (
            <code className="mt-6 break-all text-[11px] text-[var(--ms-text-muted)]">
              {error.digest}
            </code>
          ) : null}
        </div>
      </body>
    </html>
  );
}
