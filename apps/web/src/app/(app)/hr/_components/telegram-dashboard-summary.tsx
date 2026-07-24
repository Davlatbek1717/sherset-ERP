'use client';

/**
 * Telegram/outbox activity summary — the former /hr dashboard content, kept as
 * a secondary section beneath the new attendance board (spec §5.3). Realtime
 * stat cards + 7-day sent-message AreaChart + recent messages.
 */

import { hrMessageStatusTone } from '@/lib/domain-status-tone';
import { type HrDashboardSummary, hrDashboardApi } from '@/lib/hr-api';
import { Badge, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TZ = 'Asia/Tashkent';

function fmtDateTime(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, 'MM-dd HH:mm');
}

export function TelegramDashboardSummary() {
  const t = useTranslations('pages.hrDashboard');
  const tMessages = useTranslations('pages.hrMessages');

  const query = useQuery<HrDashboardSummary>({
    queryKey: ['hr-dashboard-summary'],
    queryFn: () => hrDashboardApi.summary(),
    refetchInterval: 30_000,
  });

  if (query.isLoading) return <Skeleton className="h-64" />;
  const d = query.data;
  if (!d) return null;

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-[var(--ms-text-strong)] text-lg">
        {t('telegram_section')}
      </h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t('total_counterparties')} value={d.totalCounterparties} />
        <StatCard label={t('telegram_connected')} value={d.telegramConnectedSlots} />
        <StatCard label={t('sent_today')} value={d.messagesSentToday} tone="success" />
        <StatCard label={t('failed')} value={d.messagesFailed} tone="destructive" />
        <StatCard label={t('pending_tasks')} value={d.pendingTasks} />
        <StatCard label={t('pending_reviews')} value={d.pendingReviews} tone="warning" />
      </div>

      <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-3 font-medium text-[var(--ms-text-strong)] text-sm">
          {t('sent_7days')}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.sentSeries} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ms-border-default)" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
                fontSize={11}
                stroke="var(--ms-text-muted)"
              />
              <YAxis allowDecimals={false} fontSize={11} stroke="var(--ms-text-muted)" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="sent"
                stroke="#9fcf6a"
                fill="#daf3c0"
                name={t('sent_today')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
        <div className="mb-3 font-medium text-[var(--ms-text-strong)] text-sm">{t('recent')}</div>
        {d.recentMessages.length > 0 ? (
          <table className="w-full border-collapse text-sm" data-test-id="hr-dashboard-recent">
            <tbody>
              {d.recentMessages.map((m) => (
                <tr key={m.id} className="border-[var(--ms-border-default)] border-t">
                  <td className="py-2 pr-3 font-mono text-[var(--ms-text-muted)] text-xs">
                    {fmtDateTime(m.createdAt)}
                  </td>
                  <td className="py-2 pr-3">{m.counterpartyName ?? m.toPhone}</td>
                  <td className="py-2 text-right">
                    <Badge tone={hrMessageStatusTone(m.status)}>
                      {tMessages(`status_${m.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-[var(--ms-text-muted)] text-sm">{t('recent_empty')}</div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning' | 'destructive';
}) {
  const valueColor =
    tone === 'success'
      ? 'text-[var(--ms-text-success)]'
      : tone === 'destructive'
        ? 'text-[var(--ms-text-destructive)]'
        : tone === 'warning'
          ? 'text-[var(--ms-text-warning)]'
          : 'text-[var(--ms-text-strong)]';
  return (
    <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <div className={`font-semibold text-2xl ${valueColor}`}>{value}</div>
      <div className="mt-1 text-[var(--ms-text-muted)] text-xs">{label}</div>
    </div>
  );
}
