'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Sozlamalar ichidagi 5 sahifa o'rtasidagi sub-nav strip
 * (ref `D:\projects-desktop\projects\KONTRAGENTLAR src/app/(dashboard)/settings/*` parity).
 */
export function SettingsNav() {
  const t = useTranslations('pages.analitika_settings');
  const pathname = usePathname() ?? '';
  const ROOT = '/analitika/sozlamalar';
  const links = [
    { href: ROOT, label: t('subnav_profile'), exact: true },
    { href: `${ROOT}/admin`, label: t('subnav_admin') },
    { href: `${ROOT}/audit`, label: t('subnav_audit') },
    { href: `${ROOT}/sabab-kodlari`, label: t('subnav_reasons') },
    { href: `${ROOT}/rollar`, label: t('subnav_roles') },
  ];
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Settings sub-navigation"
      className="flex flex-wrap gap-1 border-[var(--ms-border)] border-b"
    >
      {links.map((l) => {
        const active = isActive(l.href, l.exact);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`-mb-px border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
              active
                ? 'border-[var(--ms-text-brand)] text-[var(--ms-text-brand)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
