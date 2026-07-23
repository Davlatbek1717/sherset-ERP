'use client';

/**
 * «Спецпредложения» — the user-menu item's target (moysklad `#specialoffers`,
 * grounded 2026-07-04). A self-hosted install has no marketing offers feed, so
 * this renders moysklad's page shell with an honest empty state.
 */

import { useTranslations } from 'next-intl';

export default function SpecialOffersPage() {
  const t = useTranslations('pages.specialoffers');
  return (
    <div className="px-6 py-5" data-test-id="specialoffers-page">
      <h1 className="mb-4 font-semibold text-[20px] text-[var(--ms-text-primary)]">{t('title')}</h1>
      <p className="max-w-[560px] text-[13px] text-[var(--ms-text-muted)] leading-relaxed">
        {t('empty')}
      </p>
    </div>
  );
}
