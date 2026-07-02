'use client';

/**
 * HR My Tasks — xodimning shaxsiy vazifalari. 2 tab:
 *   • Yangi — status='sent' (hali javob berilmagan); xodim "Ha/Yo'q/Matn" javob beradi.
 *   • Barchasi — tarix (javoblar, tasdiqlar, jarima/mukofotlar).
 * Server endpoint /hr/tasks/logs avtomat user.sub bo'yicha filter qiladi (own_only).
 */

import { hrTaskLogStatusTone } from '@/lib/domain-status-tone';
import { type HrTaskLogRow, hrTaskSendApi } from '@/lib/hr-api';
import { Badge, Button, EmptyState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AnswerModal } from './_components/answer-modal';

const TZ = 'Asia/Tashkent';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd HH:mm');
}

function fmtMinor(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = Number(v) / 100;
  if (!Number.isFinite(n) || n === 0) return null;
  return `${new Intl.NumberFormat('uz-UZ').format(n)} so'm`;
}

export default function HrMyTasksPage() {
  const t = useTranslations('pages.hrMyTasks');
  const tTasks = useTranslations('pages.hrTasks');

  const [tab, setTab] = useState<'new' | 'all'>('new');
  const [answeringFor, setAnsweringFor] = useState<HrTaskLogRow | null>(null);

  const newQuery = useQuery<{ rows: HrTaskLogRow[]; total: number }>({
    queryKey: ['hr-my-tasks', 'new'],
    queryFn: () => hrTaskSendApi.listLogs({ status: 'sent', limit: 100 }),
    enabled: tab === 'new',
  });

  const allQuery = useQuery<{ rows: HrTaskLogRow[]; total: number }>({
    queryKey: ['hr-my-tasks', 'all'],
    queryFn: () => hrTaskSendApi.listLogs({ limit: 200 }),
    enabled: tab === 'all',
  });

  const rows = tab === 'new' ? (newQuery.data?.rows ?? []) : (allQuery.data?.rows ?? []);
  const isLoading = tab === 'new' ? newQuery.isLoading : allQuery.isLoading;

  const tabs = useMemo(
    () => [
      { id: 'new' as const, label: t('tab_new'), count: newQuery.data?.total ?? 0 },
      { id: 'all' as const, label: t('tab_all'), count: allQuery.data?.total ?? 0 },
    ],
    [t, newQuery.data?.total, allQuery.data?.total],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>

      <div className="flex border-[var(--ms-border-default)] border-b">
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
              tab === item.id
                ? 'border-[var(--ms-border-focus)] text-[var(--ms-text-strong)]'
                : 'border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text-primary)]'
            }`}
            data-test-id={`hr-my-tasks-tab-${item.id}`}
          >
            {item.label}
            <span className="ml-2 text-[var(--ms-text-muted)] text-xs">({item.count})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-my-tasks-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_sent_at')}</th>
              <th className="px-3 py-2 text-left">{t('col_template')}</th>
              <th className="px-3 py-2 text-left">{t('col_status')}</th>
              <th className="px-3 py-2 text-right">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => {
              const reward = fmtMinor(log.template?.rewardMinor);
              const fine = fmtMinor(log.template?.fineMinor);
              return (
                <tr
                  key={log.id}
                  className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                  data-test-id={`hr-my-tasks-row-${log.id}`}
                >
                  <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                    {fmtDateTime(log.sentAt)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--ms-text-strong)]">
                      {log.template?.title ?? '—'}
                    </div>
                    <div className="mt-1 flex gap-2 text-xs">
                      {reward && (
                        <span className="text-emerald-600 dark:text-emerald-400">+{reward}</span>
                      )}
                      {fine && <span className="text-red-600 dark:text-red-400">−{fine}</span>}
                    </div>
                    {log.responseText && (
                      <div className="mt-1 line-clamp-1 text-[var(--ms-text-muted)] text-xs">
                        “{log.responseText}”
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={hrTaskLogStatusTone(log.status)}>
                      {tTasks(`status_${log.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {log.status === 'sent' && (
                      <Button
                        size="sm"
                        onClick={() => setAnsweringFor(log)}
                        data-test-id={`hr-my-tasks-answer-${log.id}`}
                      >
                        {t('answer')}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState title={tab === 'new' ? t('empty_new') : t('empty_all')} />
      )}

      <AnswerModal log={answeringFor} onClose={() => setAnsweringFor(null)} />
    </div>
  );
}
