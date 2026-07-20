'use client';

import { Icons, PageHeader } from '@moysklad/ui';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SettingsCard {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

// Each card pairs a Lucide line icon (matches moysklad.uz iconography) with
// its admin-domain landing page. The icon set is curated in @moysklad/ui →
// Icons; do not pick ad-hoc lucide imports here.
const SETTINGS_CARDS: SettingsCard[] = [
  {
    href: '/settings/profile',
    titleKey: 'profile_card_title',
    descriptionKey: 'profile_card_description',
    icon: Icons.user,
  },
  {
    href: '/settings/organizations',
    titleKey: 'organizations_card_title',
    descriptionKey: 'organizations_card_description',
    icon: Icons.organizations,
  },
  {
    href: '/settings/stores',
    titleKey: 'stores_card_title',
    descriptionKey: 'stores_card_description',
    icon: Icons.stores,
  },
  {
    href: '/settings/sklad-keepers',
    titleKey: 'sklad_keepers_card_title',
    descriptionKey: 'sklad_keepers_card_description',
    icon: Icons.stores,
  },
  {
    href: '/settings/cash-desks',
    titleKey: 'cash_desks_card_title',
    descriptionKey: 'cash_desks_card_description',
    icon: Icons.cashDesks,
  },
  {
    href: '/settings/bank-accounts',
    titleKey: 'bank_accounts_card_title',
    descriptionKey: 'bank_accounts_card_description',
    icon: Icons.bankAccounts,
  },
  {
    href: '/settings/price-types',
    titleKey: 'price_types_card_title',
    descriptionKey: 'price_types_card_description',
    icon: Icons.priceTypes,
  },
  {
    href: '/settings/users',
    titleKey: 'users_card_title',
    descriptionKey: 'users_card_description',
    icon: Icons.users,
  },
  {
    href: '/settings/email',
    titleKey: 'email_card_title',
    descriptionKey: 'email_card_description',
    icon: Icons.email,
  },
  {
    href: '/settings/sms',
    titleKey: 'sms_card_title',
    descriptionKey: 'sms_card_description',
    icon: Icons.email,
  },
  {
    href: '/settings/exchange-rates',
    titleKey: 'exchange_rates_card_title',
    descriptionKey: 'exchange_rates_card_description',
    icon: Icons.exchangeRates,
  },
  {
    href: '/settings/mxik',
    titleKey: 'mxik_card_title',
    descriptionKey: 'mxik_card_description',
    icon: Icons.mxik,
  },
  {
    href: '/settings/attributes',
    titleKey: 'attributes_card_title',
    descriptionKey: 'attributes_card_description',
    icon: Icons.attributes,
  },
  {
    href: '/settings/customer-order-statuses',
    titleKey: 'customer_order_statuses_card_title',
    descriptionKey: 'customer_order_statuses_card_description',
    icon: Icons.tasks,
  },
  {
    href: '/settings/purchase-order-statuses',
    titleKey: 'purchase_order_statuses_card_title',
    descriptionKey: 'purchase_order_statuses_card_description',
    icon: Icons.tasks,
  },
  {
    href: '/settings/counterparty-statuses',
    titleKey: 'counterparty_statuses_card_title',
    descriptionKey: 'counterparty_statuses_card_description',
    icon: Icons.users,
  },
  {
    href: '/settings/webhooks',
    titleKey: 'webhooks_card_title',
    descriptionKey: 'webhooks_card_description',
    icon: Icons.webhooks,
  },
  {
    href: '/settings/audit-log',
    titleKey: 'audit_log_card_title',
    descriptionKey: 'audit_log_card_description',
    icon: Icons.auditLog,
  },
  {
    href: '/settings/email/log',
    titleKey: 'email_log_card_title',
    descriptionKey: 'email_log_card_description',
    icon: Icons.email,
  },
];

export default function SettingsLandingPage() {
  const t = useTranslations('pages.settings');

  return (
    <div className="px-6 py-4">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <div
        className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        data-test-id="settings-landing"
      >
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.href}
              href={card.href}
              className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
              data-test-id={`settings-card-${card.href.replace(/\//g, '_')}`}
            >
              <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <h2 className="mb-0.5 font-semibold text-sm">{t(card.titleKey)}</h2>
              <p className="text-[var(--ms-text-muted)] text-xs">{t(card.descriptionKey)}</p>
            </a>
          );
        })}
      </div>
    </div>
  );
}
