'use client';

import { Container, Icons, PageHeader } from '@moysklad/ui';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ReportCard {
  href: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

const REPORT_CARDS: ReportCard[] = [
  {
    href: '/reports/sales',
    titleKey: 'sales_card_title',
    descriptionKey: 'sales_card_description',
    icon: Icons.reportSales,
  },
  {
    href: '/reports/cash-flow',
    titleKey: 'cash_flow_card_title',
    descriptionKey: 'cash_flow_card_description',
    icon: Icons.reportCashFlow,
  },
  {
    href: '/reports/pnl',
    titleKey: 'pnl_card_title',
    descriptionKey: 'pnl_card_description',
    icon: Icons.reportPnl,
  },
  {
    href: '/reports/stock-balance',
    titleKey: 'stock_balance_card_title',
    descriptionKey: 'stock_balance_card_description',
    icon: Icons.reportStockBalance,
  },
  {
    href: '/reports/counterparty-balance',
    titleKey: 'counterparty_balance_card_title',
    descriptionKey: 'counterparty_balance_card_description',
    icon: Icons.reportCpBalance,
  },
  {
    href: '/reports/abc-analysis',
    titleKey: 'abc_analysis_card_title',
    descriptionKey: 'abc_analysis_card_description',
    icon: Icons.chart,
  },
  {
    href: '/reports/aging',
    titleKey: 'aging_card_title',
    descriptionKey: 'aging_card_description',
    icon: Icons.reportCpBalance,
  },
  {
    href: '/reports/returns-ratio',
    titleKey: 'returns_ratio_card_title',
    descriptionKey: 'returns_ratio_card_description',
    icon: Icons.reportSales,
  },
  {
    href: '/reports/slow-movers',
    titleKey: 'slow_movers_card_title',
    descriptionKey: 'slow_movers_card_description',
    icon: Icons.reportStockBalance,
  },
  {
    href: '/reports/sales-by-channel',
    titleKey: 'sales_by_channel_card_title',
    descriptionKey: 'sales_by_channel_card_description',
    icon: Icons.reportSales,
  },
  {
    href: '/reports/inventory-variance',
    titleKey: 'inventory_variance_card_title',
    descriptionKey: 'inventory_variance_card_description',
    icon: Icons.reportStockBalance,
  },
  {
    href: '/reports/sales-by-hour',
    titleKey: 'sales_by_hour_card_title',
    descriptionKey: 'sales_by_hour_card_description',
    icon: Icons.chart,
  },
  {
    href: '/reports/average-basket',
    titleKey: 'average_basket_card_title',
    descriptionKey: 'average_basket_card_description',
    icon: Icons.reportSales,
  },
  {
    href: '/reports/profitability',
    titleKey: 'profitability_card_title',
    descriptionKey: 'profitability_card_description',
    icon: Icons.reportPnl,
  },
  {
    href: '/reports/purchase-management',
    titleKey: 'purchase_management_card_title',
    descriptionKey: 'purchase_management_card_description',
    icon: Icons.reportCpBalance,
  },
  {
    href: '/reports/unit-economics',
    titleKey: 'unit_economics_card_title',
    descriptionKey: 'unit_economics_card_description',
    icon: Icons.chart,
  },
  {
    href: '/reports/warehouse-ops',
    titleKey: 'warehouse_ops_card_title',
    descriptionKey: 'warehouse_ops_card_description',
    icon: Icons.reportStockBalance,
  },
];

export default function ReportsLandingPage() {
  const t = useTranslations('pages.reports');

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('description')} />
      <div
        className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        data-test-id="reports-landing"
      >
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <a
              key={card.href}
              href={card.href}
              className="block rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-5 transition-all hover:border-[var(--ms-border-strong)] hover:shadow-sm"
              data-test-id={`report-card-${card.href.replace(/\//g, '_')}`}
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
