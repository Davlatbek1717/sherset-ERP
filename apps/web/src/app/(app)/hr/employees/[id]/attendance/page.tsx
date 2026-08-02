'use client';

/**
 * HR Employee «Davomat» tab — per-employee monthly attendance (kel-ket + late).
 * Consolidation (egasi 2026-08-01): davomat now lives INSIDE the employee page.
 * Reuses the existing monthly report API filtered by employeeId.
 */

import { type DavomatMonthlyReport, hrDavomatReportApi, hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeDetail } from '@/lib/hr-api';
import { Badge, EmptyState, Input, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { TabBar } from '../../_components/tab-bar';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  absent: 'destructive',
  dayoff: 'neutral',
};

export default function HrEmployeeAttendancePage() {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  const { data: employee } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });

  const { data, isLoading } = useQuery<DavomatMonthlyReport>({
    queryKey: ['hr-employee-attendance', id, yearMonth],
    queryFn: () => hrDavomatReportApi.monthly({ yearMonth, employeeId: id }),
    enabled: !!id,
  });

  const emp = data?.employees?.[0];
  const rows = emp?.rows ?? [];

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
          {t('tab_attendance')}
        </h1>
      </div>

      <TabBar employeeId={id} active="attendance" />

      <div className="flex items-center gap-3">
        <label htmlFor="ym" className="text-[var(--ms-text-muted)] text-sm">
          {t('attendance_month')}
        </label>
        <Input
          id="ym"
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value || currentYearMonth())}
          className="w-40"
        />
      </div>

      {emp && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge tone="success">
            {t('attendance_present')}: {emp.presentDays}
          </Badge>
          <Badge tone="warning">
            {t('attendance_late')}: {emp.lateDays}
          </Badge>
          <Badge tone="destructive">
            {t('attendance_absent')}: {emp.absentDays}
          </Badge>
          <Badge tone="neutral">
            {t('attendance_late_total')}: {emp.lateMinutesTotal} {t('attendance_min')}
          </Badge>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title={t('attendance_empty')} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t('attendance_date')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('attendance_checkin')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('attendance_checkout')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('attendance_late')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('attendance_status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-[var(--ms-border-default)] border-t">
                  <td className="px-3 py-2 tabular-nums">{r.date}</td>
                  <td className="px-3 py-2 tabular-nums">{r.checkIn ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{r.checkOut ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.lateMinutes > 0 ? r.lateMinutes : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                      {t(`attendance_st_${r.status}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
