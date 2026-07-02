'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SettingsNav } from './_components/settings-nav';

export default function SozlamalarLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('pages.analitika_settings');
  return (
    <div className="space-y-4 p-6">
      <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('title')}</h1>
      <SettingsNav />
      <div className="mt-5">{children}</div>
    </div>
  );
}
