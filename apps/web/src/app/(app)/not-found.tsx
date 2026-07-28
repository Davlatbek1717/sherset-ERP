'use client';

/**
 * In-shell 404 (MASTER-TODO #144) — rendered when a page under `(app)` calls
 * `notFound()` (e.g. a detail route whose record was deleted). The sidebar and
 * header stay mounted so the user can navigate on; previously this produced
 * Next's unstyled default page outside our shell.
 */

import { Button } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export default function AppNotFound() {
  const t = useTranslations('errors');

  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-10 text-center"
      data-test-id="app-not-found"
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
