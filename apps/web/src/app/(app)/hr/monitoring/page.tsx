'use client';

/**
 * Xodimlarni kuzatish — live status board. Date + status filter; columns
 * Xodim / Lavozim / Holati (two badges: attendance-state + presence) / Filial /
 * Jadval. Row → per-employee marks. Dashboard KPI cards deep-link here via
 * ?status=. See spec §5.5.
 */

import { AttendanceStatusBadge } from '@/components/hr/attendance-status-badge';
import { type MonitoringDailyResult, type MonitoringStatus, hrMonitoringApi } from '@/lib/hr-api';
import { Avatar, EmptyState, NativeSelect, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const TZ = 'Asia/Tashkent';
const todayIso = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
const STATUSES: MonitoringStatus[] = ['all', 'late', 'ontime', 'at_work', 'absent'];

export default function HrMonitoringPage() {
  const t = useTranslations('pages.hrMonitoring');
  const router = useRouter();
  const params = useSearchParams();

  const [date, setDate] = useState(params.get('date') || todayIso());
  const [status, setStatus] = useState<MonitoringStatus>(
    (params.get('status') as MonitoringStatus) || 'all',
  );

  const { data, isLoading } = useQuery<MonitoringDailyResult>({
    queryKey: ['hr-monitoring', 'daily', date, status],
    queryFn: () => hrMonitoringApi.daily({ date, status }),
    refetchInterval: 30_000,
  });

  const rows = data?.rows ?? [];
  const openDetail = (id: string) => router.push(`/hr/monitoring/${id}?from=${date}&to=${date}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1.5 text-sm text-[var(--ms-text-primary)]"
            data-test-id="hr-monitoring-date"
            aria-label={t('date_label')}
          />
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as MonitoringStatus)}
            className="w-auto"
            data-test-id="hr-monitoring-status"
            aria-label={t('status_label')}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status_${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_employee')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_position')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_state')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_branch')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_schedule')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.employeeId}
                  tabIndex={0}
                  className="cursor-pointer border-[var(--ms-border-default)] border-b last:border-b-0 hover:bg-[var(--ms-bg-hover)] focus:bg-[var(--ms-bg-hover)] focus:outline-none"
                  onClick={() => openDetail(row.employeeId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDetail(row.employeeId);
                    }
                  }}
                  data-test-id={`hr-monitoring-row-${row.employeeId}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-medium text-[var(--ms-text-primary)]">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.position || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.attendanceState && (
                        <AttendanceStatusBadge
                          status={row.attendanceState}
                          lateMinutes={row.lateMinutes}
                        />
                      )}
                      <AttendanceStatusBadge status={row.presence} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.workLocation?.name || '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.schedule && !row.schedule.isDayOff
                      ? `${row.schedule.startTime}–${row.schedule.endTime}`
                      : t('dayoff')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
