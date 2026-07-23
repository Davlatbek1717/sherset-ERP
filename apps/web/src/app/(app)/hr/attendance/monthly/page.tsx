'use client';

/**
 * HR Davomat → oylik hisobot. Per-employee monthly attendance (schedule x
 * attendance): late total, present/absent/day-off counts + per-day detail,
 * with Excel + print export.
 */

import { AttendanceStatusBadge } from '@/components/hr/attendance-status-badge';
import { api } from '@/lib/api-client';
import { type DavomatMonthlyReport, hrDavomatReportApi, hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeRow } from '@/lib/hr-api';
import { Button, EmptyState, Input, NativeSelect, Skeleton, StatCard } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

function currentYearMonth(): string {
  // Static default is fine; the user picks the month. Avoid Date in module scope.
  return new Date().toISOString().slice(0, 7);
}

export default function DavomatMonthlyPage() {
  const t = useTranslations('pages.davomatReport');
  const tCommon = useTranslations('common');
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [employeeId, setEmployeeId] = useState('');

  const { data: employees = [] } = useQuery<HrEmployeeRow[]>({
    queryKey: ['hr-employees', 'davomat-filter'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }).then((r) => r.rows),
  });

  const filter = { yearMonth, ...(employeeId ? { employeeId } : {}) };
  const {
    data: report,
    isLoading,
    isError,
  } = useQuery<DavomatMonthlyReport>({
    queryKey: ['davomat-monthly', yearMonth, employeeId],
    queryFn: () => hrDavomatReportApi.monthly(filter),
  });

  const totals = (report?.employees ?? []).reduce(
    (a, e) => ({
      late: a.late + e.lateMinutesTotal,
      present: a.present + e.presentDays,
      absent: a.absent + e.absentDays,
      dayoff: a.dayoff + e.dayOffDays,
    }),
    { late: 0, present: 0, absent: 0, dayoff: 0 },
  );
  const lateH = Math.floor(totals.late / 60);
  const lateM = totals.late % 60;

  const exportExcel = () =>
    api.download(hrDavomatReportApi.monthlyXlsxUrl(filter), `davomat-${yearMonth}.xlsx`);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
          <p className="text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
        </div>
        <Link
          href="/hr/attendance"
          className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
        >
          ← {tCommon('back')}
        </Link>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('month_label')}</span>
          <Input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[var(--ms-text-muted)] text-xs">{t('employee_label')}</span>
          <NativeSelect value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t('employee_all')}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={exportExcel}>
            {t('export_excel')}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            {t('print')}
          </Button>
        </div>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t('kpi_late_total')}
          value={t('hours_minutes', { h: lateH, m: lateM })}
          tone="destructive"
        />
        <StatCard label={t('kpi_present')} value={totals.present} tone="success" />
        <StatCard label={t('kpi_absent')} value={totals.absent} tone="warning" />
        <StatCard label={t('kpi_dayoff')} value={totals.dayoff} tone="neutral" />
        <StatCard label={t('kpi_employees')} value={report?.employees.length ?? 0} tone="neutral" />
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <EmptyState title={tCommon('action_failed')} />
        ) : !report || report.employees.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-thead-bg)] text-[var(--ms-thead-text)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('col_employee')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_date')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_checkin')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_checkout')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('col_late')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {report.employees.flatMap((emp) =>
                emp.rows.map((row) => (
                  <tr
                    key={`${emp.employeeId}-${row.date}`}
                    className={`border-[var(--ms-border-default)] border-b last:border-b-0 ${
                      row.status === 'late'
                        ? 'bg-[var(--ms-row-unpaid-bg)]'
                        : row.status === 'absent'
                          ? 'bg-[var(--ms-bg-muted)] text-[var(--ms-text-placeholder)]'
                          : ''
                    }`}
                  >
                    <td className="px-3 py-1.5 text-[var(--ms-text-primary)]">{emp.name}</td>
                    <td className="px-3 py-1.5 font-mono text-[var(--ms-text-muted)] text-xs">
                      {row.date}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-mono ${
                        row.lateMinutes > 0
                          ? 'font-semibold text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-primary)]'
                      }`}
                    >
                      {row.checkIn ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[var(--ms-text-primary)]">
                      {row.checkOut ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[var(--ms-text-primary)]">
                      {row.lateMinutes > 0 ? `+${row.lateMinutes}` : '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <AttendanceStatusBadge status={row.status} lateMinutes={row.lateMinutes} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
