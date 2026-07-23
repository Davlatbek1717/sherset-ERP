'use client';

/**
 * HR Employee «Ish jadvali» tab — per-weekday GPS-davomat schedule + branch
 * (work-location) assignment + attendance opt-in.
 */

import { WeekScheduleGrid } from '@/components/hr/week-schedule-grid';
import {
  type HrEmployeeDetail,
  type HrWeekDay,
  type HrWorkLocation,
  hrEmployeeApi,
  hrScheduleApi,
  hrWorkLocationApi,
} from '@/lib/hr-api';
import { Button, NativeSelect, Skeleton, Switch, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TabBar } from '../../_components/tab-bar';

export default function HrEmployeeSchedulePage() {
  const t = useTranslations('pages.employeeSchedule');
  const tEmp = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: employee, isLoading } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrEmployeeApi.findOne(id),
    enabled: !!id,
  });
  const { data: week } = useQuery<HrWeekDay[]>({
    queryKey: ['hr-employee-schedule', id],
    queryFn: () => hrScheduleApi.getWeek(id),
    enabled: !!id,
  });
  const { data: branches = [] } = useQuery<HrWorkLocation[]>({
    queryKey: ['hr-work-locations'],
    queryFn: () => hrWorkLocationApi.list(),
  });

  const [days, setDays] = useState<HrWeekDay[]>([]);
  const [workLocationId, setWorkLocationId] = useState<string>('');
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    if (week) setDays(week);
  }, [week]);
  useEffect(() => {
    if (employee) {
      setWorkLocationId(employee.workLocationId ?? '');
      setOptIn(employee.attendanceOptIn ?? false);
    }
  }, [employee]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await hrScheduleApi.replaceWeek(id, days);
      await hrScheduleApi.setConfig(id, {
        workLocationId: workLocationId || null,
        attendanceOptIn: optIn,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employee', id] });
      qc.invalidateQueries({ queryKey: ['hr-employee-schedule', id] });
      toast.success(tCommon('saved'));
    },
    onError: (e: Error) => toast.error(tCommon('action_failed'), { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Link
        href="/hr/employees"
        className="text-[var(--ms-text-muted)] text-sm hover:text-[var(--ms-text-brand)]"
      >
        ← {tCommon('back')}
      </Link>

      <h1 className="font-semibold text-2xl text-[var(--ms-text-strong)]">
        {isLoading ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <>
            {employee?.name ? `${employee.name} — ` : ''}
            {tEmp('tab_schedule')}
          </>
        )}
      </h1>

      <TabBar employeeId={id} active="schedule" />

      <div className="max-w-2xl space-y-6 pt-2">
        {/* Branch + opt-in */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">
              {t('branch_label')}
            </span>
            <NativeSelect
              value={workLocationId}
              onChange={(e) => setWorkLocationId(e.target.value)}
            >
              <option value="">{t('branch_none')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">
              {t('optin_label')}
            </span>
            <div className="flex min-h-[36px] items-center gap-2">
              <Switch checked={optIn} onCheckedChange={(v) => setOptIn(v === true)} />
              <span className="text-[var(--ms-text-muted)] text-sm">{t('optin_hint')}</span>
            </div>
          </div>
        </div>

        {/* Weekly schedule */}
        <WeekScheduleGrid value={days} onChange={setDays} />

        <div className="flex justify-end">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            data-test-id="schedule-save"
          >
            {t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
