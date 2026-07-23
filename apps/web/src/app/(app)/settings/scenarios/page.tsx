'use client';

import { EmptyState } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

// moysklad settings-nav parity: Настройки → Сценарии (stub — the section
// content is delivered by a follow-up band).
export default function SettingsScenariosPage() {
  const t = useTranslations('pages.settings_stub');

  return (
    <div className="px-8 py-6" data-testid="settings-stub-scenarios">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-primary)]">
        {t('scenarios_title')}
      </h1>
      <EmptyState title={t('wip_title')} description={t('wip_desc')} />
    </div>
  );
}
