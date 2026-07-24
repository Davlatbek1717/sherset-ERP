'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

/**
 * HR Sozlamalar — hub. Links to the settings sub-pages (roles + telegram).
 */
export default function HrSettingsPage() {
  const t = useTranslations('subnav.hr');
  const tRoles = useTranslations('pages.hrRoles');
  const tTelegram = useTranslations('pages.hrTelegram');
  const tWorkLoc = useTranslations('pages.workLocations');
  const tNotify = useTranslations('pages.hrNotify');

  const cards = [
    { href: '/hr/settings/roles', title: tRoles('title'), desc: tRoles('subtitle') },
    { href: '/hr/settings/telegram', title: tTelegram('title'), desc: tTelegram('subtitle') },
    {
      href: '/hr/settings/work-locations',
      title: tWorkLoc('title'),
      desc: tWorkLoc('subtitle'),
    },
    { href: '/hr/settings/notify', title: tNotify('title'), desc: tNotify('subtitle') },
  ];

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('settings')}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 transition-colors hover:border-[var(--ms-border-strong)] hover:bg-[var(--ms-bg-app)]"
          >
            <div className="font-medium text-[var(--ms-text-strong)]">{c.title}</div>
            <div className="mt-1 text-[var(--ms-text-muted)] text-sm">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
