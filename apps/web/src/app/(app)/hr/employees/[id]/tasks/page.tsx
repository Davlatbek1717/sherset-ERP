'use client';

/**
 * HR Employee «Vazifalar» tab — tasks assigned to THIS employee + their status.
 * Consolidation (egasi 2026-08-01): per-employee task history now lives inside
 * the employee page. Reuses the task-logs API filtered by employeeId.
 */

import { hrTaskLogStatusTone } from '@/lib/domain-status-tone';
import { type HrTaskLogListResult, hrEmployeeApi, hrTaskSendApi } from '@/lib/hr-api';
import type { HrEmployeeDetail } from '@/lib/hr-api';
import { Badge, EmptyState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TabBar } from '../../_components/tab-bar';

const TZ = 'Asia/Tashkent';
const fmt = (iso: string | null) =>
  iso ? formatInTimeZone(new Date(iso), TZ, 'dd.MM.yyyy HH:mm') : '—';

export default function HrEmployeeTasksPage() {
  const t = useTranslations('pages.hrEmployees');
  const tTasks = useTranslations('pages.hrTasks');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });

  const { data, isLoading } = useQuery<HrTaskLogListResult>({
    queryKey: ['hr-employee-tasks', id],
    queryFn: () => hrTaskSendApi.listLogs({ employeeId: id, limit: 100 }),
    enabled: !!id,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Link
        href="/hr/employees"
        className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
      >
        ← {tCommon('back')}
      </Link>

      <div>
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
          {employee?.name ? `${employee.name} — ` : ''}
          {t('tab_tasks')}
        </h1>
      </div>

      <TabBar employeeId={id} active="tasks" />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title={t('tasks_empty')} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('tasks_col_title')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tasks_col_status')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tasks_col_sent')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('tasks_col_answered')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-[var(--ms-border-default)] border-t">
                  <td className="px-3 py-2">{r.template?.title ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={hrTaskLogStatusTone(r.status)}>
                      {tTasks(`status_${r.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmt(r.sentAt)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(r.answeredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
