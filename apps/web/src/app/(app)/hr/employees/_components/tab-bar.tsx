'use client';

/**
 * Tab bar shared between Employee detail subroutes (main / permissions /
 * salary). Keeps the URL the source of truth so the tab is shareable.
 */

import { useTranslations } from 'next-intl';
import Link from 'next/link';

export type EmployeeTab = 'main' | 'permissions' | 'salary' | 'schedule';

export interface TabBarProps {
  employeeId: string;
  active: EmployeeTab;
}

export function TabBar({ employeeId, active }: TabBarProps) {
  const t = useTranslations('pages.hrEmployees');
  const tabs: { key: EmployeeTab; href: string; label: string }[] = [
    { key: 'main', href: `/hr/employees/${employeeId}`, label: t('tab_main') },
    {
      key: 'permissions',
      href: `/hr/employees/${employeeId}/permissions`,
      label: t('tab_permissions'),
    },
    { key: 'salary', href: `/hr/employees/${employeeId}/salary`, label: t('tab_salary') },
    { key: 'schedule', href: `/hr/employees/${employeeId}/schedule`, label: t('tab_schedule') },
  ];
  return (
    <nav className="flex gap-1 border-[var(--ms-border-default)] border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={
            tab.key === active
              ? 'border-[var(--ms-text-brand)] border-b-2 px-3 py-1.5 font-medium text-[var(--ms-text-brand)] text-sm'
              : 'border-transparent border-b-2 px-3 py-1.5 text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-primary)]'
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
