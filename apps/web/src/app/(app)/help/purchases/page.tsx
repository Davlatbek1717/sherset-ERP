'use client';

/**
 * «Обучение» (Education) — moysklad-parity learning hub for the
 * Закупки module. Reached via the sub-nav tab next to «Заказы
 * поставщикам / Счета поставщиков / Приёмки / Возвраты». Mirrors
 * moysklad's structure of grouped guide cards (quick-start /
 * documentation / video / FAQ) so a new user can self-onboard
 * without leaving the ERP.
 *
 * The cards are static at the moment — each link points to an
 * in-app help slug under /help/purchases/<slug>. When we add a real
 * KB / video pipeline these can be backed by a CMS table, but the
 * card grid + categories will stay 1:1 with this layout.
 */

import { Container, Icons, PageHeader } from '@moysklad/ui';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface EducationSection {
  /** Stable key for the section (used as testId + i18n group). */
  key: string;
  icon: LucideIcon;
  /** Cards under this section. */
  cards: Array<{ key: string; href: string; minutes?: number }>;
}

/**
 * Card grid grouped by purpose. Each card resolves its title +
 * description through the `pages.education_purchases.cards.<key>`
 * i18n namespace; the `minutes` hint surfaces an estimated
 * reading time tag.
 */
const SECTIONS: EducationSection[] = [
  {
    key: 'getting_started',
    icon: Icons.create,
    cards: [
      { key: 'first_purchase_order', href: '/help/purchases/first-purchase-order', minutes: 4 },
      { key: 'supplier_invoice_basics', href: '/help/purchases/supplier-invoice', minutes: 3 },
      { key: 'first_supply', href: '/help/purchases/first-supply', minutes: 5 },
    ],
  },
  {
    key: 'documents',
    icon: Icons.document,
    cards: [
      { key: 'po_lifecycle', href: '/help/purchases/po-lifecycle', minutes: 6 },
      { key: 'partial_receipt', href: '/help/purchases/partial-receipt', minutes: 4 },
      { key: 'invoice_to_supply_link', href: '/help/purchases/invoice-supply-link', minutes: 5 },
      { key: 'returns_workflow', href: '/help/purchases/returns-workflow', minutes: 6 },
    ],
  },
  {
    key: 'reports',
    icon: Icons.chart,
    cards: [
      { key: 'purchase_summary', href: '/reports/purchase-management', minutes: 3 },
      { key: 'supplier_balance', href: '/reports/counterparty-balance', minutes: 3 },
      { key: 'cash_flow_purchases', href: '/reports/cash-flow', minutes: 4 },
    ],
  },
  {
    key: 'integrations',
    icon: Icons.refresh,
    cards: [
      { key: 'soliq_facture', href: '/help/purchases/soliq-facture', minutes: 5 },
      { key: 'amocrm_sync', href: '/help/purchases/amocrm', minutes: 4 },
      { key: 'webhook_examples', href: '/help/purchases/webhooks', minutes: 6 },
    ],
  },
];

export default function EducationPurchasesPage() {
  const t = useTranslations('pages.education_purchases');

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Featured/quick-start banner — mirrors moysklad's hero card
          on top of the learning hub. Single CTA to the recommended
          first read for new users. */}
      <a
        href="/help/purchases/first-purchase-order"
        className="mt-2 mb-6 flex items-start gap-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-brand-soft)] p-5 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
        data-test-id="education-hero"
      >
        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-[var(--ms-text-brand)]">
          <Icons.create className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 inline-flex items-center gap-2">
            <span className="rounded-sm bg-[var(--ms-bg-brand)] px-1.5 py-0.5 font-medium text-[10px] text-white uppercase tracking-wide">
              {t('hero_badge')}
            </span>
            <span className="text-[var(--ms-text-muted)] text-xs">
              {t('hero_minutes', { minutes: 4 })}
            </span>
          </div>
          <h2 className="mb-1 font-semibold text-[var(--ms-text-primary)] text-lg">
            {t('hero_title')}
          </h2>
          <p className="text-[var(--ms-text-muted)] text-sm leading-relaxed">
            {t('hero_subtitle')}
          </p>
        </div>
        <span aria-hidden className="self-center text-[var(--ms-text-brand)] text-xl">
          →
        </span>
      </a>

      {SECTIONS.map((section) => {
        const SectionIcon = section.icon;
        return (
          <section
            key={section.key}
            className="mb-8"
            data-test-id={`education-section-${section.key}`}
          >
            <div className="mb-3 flex items-center gap-2">
              <SectionIcon className="h-4 w-4 text-[var(--ms-text-muted)]" aria-hidden />
              <h2 className="font-semibold text-[var(--ms-text-primary)] text-sm uppercase tracking-wide">
                {t(`sections.${section.key}`)}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((card) => (
                <a
                  key={card.key}
                  href={card.href}
                  className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
                  data-test-id={`education-card-${card.key}`}
                >
                  <h3 className="mb-1 font-medium text-[var(--ms-text-primary)] text-sm">
                    {t(`cards.${card.key}.title`)}
                  </h3>
                  <p className="mb-2 text-[var(--ms-text-muted)] text-xs leading-relaxed">
                    {t(`cards.${card.key}.description`)}
                  </p>
                  {card.minutes != null && (
                    <span className="text-[var(--ms-text-muted)] text-[11px]">
                      {t('card_minutes', { minutes: card.minutes })}
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        );
      })}

      {/* Footer support row — moysklad-style "still stuck?" CTA. */}
      <div
        className="mt-10 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-subtle)] bg-[var(--ms-bg-muted)] px-5 py-4"
        data-test-id="education-footer"
      >
        <div className="font-medium text-[var(--ms-text-primary)] text-sm">{t('footer_title')}</div>
        <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('footer_subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href="mailto:support@moysklad.uz"
            className="text-[var(--ms-text-brand)] text-xs hover:underline"
            data-test-id="education-cta-email"
          >
            {t('footer_cta_email')}
          </a>
          <a
            href="https://t.me/moyskladuz"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--ms-text-brand)] text-xs hover:underline"
            data-test-id="education-cta-telegram"
          >
            {t('footer_cta_telegram')}
          </a>
        </div>
      </div>
    </Container>
  );
}
