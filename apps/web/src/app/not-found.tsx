'use client';

/**
 * Root 404 (MASTER-TODO #144) — an unmatched URL never enters the `(app)`
 * route group, so it cannot use the in-shell not-found. This renders inside
 * RootLayout, which means the `NextIntlClientProvider` IS mounted and
 * `useTranslations` works.
 */

import { Button } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export default function RootNotFound() {
  const t = useTranslations('errors');

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      data-test-id="root-not-found"
    >
      <h1 className="mb-2 font-semibold text-[20px] text-[var(--ms-text-primary)]">
        {t('not_found_title')}
      </h1>
      <p className="mb-5 max-w-[460px] text-[13px] text-[var(--ms-text-muted)] leading-relaxed">
        {t('not_found_hint')}
      </p>
      <Button
        onClick={() => {
          window.location.href = '/';
        }}
        variant="primary"
        type="button"
      >
        {t('go_home')}
      </Button>
    </div>
  );
}
