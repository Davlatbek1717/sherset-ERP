'use client';

import { Icons } from '@moysklad/ui';
import { Clock, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Settings sidebar — moysklad.uz parity.
 *
 * Moysklad places every settings tab on a left rail organised by
 * category (Настройки, Обмен данными, Справочники, Удалить аккаунт).
 * The active tab gets a brand-blue background tint; siblings are flat
 * link rows.
 *
 * One source of truth for the structure (this file). The settings
 * landing page renders the same data as a card grid — see
 * `app/(app)/settings/page.tsx` — but every detail page just renders
 * inside the layout and keeps the sidebar visible for fast switching.
 */

interface SidebarLink {
  /** Route to navigate to. */
  href: string;
  /** Lookup key in `pages.settings_sidebar.*`. */
  labelKey: string;
  /** Lucide icon — matches the existing settings card icons. */
  icon: LucideIcon;
}

interface SidebarGroup {
  /** Lookup key in `pages.settings_sidebar.groups.*`. */
  titleKey: string;
  links: SidebarLink[];
}

const GROUPS: SidebarGroup[] = [
  {
    titleKey: 'group_user',
    links: [{ href: '/settings/profile', labelKey: 'profile', icon: Icons.user }],
  },
  {
    titleKey: 'group_company',
    links: [
      { href: '/settings/organizations', labelKey: 'organizations', icon: Icons.organizations },
      { href: '/settings/stores', labelKey: 'stores', icon: Icons.stores },
      { href: '/settings/cash-desks', labelKey: 'cash_desks', icon: Icons.cashDesks },
      { href: '/settings/bank-accounts', labelKey: 'bank_accounts', icon: Icons.bankAccounts },
    ],
  },
  {
    titleKey: 'group_team',
    links: [
      { href: '/settings/users', labelKey: 'users', icon: Icons.users },
      { href: '/settings/departments', labelKey: 'departments', icon: Icons.organizations },
      { href: '/settings/audit-log', labelKey: 'audit_log', icon: Icons.auditLog },
    ],
  },
  {
    titleKey: 'group_references',
    links: [
      { href: '/settings/price-types', labelKey: 'price_types', icon: Icons.priceTypes },
      { href: '/settings/exchange-rates', labelKey: 'exchange_rates', icon: Icons.exchangeRates },
      { href: '/settings/currencies', labelKey: 'currencies', icon: Icons.exchangeRates },
      { href: '/settings/mxik', labelKey: 'mxik', icon: Icons.mxik },
      { href: '/settings/attributes', labelKey: 'attributes', icon: Icons.attributes },
      { href: '/settings/uoms', labelKey: 'uoms', icon: Icons.uoms },
      { href: '/settings/tax-rates', labelKey: 'tax_rates', icon: Icons.taxRates },
      {
        href: '/settings/task-statuses',
        labelKey: 'task_types',
        icon: Icons.share ?? Icons.taxRates,
      },
      { href: '/settings/expense-items', labelKey: 'expense_items', icon: Icons.expenseItems },
      { href: '/settings/projects', labelKey: 'projects', icon: Icons.projects },
      {
        href: '/settings/custom-entities',
        labelKey: 'custom_entities',
        icon: Icons.customEntities,
      },
      { href: '/settings/regions', labelKey: 'regions', icon: Icons.regions },
    ],
  },
  {
    titleKey: 'group_operations',
    links: [
      { href: '/settings/shift-schedules', labelKey: 'shift_schedules', icon: Clock },
      { href: '/settings/smena', labelKey: 'smenalar', icon: Users },
    ],
  },
  {
    titleKey: 'group_integrations',
    links: [
      { href: '/settings/email', labelKey: 'email', icon: Icons.email },
      { href: '/settings/email/log', labelKey: 'email_log', icon: Icons.email },
      { href: '/settings/sms', labelKey: 'sms', icon: Icons.email },
      { href: '/settings/sms/templates', labelKey: 'sms_templates', icon: Icons.email },
      { href: '/settings/webhooks', labelKey: 'webhooks', icon: Icons.webhooks },
      {
        href: '/settings/publications',
        labelKey: 'publications',
        icon: Icons.share ?? Icons.email,
      },
      {
        href: '/settings/label-templates',
        labelKey: 'label_templates',
        icon: Icons.print ?? Icons.email,
      },
    ],
  },
];

export function SettingsSidebar() {
  const pathname = usePathname() ?? '';
  const t = useTranslations('pages.settings_sidebar');

  return (
    <aside
      className="flex w-60 shrink-0 flex-col gap-1 border-[var(--ms-border-default)] border-r bg-[var(--ms-bg-surface)] py-4 pr-2"
      data-testid="settings-sidebar"
    >
      <Link
        href="/settings"
        className={`-mx-2 mb-2 flex items-center gap-2 rounded-r-[var(--ms-radius-default)] px-4 py-2 font-medium text-sm ${
          pathname === '/settings'
            ? 'bg-[var(--ms-bg-hover)] text-[var(--ms-text-brand)]'
            : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]'
        }`}
      >
        <Icons.settings className="h-4 w-4" aria-hidden />
        {t('overview')}
      </Link>

      {GROUPS.map((group) => (
        <div key={group.titleKey} className="mt-2">
          <h3 className="px-4 py-1 font-semibold text-[10px] text-[var(--ms-text-muted)] uppercase tracking-wide">
            {t(group.titleKey as 'group_company')}
          </h3>
          <ul>
            {group.links.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`-mx-2 flex items-center gap-2 rounded-r-[var(--ms-radius-default)] px-4 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'border-[var(--ms-text-brand)] border-l-2 bg-[var(--ms-bg-hover)] font-medium text-[var(--ms-text-brand)]'
                        : 'text-[var(--ms-text-secondary)] hover:bg-[var(--ms-bg-muted)] hover:text-[var(--ms-text-primary)]'
                    }`}
                    data-testid={`settings-link-${link.labelKey}`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{t(link.labelKey as 'organizations')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}
