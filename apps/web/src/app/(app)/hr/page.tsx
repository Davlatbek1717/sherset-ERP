'use client';

/**
 * HR Boshqaruv paneli — TimePay attendance board. Date picker + 4 KPI cards
 * (Barchasi/Ishda/Kech/Ishda emas) + "Xodimlar davomati" table + manual
 * attendance modal. The former Telegram dashboard lives below as a secondary
 * section. See spec §5.3.
 */

import { fmtHhMm, fmtOvertime } from '@/lib/attendance-format';
import { type HrAttendanceDashboard, hrDavomatReportApi } from '@/lib/hr-api';
import { Avatar, Button, EmptyState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ManualAttendanceModal } from './_components/manual-attendance-modal';
import { TelegramDashboardSummary } from './_components/telegram-dashboard-summary';

const TZ = 'Asia/Tashkent';
const todayIso = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
const hhmm = (iso: string | null) => (iso ? formatInTimeZone(new Date(iso), TZ, 'HH:mm') : '--:--');

export default function HrHomePage() {
  const t = useTranslations('pages.hrDashboard');
  const [date, setDate] = useState(todayIso());
  const [manualOpen, setManualOpen] = useState(false);

  const units = { h: t('unit_hour_short'), m: t('unit_minute_short') };

  const { data, isLoading } = useQuery<HrAttendanceDashboard>({
    queryKey: ['hr-attendance-dashboard', date],
    queryFn: () => hrDavomatReportApi.dashboard(date),
    refetchInterval: 30_000,
  });

  const counts = data?.counts ?? { all: 0, atWork: 0, late: 0, absent: 0 };
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 py-1.5 text-sm text-[var(--ms-text-primary)]"
            data-test-id="hr-dashboard-date"
          />
          <Button onClick={() => setManualOpen(true)} data-test-id="hr-dashboard-manual">
            + {t('create_manual')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t('kpi_all')} value={counts.all} tone="strong" />
        <KpiCard label={t('kpi_at_work')} value={counts.atWork} tone="success" />
        <KpiCard label={t('kpi_late')} value={counts.late} tone="warning" />
        <KpiCard label={t('kpi_absent')} value={counts.absent} tone="destructive" />
      </div>

      <div>
        <h2 className="mb-2 font-semibold text-[var(--ms-text-strong)] text-lg">
          {t('table_title')}
        </h2>
        <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          {isLoading ? (
            <div className="p-4">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState title={t('empty_day')} />
          ) : (
            <table className="w-full text-sm">
              <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('table_title')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_check_in')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_check_out')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_overtime')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_total')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('col_branches')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.employeeId}
                    className="border-[var(--ms-border-default)] border-b last:border-b-0"
                    data-test-id={`hr-dashboard-row-${row.employeeId}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.employee.name} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[var(--ms-text-primary)]">
                            {row.employee.name}
                          </div>
                          <div className="truncate text-[var(--ms-text-muted)] text-[11px]">
                            {row.employee.department || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 font-mono ${
                        row.lateMinutes > 0
                          ? 'font-semibold text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-strong)]'
                      }`}
                    >
                      {hhmm(row.checkIn)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--ms-text-strong)]">
                      {hhmm(row.checkOut)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)]">
                      {fmtOvertime(row.overtimeMinutes, units)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--ms-text-strong)]">
                      {fmtHhMm(row.totalMinutes)}
                    </td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                      {row.branches.length > 0 ? row.branches.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <TelegramDashboardSummary />

      <ManualAttendanceModal open={manualOpen} onOpenChange={setManualOpen} defaultDate={date} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'strong' | 'success' | 'warning' | 'destructive';
}) {
  const color = {
    strong: 'text-[var(--ms-text-strong)]',
    success: 'text-[var(--ms-text-success)]',
    warning: 'text-[var(--ms-text-warning)]',
    destructive: 'text-[var(--ms-text-destructive)]',
  }[tone];
  return (
    <div className="rounded-[var(--ms-radius-lg)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-4">
      <div className={`font-semibold text-3xl ${color}`}>{value}</div>
      <div className="mt-1 text-[var(--ms-text-muted)] text-sm">{label}</div>
    </div>
  );
}
