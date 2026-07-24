'use client';

/**
 * HR Attendance — davomat sahifasi. 2 tab: Bugun (TodayTab) + Hisobot (ReportTab).
 * Admin xodimlarning kelish/ketish vaqtlarini boshqaradi.
 */

import { activeTone } from '@/lib/domain-status-tone';
import {
  type HrAttendanceRow,
  type HrEmployeeListResult,
  hrAttendanceApi,
  hrEmployeeApi,
} from '@/lib/hr-api';
import { Avatar, Badge, Button, EmptyState, Input, NativeSelect, Skeleton } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckInModal } from './_components/check-in-modal';
import { EditAttendanceModal } from './_components/edit-attendance-modal';

const TZ = 'Asia/Tashkent';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'HH:mm');
}

function fmtDate(iso: string): string {
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd');
}

function duration(checkIn: string, checkOut: string | null): string {
  if (!checkOut) return '—';
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return '—';
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours} soat ${minutes} daqiqa`;
}

export default function HrAttendancePage() {
  const t = useTranslations('pages.hrAttendance');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [tab, setTab] = useState<'today' | 'report'>('today');
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<HrAttendanceRow | null>(null);

  // Report filter state
  const todayStr = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [employeeFilter, setEmployeeFilter] = useState('');

  // Today tab data
  const todayQuery = useQuery<HrAttendanceRow[]>({
    queryKey: ['hr-attendance', 'today'],
    queryFn: () => hrAttendanceApi.listToday(),
    enabled: tab === 'today',
  });

  // Report tab data
  const reportQuery = useQuery<HrAttendanceRow[]>({
    queryKey: ['hr-attendance', 'report', dateFrom, dateTo, employeeFilter],
    queryFn: () =>
      hrAttendanceApi.report({
        dateFrom,
        dateTo,
        ...(employeeFilter ? { employeeId: employeeFilter } : {}),
      }),
    enabled: tab === 'report',
  });

  // Employee list for report filter dropdown
  const empQuery = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'for-attendance-filter'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: tab === 'report',
  });

  const checkOutMut = useMutation({
    mutationFn: (id: string) => hrAttendanceApi.checkOut(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-attendance'] }),
  });

  const tabs: Array<{ id: 'today' | 'report'; label: string }> = useMemo(
    () => [
      { id: 'today', label: t('today_tab') },
      { id: 'report', label: t('report_tab') },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/hr/attendance/monthly"
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] px-3 py-1.5 font-medium text-[var(--ms-text-primary)] text-sm hover:bg-[var(--ms-bg-app)]"
          >
            {t('monthly_report')}
          </Link>
          {tab === 'today' && (
            <Button onClick={() => setCheckInOpen(true)} data-test-id="hr-attendance-mark-check-in">
              {t('mark_check_in')}
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
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
            data-test-id={`hr-attendance-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Today tab */}
      {tab === 'today' && (
        <div className="space-y-2">
          {todayQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : todayQuery.data && todayQuery.data.length > 0 ? (
            <table
              className="w-full border-collapse text-sm"
              data-test-id="hr-attendance-today-table"
            >
              <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">{t('employee')}</th>
                  <th className="px-3 py-2 text-left">{t('check_in')}</th>
                  <th className="px-3 py-2 text-right">{t('late')}</th>
                  <th className="px-3 py-2 text-left">{t('check_out')}</th>
                  <th className="px-3 py-2 text-left">{t('status')}</th>
                  <th className="px-3 py-2 text-right">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {todayQuery.data.map((row) => (
                  <tr
                    key={row.id}
                    className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={row.employee.name} size="sm" />
                        <span>{row.employee.name}</span>
                      </div>
                    </td>
                    <td
                      className={`px-3 py-2 font-mono ${
                        row.lateMinutes && row.lateMinutes > 0
                          ? 'font-semibold text-[var(--ms-text-destructive)]'
                          : 'text-[var(--ms-text-strong)]'
                      }`}
                    >
                      {fmtTime(row.checkInTime)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.lateMinutes && row.lateMinutes > 0 ? (
                        <Badge tone="destructive">+{row.lateMinutes}</Badge>
                      ) : (
                        <span className="text-[var(--ms-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {row.checkOutTime ? (
                        <span className="text-[var(--ms-text-strong)]">
                          {fmtTime(row.checkOutTime)}
                        </span>
                      ) : (
                        <span className="text-[var(--ms-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={activeTone(!row.checkOutTime)}>
                        {row.checkOutTime ? t('left') : t('working')}
                      </Badge>
                      {row.source === 'auto_gps' && (
                        <Badge tone="neutral" className="ml-1">
                          {t('source_auto')}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {!row.checkOutTime && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => checkOutMut.mutate(row.id)}
                            disabled={checkOutMut.isPending}
                            data-test-id={`hr-attendance-mark-check-out-${row.id}`}
                          >
                            {t('mark_check_out')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingRow(row)}
                          data-test-id={`hr-attendance-edit-${row.id}`}
                        >
                          {tCommon('edit')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={t('empty_today')} />
          )}
        </div>
      )}

      {/* Report tab */}
      {tab === 'report' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-att-date-from" className="text-[var(--ms-text-muted)] text-xs">
                {t('date_from')}
              </label>
              <Input
                id="hr-att-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-att-date-to" className="text-[var(--ms-text-muted)] text-xs">
                {t('date_to')}
              </label>
              <Input
                id="hr-att-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-auto"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="hr-att-emp" className="text-[var(--ms-text-muted)] text-xs">
                {t('filter_employee')}
              </label>
              <NativeSelect
                id="hr-att-emp"
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="w-auto"
              >
                <option value="">{t('filter_employee_all')}</option>
                {(empQuery.data?.rows ?? []).map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {reportQuery.isLoading ? (
            <Skeleton className="h-40" />
          ) : reportQuery.data && reportQuery.data.length > 0 ? (
            <table
              className="w-full border-collapse text-sm"
              data-test-id="hr-attendance-report-table"
            >
              <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">{t('date')}</th>
                  <th className="px-3 py-2 text-left">{t('employee')}</th>
                  <th className="px-3 py-2 text-left">{t('check_in')}</th>
                  <th className="px-3 py-2 text-left">{t('check_out')}</th>
                  <th className="px-3 py-2 text-left">{t('duration')}</th>
                  <th className="px-3 py-2 text-left">{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {reportQuery.data.map((row) => (
                  <tr
                    key={row.id}
                    className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                  >
                    <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)]">
                      {fmtDate(row.checkInTime)}
                    </td>
                    <td className="px-3 py-2">{row.employee.name}</td>
                    <td className="px-3 py-2 font-mono">{fmtTime(row.checkInTime)}</td>
                    <td className="px-3 py-2 font-mono">{fmtTime(row.checkOutTime)}</td>
                    <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                      {duration(row.checkInTime, row.checkOutTime)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={activeTone(!row.checkOutTime)}>
                        {row.checkOutTime ? t('left') : t('working')}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={t('empty_report')} />
          )}
        </div>
      )}

      <CheckInModal open={checkInOpen} onOpenChange={setCheckInOpen} />
      <EditAttendanceModal
        open={editingRow !== null}
        onOpenChange={(o) => !o && setEditingRow(null)}
        row={editingRow}
      />
    </div>
  );
}
