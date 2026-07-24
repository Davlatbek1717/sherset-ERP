'use client';

/**
 * Per-employee monitoring detail — attendance "belgilar" (marks) over a date
 * range, grouped by local day. Each mark: time / type (Kirish/Chiqish) /
 * state / location (open-on-map) / photo (deferred). See spec §5.5.
 */

import { AttendanceStatusBadge } from '@/components/hr/attendance-status-badge';
import { type MonitoringMark, type MonitoringMarksResult, hrMonitoringApi } from '@/lib/hr-api';
import { Badge, EmptyState, ErrorState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

const TZ = 'Asia/Tashkent';
const todayIso = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
const dayOf = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd');
const hhmm = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'HH:mm');
const osmUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

export default function HrMonitoringDetailPage() {
  const t = useTranslations('pages.hrMonitoring');
  const params = useParams<{ employeeId: string }>();
  const search = useSearchParams();
  const employeeId = params.employeeId;
  const from = search.get('from') || todayIso();
  const to = search.get('to') || from;

  const { data, isLoading, error, refetch } = useQuery<MonitoringMarksResult>({
    queryKey: ['hr-monitoring', 'marks', employeeId, from, to],
    queryFn: () => hrMonitoringApi.marks(employeeId, { from, to }),
    enabled: !!employeeId,
  });

  // Group marks by local calendar day.
  const groups = new Map<string, MonitoringMark[]>();
  for (const m of data?.marks ?? []) {
    const day = dayOf(m.at);
    const list = groups.get(day);
    if (list) list.push(m);
    else groups.set(day, [m]);
  }
  const days = [...groups.keys()].sort().reverse();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/hr/monitoring" className="text-[var(--ms-text-link)] text-sm hover:underline">
          ← {t('back')}
        </Link>
        <h1 className="mt-1 font-semibold text-2xl text-[var(--ms-text-strong)]">
          {data?.employee.name ?? ''}
          {data?.employee.position ? (
            <span className="ml-2 font-normal text-[var(--ms-text-muted)] text-base">
              {data.employee.position}
            </span>
          ) : null}
        </h1>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorState
          title={t('title')}
          description={(error as Error).message}
          onRetry={() => refetch()}
        />
      ) : days.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        days.map((day) => (
          <div key={day} className="space-y-2">
            <h2 className="font-medium text-[var(--ms-text-strong)] text-sm">
              {t('marks_title', { date: day })}
            </h2>
            <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
              <table className="w-full text-sm">
                <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('col_time')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('col_type')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('col_state')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('col_location')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('col_photo')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(groups.get(day) ?? []).map((m, i) => (
                    <tr
                      key={`${m.id}-${m.type}-${i}`}
                      className="border-[var(--ms-border-default)] border-b last:border-b-0"
                    >
                      <td className="px-3 py-2 font-mono text-[var(--ms-text-strong)]">
                        {hhmm(m.at)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={m.type === 'entry' ? 'success' : 'neutral'}>
                          {m.type === 'entry' ? t('type_entry') : t('type_exit')}
                        </Badge>
                        {m.autoClosed && (
                          <span className="ml-1 text-[var(--ms-text-muted)] text-[11px]">
                            {t('auto_closed')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {m.state ? (
                          <AttendanceStatusBadge status={m.state} lateMinutes={m.lateMinutes} />
                        ) : (
                          <span className="text-[var(--ms-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {m.lat !== null && m.lng !== null ? (
                          <a
                            href={osmUrl(m.lat, m.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--ms-text-link)] hover:underline"
                          >
                            {t('open_on_map')}
                          </a>
                        ) : (
                          <span className="text-[var(--ms-text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                        {t('no_photo')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
