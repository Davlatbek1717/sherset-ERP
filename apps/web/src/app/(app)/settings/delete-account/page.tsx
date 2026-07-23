'use client';

import { EmptyState } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

/**
 * moysklad settings-nav bottom row «Удалить аккаунт» — the nav item exists
 * 1:1 (owner screenshot 2026-07-16); the deletion flow itself is deferred
 * like the other stub sections.
 */
export default function DeleteAccountPage() {
  const t = useTranslations('pages.settings_stub');
  return (
    <div className="px-8 py-6" data-testid="settings-stub-delete-account">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-primary)]">
        {t('delete_account_title')}
      </h1>
      <div className="mt-8">
        <EmptyState title={t('wip_title')} description={t('wip_desc')} />
      </div>
    </div>
  );
}
