'use client';

import { Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

/**
 * «Обучение» — the Склад section's onboarding / learning hub (#10 of moysklad's
 * 10 Склад sub-sections). 1:1 with moysklad's `#warehouse-onboarding` page
 * (live-grounded 2026-06-20, see docs/audits/stock-training-live-groundtruth):
 * an H1 «Склад», a wide left card with 5 grouped link sections in two columns,
 * and a right column holding a course-promo card + a «Полезные материалы» card.
 *
 * Link policy: items that map to a page we actually have point to that internal
 * route (functional); pure help-concepts and not-yet-built features (Волна
 * отбора → /picking-waves, Отчет обороты → /turnover) are placeholders (`#`)
 * until their feature lands or a HelpArticle is wired — visually identical, no
 * broken navigation, no external/competitor links.
 */

type Item = { key: string; href: string };
type Group = { key: string; icon: keyof typeof Icons; items: Item[] };

// Left card — column 1.
const COLUMN_1: Group[] = [
  {
    key: 'warehouse_management',
    icon: 'store',
    items: [
      { key: 'warehouse_accounting', href: '#' },
      { key: 'store_create_edit', href: '/stores' },
      { key: 'address_storage', href: '#' },
      { key: 'tsd', href: '#' },
      { key: 'mobile_app', href: '#' },
    ],
  },
  {
    key: 'receiving',
    icon: 'download',
    items: [
      { key: 'goods_receipt', href: '/supplies' },
      { key: 'marked_receipt', href: '#' },
      { key: 'edo_import', href: '#' },
      { key: 'completeness_check', href: '#' },
    ],
  },
  {
    key: 'stock_state',
    icon: 'clock',
    items: [
      { key: 'turnover_report', href: '#' },
      { key: 'balance_report', href: '/stock-balance' },
      { key: 'reserves_waiting', href: '/stock-balance' },
    ],
  },
];

// Left card — column 2.
const COLUMN_2: Group[] = [
  {
    key: 'assembly_shipping',
    icon: 'cart',
    items: [
      { key: 'picking_wave', href: '#' },
      { key: 'assembly_sheets', href: '#' },
      { key: 'shipment', href: '/demands' },
      { key: 'marked_shipment', href: '#' },
    ],
  },
  {
    key: 'extra_operations',
    icon: 'grid',
    items: [
      { key: 'inventory', href: '/inventories' },
      { key: 'writeoff', href: '/losses' },
      { key: 'enter', href: '/enters' },
      { key: 'moves', href: '/moves' },
      { key: 'internal_order', href: '/internal-orders' },
      { key: 'customer_return', href: '/sales-returns' },
      { key: 'supplier_return', href: '/purchase-returns' },
    ],
  },
];

// Right column — «Полезные материалы».
const USEFUL_MATERIALS: Item[] = [
  { key: 'purchase_planning', href: '/reports/purchase-management' },
  { key: 'inventory_stock', href: '#' },
  { key: 'min_balance', href: '#' },
];

function TrainingLink({ href, label }: { href: string; label: string }) {
  const className =
    'text-[var(--ms-text-brand)] text-sm leading-6 hover:underline underline-offset-2 w-fit';
  if (href === '#') {
    // Placeholder (help article / not-yet-built feature) — styled like a link
    // but a real <button>, so the page reads 1:1 without a broken anchor that
    // navigates nowhere. Wires to a HelpArticle / feature route once it exists.
    return (
      <button type="button" className={`${className} cursor-pointer bg-transparent p-0 text-left`}>
        {label}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

function LinkGroup({ group, t }: { group: Group; t: (k: string) => string }) {
  const Icon = Icons[group.icon];
  return (
    <div className="mb-7 last:mb-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--ms-text-secondary)]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h3 className="font-semibold text-[15px] text-[var(--ms-text-primary)]">
          {t(`groups.${group.key}`)}
        </h3>
      </div>
      <div className="flex flex-col gap-2 pl-[26px]">
        {group.items.map((it) => (
          <TrainingLink key={it.key} href={it.href} label={t(`links.${it.key}`)} />
        ))}
      </div>
    </div>
  );
}

export default function StockTrainingPage() {
  const t = useTranslations('pages.stockTraining');

  return (
    <div className="p-6">
      <h1 className="mb-6 font-semibold text-2xl text-[var(--ms-text-primary)]">{t('title')}</h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left — grouped links card */}
        <div className="flex-1 rounded-[var(--ms-radius-lg,12px)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6 shadow-[var(--ms-shadow-sm,0_1px_2px_rgba(0,0,0,0.04))]">
          <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
            <div>
              {COLUMN_1.map((g) => (
                <LinkGroup key={g.key} group={g} t={t} />
              ))}
            </div>
            <div>
              {COLUMN_2.map((g) => (
                <LinkGroup key={g.key} group={g} t={t} />
              ))}
            </div>
          </div>
        </div>

        {/* Right — course promo + useful materials */}
        <div className="flex w-full flex-col gap-6 lg:w-[340px] lg:shrink-0">
          <div className="relative overflow-hidden rounded-[var(--ms-radius-lg,12px)] bg-[#3c7df0] p-6 text-white">
            <p className="mb-1 text-sm text-white/80">{t('course.label')}</p>
            <h2 className="mb-4 max-w-[230px] font-semibold text-lg leading-tight">
              {t('course.title')}
            </h2>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--ms-radius-default)] bg-white px-4 py-2 font-medium text-[#3c7df0] text-sm hover:bg-white/90"
            >
              {t('course.button')}
              <Icons.right className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-[var(--ms-radius-lg,12px)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-6">
            <h3 className="mb-4 font-semibold text-[15px] text-[var(--ms-text-primary)]">
              {t('useful_materials')}
            </h3>
            <div className="flex flex-col gap-3">
              {USEFUL_MATERIALS.map((it) => (
                <div key={it.key} className="flex items-center gap-2">
                  <span className="text-[var(--ms-text-secondary)]">
                    <Icons.file className="h-4 w-4" />
                  </span>
                  <TrainingLink href={it.href} label={t(`links.${it.key}`)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
