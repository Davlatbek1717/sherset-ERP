'use client';

import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import { Container, Icons, PageHeader } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ChannelListResponse {
  total: number;
}
interface OrderCounts {
  pending: number;
  accepted: number;
  total: number;
}

interface EcomCard {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  badge?: number;
}

export default function EcommerceLandingPage() {
  const t = useTranslations('pages.ecommerce');
  const { user } = useAuth();

  const { data: channelData } = useQuery<ChannelListResponse>({
    queryKey: ['sales-channels-count'],
    queryFn: () => api.get<ChannelListResponse>('/sales-channels?limit=1'),
    enabled: !!user,
  });

  const { data: orderCounts } = useQuery<OrderCounts>({
    queryKey: ['online-orders-counts'],
    queryFn: () => api.get<OrderCounts>('/online-orders/counts'),
    enabled: !!user,
  });

  const ECOM_CARDS: EcomCard[] = [
    {
      href: '/ecommerce/channels',
      titleKey: 'channels_card_title',
      descriptionKey: 'channels_card_description',
      icon: Icons.channel,
      badge: channelData?.total,
    },
    {
      href: '/ecommerce/orders',
      titleKey: 'orders_card_title',
      descriptionKey: 'orders_card_description',
      icon: Icons.onlineOrder,
      badge: orderCounts?.pending,
    },
  ];

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2" data-test-id="ecommerce-landing">
        {ECOM_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.href}
              href={card.href}
              className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
              data-test-id={`ecom-card-${card.href.replace(/\//g, '_')}`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[var(--ms-bg-muted)] text-[var(--ms-text-brand)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                {card.badge !== undefined && card.badge > 0 && (
                  <span className="rounded-full bg-[var(--ms-brand)] px-2 py-0.5 font-semibold text-white text-xs">
                    {card.badge}
                  </span>
                )}
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
