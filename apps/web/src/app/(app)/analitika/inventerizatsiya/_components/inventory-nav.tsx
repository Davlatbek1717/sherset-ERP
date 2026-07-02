'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Inventerizatsiya ichidagi 5 sahifa o'rtasidagi sub-nav strip
 * (ref `D:\projects-desktop\projects\KONTRAGENTLAR src/app/(dashboard)/inventory/*` parity).
 * Tepada Analitika sub-navi qoladi — bu uning ostida, faqat inventerizatsiya
 * sahifalarida ko'rinadi (layout.tsx orqali ulanadi).
 */
export function InventoryNav() {
  const t = useTranslations('pages.analitika_inventory');
  const pathname = usePathname() ?? '';
  const ROOT = '/analitika/inventerizatsiya';
  const links = [
    { href: ROOT, label: t('subnav_dashboard'), exact: true },
    { href: `${ROOT}/count`, label: t('subnav_count') },
    { href: `${ROOT}/cycle`, label: t('subnav_cycle') },
    { href: `${ROOT}/approvals`, label: t('subnav_approvals') },
    { href: `${ROOT}/reports`, label: t('subnav_reports') },
  ];
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Inventerizatsiya sub-navigation"
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
