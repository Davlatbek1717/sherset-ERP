'use client';

import { api } from '@/lib/api-client';
import { Icons } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Settings sidebar — moysklad.uz 1:1 (owner screenshots, 2026-07-16).
 *
 * moysklad's #companysettings left nav is three groups of FLAT text rows
 * (no icons), with burnt-orange uppercase group headers:
 *   НАСТРОЙКИ        → Настройки компании · Сценарии · Бизнес-процессы
 *   ОБМЕН ДАННЫМИ    → Импорт · Экспорт · Токены
 *   СПРАВОЧНИКИ [+ Справочник] → Юр. лица · Сотрудники · Каналы продаж ·
 *     Валюты · Проекты · Страны · Единицы измерения · Ставки НДС ·
 *     …then every user-created custom справочник as its own row.
 * The active row gets a pale-blue full-row tint.
 *
 * Owner directive 2026-07-16 (2nd message): the nav must contain ONLY what
 * moysklad's nav has — our extra pages (МХИК, Кассы, Журнал аудита, …) are
 * HIDDEN from the nav, not deleted (⛔ preserve rule: routes + pages stay,
 * reachable via /settings/all and direct URLs). Flip
 * SHOW_NON_MOYSKLAD_EXTRAS to true to re-show the «ПРОЧЕЕ» group.
 * moysklad's nav ends with a standalone «Удалить аккаунт» row after a gap.
 */

/** Hidden per owner 2026-07-16 — do NOT delete the group (preserve rule). */
const SHOW_NON_MOYSKLAD_EXTRAS = false;

interface SidebarLink {
  /** Route to navigate to. */
  href: string;
  /** Lookup key in `pages.settings_sidebar.*`. */
  labelKey: string;
  /** Highlight only on exact pathname match (see custom-entities admin). */
  exactMatch?: boolean;
}

interface SidebarGroup {
  /** Lookup key in `pages.settings_sidebar.groups.*`. */
  titleKey: string;
  links: SidebarLink[];
  /** СПРАВОЧНИКИ extras: «+ Справочник» button + dynamic custom entities. */
  isReferences?: boolean;
}

const MOYSKLAD_GROUPS: SidebarGroup[] = [
  {
    titleKey: 'group_settings',
    links: [
      { href: '/settings/company', labelKey: 'company' },
      { href: '/settings/scenarios', labelKey: 'scenarios' },
      { href: '/settings/business-processes', labelKey: 'business_processes' },
    ],
  },
  {
    titleKey: 'group_exchange',
    links: [
      { href: '/settings/import', labelKey: 'import' },
      { href: '/settings/export', labelKey: 'export' },
      { href: '/settings/tokens', labelKey: 'tokens' },
    ],
  },
  {
    titleKey: 'group_references',
    isReferences: true,
    links: [
      { href: '/settings/organizations', labelKey: 'organizations' },
      { href: '/settings/employees', labelKey: 'employees' },
      { href: '/settings/sales-channels', labelKey: 'sales_channels' },
      { href: '/settings/currencies', labelKey: 'currencies' },
      { href: '/settings/projects', labelKey: 'projects' },
      { href: '/settings/countries', labelKey: 'countries' },
      { href: '/settings/uoms', labelKey: 'uoms' },
      { href: '/settings/tax-rates', labelKey: 'tax_rates' },
    ],
  },
];

// Bizning qo'shimcha sahifalar — nav'dan YASHIRILGAN (owner 2026-07-16),
// kod va route'lar saqlangan. SHOW_NON_MOYSKLAD_EXTRAS=true qaytaradi.
const EXTRA_GROUPS: SidebarGroup[] = [
  {
    titleKey: 'group_other',
    links: [
      { href: '/settings/all', labelKey: 'all_settings' },
      { href: '/settings/profile', labelKey: 'profile' },
      { href: '/settings/cash-desks', labelKey: 'cash_desks' },
      { href: '/settings/bank-accounts', labelKey: 'bank_accounts' },
      { href: '/settings/departments', labelKey: 'departments' },
      { href: '/settings/audit-log', labelKey: 'audit_log' },
      { href: '/settings/price-types', labelKey: 'price_types' },
      { href: '/settings/exchange-rates', labelKey: 'exchange_rates' },
      { href: '/settings/mxik', labelKey: 'mxik' },
      { href: '/settings/attributes', labelKey: 'attributes' },
      { href: '/settings/task-statuses', labelKey: 'task_types' },
      { href: '/settings/expense-items', labelKey: 'expense_items' },
      { href: '/settings/custom-entities', labelKey: 'custom_entities', exactMatch: true },
      { href: '/settings/regions', labelKey: 'regions' },
      { href: '/settings/email', labelKey: 'email' },
      { href: '/settings/email/log', labelKey: 'email_log' },
      { href: '/settings/webhooks', labelKey: 'webhooks' },
      { href: '/settings/publications', labelKey: 'publications' },
      { href: '/settings/label-templates', labelKey: 'label_templates' },
    ],
  },
];

interface CustomEntityNavItem {
  id: string;
  name: string;
}

function useCustomEntityNav(): CustomEntityNavItem[] {
  // moysklad appends every custom справочник to СПРАВОЧНИКИ; mirror that.
  // Non-blocking: nav renders instantly, custom rows stream in.
  const { data } = useQuery<{ items: CustomEntityNavItem[] }>({
    queryKey: ['settings-sidebar-custom-entities'],
    queryFn: () =>
      api.get<{ items: CustomEntityNavItem[] }>('/custom-entities?sortBy=name&sortDir=asc'),
    staleTime: 60_000,
  });
  return data?.items ?? [];
}

export function SettingsSidebar() {
  const pathname = usePathname() ?? '';
  const t = useTranslations('pages.settings_sidebar');
  const customEntities = useCustomEntityNav();
  // Mobile (≤767px): the 290px rail becomes a full-width COLLAPSED bar — the
  // ~20-row nav would otherwise push every settings page below the fold. The
  // toggle is invisible on desktop (md:hidden) and the list is always shown ≥md.
  const [mobileOpen, setMobileOpen] = useState(false);

  // moysklad metrics (owner side-by-side screenshot 2026-07-16): nav ≈300px,
  // 14px rows with roomy line-height, generous inter-group gaps, «Удалить
  // аккаунт» standalone after a large gap at the bottom.
  const rowClass = (isActive: boolean) =>
    `block px-5 py-[7px] text-[14px] leading-[20px] transition-colors ${
      isActive
        ? 'bg-[var(--ms-bg-hover)] text-[var(--ms-text-primary)]'
        : 'text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]'
    }`;

  const isLinkActive = (link: SidebarLink) =>
    link.exactMatch
      ? pathname === link.href || pathname === `${link.href}/new`
      : pathname === link.href || pathname.startsWith(`${link.href}/`);

  const groups = SHOW_NON_MOYSKLAD_EXTRAS ? [...MOYSKLAD_GROUPS, ...EXTRA_GROUPS] : MOYSKLAD_GROUPS;

  return (
    <aside
      className="flex w-[290px] shrink-0 flex-col border-[var(--ms-border-default)] border-r bg-[var(--ms-bg-surface)] pt-3 pb-8 max-md:w-full max-md:border-r-0 max-md:border-b max-md:pt-0 max-md:pb-0"
      data-testid="settings-sidebar"
    >
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        data-testid="settings-sidebar-mobile-toggle"
        className="flex min-h-[44px] w-full items-center justify-between px-5 font-bold text-[12px] text-[var(--ms-settings-heading)] uppercase tracking-[0.4px] md:hidden"
      >
        {t('mobile_sections')}
        <Icons.down
          aria-hidden
          className={`h-4 w-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={mobileOpen ? 'max-md:pb-4' : 'max-md:hidden'}>
        {groups.map((group) => (
          <div key={group.titleKey} className="mt-5 first:mt-1">
            <div className="flex items-center gap-3 px-5 pb-2">
              <h3 className="font-bold text-[12px] text-[var(--ms-settings-heading)] uppercase tracking-[0.4px]">
                {t(group.titleKey as 'group_references')}
              </h3>
              {group.isReferences && (
                <Link
                  href="/settings/custom-entities/new"
                  className="flex shrink-0 items-center gap-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-input)] bg-[var(--ms-bg-surface)] px-2.5 py-[4px] text-[13px] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]"
                  data-testid="settings-add-custom-entity"
                >
                  <Icons.create className="h-3 w-3" aria-hidden />
                  {t('add_custom_entity')}
                </Link>
              )}
            </div>
            <ul>
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={rowClass(isLinkActive(link))}
                    data-testid={`settings-link-${link.labelKey}`}
                  >
                    <span className="block truncate">{t(link.labelKey as 'organizations')}</span>
                  </Link>
                </li>
              ))}
              {group.isReferences &&
                customEntities.map((ce) => {
                  const href = `/settings/custom-entities/${ce.id}`;
                  return (
                    <li key={ce.id}>
                      <Link
                        href={href}
                        className={rowClass(pathname === href)}
                        data-testid={`settings-link-custom-${ce.id}`}
                      >
                        <span className="block truncate">{ce.name}</span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}

        {/* moysklad: standalone «Удалить аккаунт» row after a large gap. */}
        <div className="mt-12">
          <Link
            href="/settings/delete-account"
            className={rowClass(pathname.startsWith('/settings/delete-account'))}
            data-testid="settings-link-delete_account"
          >
            {t('delete_account')}
          </Link>
        </div>
      </div>
    </aside>
  );
}
