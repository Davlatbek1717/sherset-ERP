'use client';

/**
 * "Qo'lda davomat yaratish" — admin manual attendance for the dashboard.
 * Pick an employee + branch + date/time, then Kelish (check-in) or Ketish
 * (check-out). Times are Tashkent-local; we append the fixed +05:00 offset so
 * the server records the exact instant. See spec §5.3.
 */

import { hrAttendanceApi, hrEmployeeApi, hrWorkLocationApi } from '@/lib/hr-api';
import type { HrEmployeeListResult, HrWorkLocation } from '@/lib/hr-api';
import { Button, Input, Modal, NativeSelect, Textarea, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const TZ = 'Asia/Tashkent';

export function ManualAttendanceModal({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
}) {
  const t = useTranslations('pages.hrDashboard');
  const tAtt = useTranslations('pages.hrAttendance');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState('');
  const [workLocationId, setWorkLocationId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(() => formatInTimeZone(new Date(), TZ, 'HH:mm'));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmployeeId('');
    setWorkLocationId('');
    setDate(defaultDate);
    setTime(formatInTimeZone(new Date(), TZ, 'HH:mm'));
    setNotes('');
    setError(null);
  }, [open, defaultDate]);

  const { data: empData } = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'for-manual-attendance'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: open,
  });
  const { data: branches = [] } = useQuery<HrWorkLocation[]>({
    queryKey: ['hr-work-locations'],
    queryFn: () => hrWorkLocationApi.list(),
    enabled: open,
  });

  // Tashkent is a fixed +05:00 (no DST), so stamping the offset is exact.
  const atIso = () => `${date}T${time}:00+05:00`;

  const done = () => {
    qc.invalidateQueries({ queryKey: ['hr-attendance-dashboard'] });
    toast.success(tCommon('saved'));
    onOpenChange(false);
  };

  const checkInMut = useMutation({
    mutationFn: () =>
      hrAttendanceApi.checkIn({
        employeeId,
        at: atIso(),
        workLocationId: workLocationId || null,
        notes: notes.trim() || null,
      }),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });
  const checkOutMut = useMutation({
    // Omit `notes` entirely when blank so a check-out never wipes an existing
    // note on the open record (backend preserves the column when notes is
    // undefined, but overwrites on null).
    mutationFn: () =>
      hrAttendanceApi.checkOutManual({
        employeeId,
        at: atIso(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
    onSuccess: done,
    onError: (e: Error) => setError(e.message),
  });

  const guard = (fn: () => void) => {
    setError(null);
    if (!employeeId) {
      setError(t('select_employee_required'));
      return;
    }
    fn();
  };

  const pending = checkInMut.isPending || checkOutMut.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('manual_title')}
      widthClass="w-[480px]"
      testId="hr-manual-attendance-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => guard(() => checkOutMut.mutate())}
            disabled={pending}
            className="text-[var(--ms-text-destructive)]"
            data-test-id="hr-manual-leave"
          >
            {t('btn_leave')}
          </Button>
          <Button
            onClick={() => guard(() => checkInMut.mutate())}
            disabled={pending}
            data-test-id="hr-manual-arrive"
          >
            {t('btn_arrive')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <Labeled label={tAtt('employee')}>
          <NativeSelect
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            data-test-id="hr-manual-employee"
          >
            <option value="">{t('select_employee')}</option>
            {(empData?.rows ?? []).map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </NativeSelect>
        </Labeled>

        <Labeled label={t('col_branches')}>
          <NativeSelect
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
            data-test-id="hr-manual-branch"
          >
            <option value="">{t('select_branch')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </Labeled>

        <div className="grid grid-cols-2 gap-3">
          <Labeled label={t('field_date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Labeled>
          <Labeled label={t('field_time')}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Labeled>
        </div>

        <Labeled label={tAtt('notes')}>
          {/* DS Textarea, not a raw tag — MASTER-TODO #12. The hand-rolled
              class list was a copy of the DS baseline; keeping it meant this
              field drifted from every other multi-line input in the app. */}
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            data-test-id="hr-manual-notes"
          />
        </Labeled>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-manual-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-[var(--ms-text-primary)] text-sm">{label}</span>
      {children}
    </div>
  );
}
