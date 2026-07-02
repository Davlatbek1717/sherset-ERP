'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { StaffForm } from '../_components/staff-form';

export default function AnalitikaStaffNewPage() {
  const t = useTranslations('pages.analitika_staff');
  return (
    <div className="space-y-4 p-6">
      <Link
        href="/analitika/xodimlar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('back')}
      </Link>
      <div>
        <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
          {t('new_title')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('new_subtitle')}</p>
      </div>
      <StaffForm mode="create" />
    </div>
  );
}
