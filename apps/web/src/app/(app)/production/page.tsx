'use client';

import { Container, Icons, PageHeader } from '@moysklad/ui';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ProductionCard {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

const PRODUCTION_CARDS: ProductionCard[] = [
  {
    href: '/productions',
    titleKey: 'production_card_title',
    descriptionKey: 'production_card_description',
    icon: Icons.production,
  },
  {
    href: '/production/boms',
    titleKey: 'bom_card_title',
    descriptionKey: 'bom_card_description',
    icon: Icons.bom,
  },
  {
    href: '/production/processes',
    titleKey: 'process_card_title',
    descriptionKey: 'process_card_description',
    icon: Icons.production,
  },
  {
    href: '/production/stages',
    titleKey: 'stage_card_title',
    descriptionKey: 'stage_card_description',
    icon: Icons.production,
  },
  {
    href: '/production/work-orders',
    titleKey: 'work_order_card_title',
    descriptionKey: 'work_order_card_description',
    icon: Icons.workOrder,
  },
];

export default function ProductionLandingPage() {
  const t = useTranslations('pages.production');

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <div
        className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        data-test-id="production-landing"
      >
        {PRODUCTION_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.href}
              href={card.href}
              className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
              data-test-id={`production-card-${card.href.replace(/\//g, '_')}`}
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mb-1 font-semibold text-base">{t(card.titleKey)}</h2>
              <p className="text-[var(--ms-text-muted)] text-sm">{t(card.descriptionKey)}</p>
            </a>
          );
        })}
      </div>
    </Container>
  );
}
