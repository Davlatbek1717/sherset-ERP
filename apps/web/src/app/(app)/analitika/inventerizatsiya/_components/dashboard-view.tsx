'use client';

import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { fmtMoney } from '../_lib/format';
import type { Summary } from '../_lib/types';

/**
 * Inventerizatsiya bosh paneli — KPI satr (5 sanash holati) + 3 pul karta,
 * tepada quick-actions toolbar va kutilayotgan tasdiqlar uchun callout.
 * Reference `inventory/dashboard-view.tsx`ning sodda variantasi (richer
 * KpiBar/RecentActivity/TopCounters keyingi P-I iteratsiyasida).
 */
export function DashboardView() {
  const t = useTranslations('pages.analitika_inventory');
  const { data } = useQuery<Summary>({
    queryKey: ['analitika', 'count-summary'],
    queryFn: () => api.get<Summary>('/analitika/counts/summary'),
  });
  const s = data;

  const cards: { label: string; value: string; tone?: string }[] = [
    { label: t('kpi_total'), value: String(s?.total ?? 0) },
    { label: t('kpi_green'), value: String(s?.green ?? 0), tone: 'text-[var(--ms-success-600)]' },
    {
      label: t('kpi_yellow'),
      value: String(s?.yellow ?? 0),
      tone: 'text-[var(--ms-warning-600)]',
    },
    { label: t('kpi_red'), value: String(s?.red ?? 0), tone: 'text-[var(--ms-destructive-500)]' },
    { label: t('kpi_pending'), value: String(s?.pendingApproval ?? 0) },
  ];

  return (
    <div className="space-y-5">
      <QuickActions />

      {s && s.pendingApproval > 0 && (
        <PendingCallout
          count={s.pendingApproval}
          label={t('pending_callout', { n: s.pendingApproval })}
          actionLabel={t('pending_callout_action')}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
            <div className="text-[var(--ms-text-muted)] text-xs">{c.label}</div>
            <div
              className={`mt-1 font-semibold text-2xl ${c.tone ?? 'text-[var(--ms-text-primary)]'}`}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">🔴 {t('kpi_loss')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-destructive-500)] text-xl">
            {fmtMoney(s?.lossMinor ?? '0')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">🟢 {t('kpi_surplus')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-success-600)] text-xl">
            {fmtMoney(s?.surplusMinor ?? '0')}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ms-border)] bg-white p-4">
          <div className="text-[var(--ms-text-muted)] text-xs">📊 {t('kpi_net')}</div>
          <div className="mt-1 font-semibold text-[var(--ms-text-primary)] text-xl">
            {fmtMoney(s?.netMinor ?? '0')}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActions() {
  const t = useTranslations('pages.analitika_inventory');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--ms-border)] bg-white p-2 shadow-sm">
      <Link
        href="/analitika/inventerizatsiya/count"
        className="rounded-md bg-[var(--ms-text-brand)] px-3 py-1.5 font-semibold text-sm text-white hover:opacity-90"
      >
        + {t('qa_new_count')}
      </Link>
      <Link
        href="/analitika/inventerizatsiya/approvals"
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-semibold text-amber-800 text-sm hover:bg-amber-100"
      >
        {t('qa_review')}
      </Link>
      <Link
        href="/analitika/inventerizatsiya/reports"
        className="rounded-md border border-[var(--ms-border)] bg-white px-3 py-1.5 font-semibold text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-subtle)]"
      >
        {t('qa_reports')}
      </Link>
    </div>
  );
}

function PendingCallout({
  count,
  label,
  actionLabel,
}: {
  count: number;
  label: string;
  actionLabel: string;
}) {
  return (
    <Link
      href="/analitika/inventerizatsiya/approvals"
      className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100"
    >
      <span className="flex items-center gap-2 text-sm">
        <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-500 px-1.5 font-bold text-white text-xs tabular-nums">
          {count}
        </span>
        <span>{label}</span>
      </span>
      <span className="font-medium text-xs">{actionLabel}</span>
    </Link>
  );
}
