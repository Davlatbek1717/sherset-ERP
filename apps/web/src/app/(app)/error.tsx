'use client';

/**
 * App-shell error boundary (MASTER-TODO #144).
 *
 * Before this file the app had ZERO error boundaries across 325 pages: any
 * render-time throw took the whole viewport to a blank white screen with no
 * way back. That is not theoretical — the 2026-06-08k POS-register incident
 * (`session.cashier.name` on an undefined include) white-screened `/retail`
 * for every cashier with an open shift.
 *
 * Next.js mounts this for any error thrown while rendering a page under
 * `(app)`. The app shell (sidebar/header) stays mounted — only the page slot
 * is replaced — so the user can still navigate away instead of reloading.
 *
 * i18n: this sits inside the root `NextIntlClientProvider`, so `useTranslations`
 * works normally. The `errors.crash_*` keys already existed in ru+uz.
 */

import { Button } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Surface the throw in the browser console / any attached reporter.
    // A real reporter (Sentry) lands with MASTER-TODO #107 / #146; until then
    // this is the only trace a support session has to work from.
    console.error('[app-error-boundary]', error);
  }, [error]);

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center"
      data-test-id="app-error-boundary"
      role="alert"
    >
      <h1 className="mb-2 font-semibold text-[20px] text-[var(--ms-text-primary)]">
        {t('crash_title')}
      </h1>
      <p className="mb-5 max-w-[460px] text-[13px] text-[var(--ms-text-muted)] leading-relaxed">
        {t('crash_hint')}
      </p>

      <div className="flex items-center gap-2">
        <Button onClick={reset} variant="primary" type="button">
          {t('retry')}
        </Button>
        <Button
          onClick={() => {
            window.location.href = '/';
          }}
          variant="secondary"
          type="button"
        >
          {t('go_home')}
        </Button>
      </div>

      {/* The digest is what production logs key on — without it a user report
          cannot be matched to a server-side stack trace. */}
      {error.digest ? (
        <details className="mt-6 max-w-[560px] text-left">
          <summary className="cursor-pointer text-[12px] text-[var(--ms-text-muted)]">
            {t('details')}
          </summary>
          <code className="mt-2 block break-all rounded-[var(--ms-radius-sm)] bg-[var(--ms-bg-hover)] px-3 py-2 text-[11px] text-[var(--ms-text-muted)]">
            {error.digest}
          </code>
        </details>
      ) : null}
    </div>
  );
}
