'use client';

/**
 * CheckInModal — marks an employee's check-in for today.
 *
 * Employee dropdown filters out anyone who already has a today row
 * (fetched from hrAttendanceApi.listToday). Optional notes textarea.
 * Calls POST /hr/attendance/check-in on submit.
 */

import { hrAttendanceApi, hrEmployeeApi } from '@/lib/hr-api';
import type { HrAttendanceRow, HrEmployeeListResult } from '@/lib/hr-api';
import { Button, Modal, NativeSelect, Textarea, useToast } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export interface CheckInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckInModal({ open, onOpenChange }: CheckInModalProps) {
  const t = useTranslations('pages.hrAttendance');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [employeeId, setEmployeeId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { data: empData } = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'for-attendance'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: open,
  });

  const { data: todayRows = [] } = useQuery<HrAttendanceRow[]>({
    queryKey: ['hr-attendance', 'today'],
    queryFn: () => hrAttendanceApi.listToday(),
    enabled: open,
  });

  // Reset form whenever opening
  useEffect(() => {
    if (!open) return;
    setEmployeeId('');
    setNotes('');
    setError(null);
  }, [open]);

  const availableEmployees = useMemo(() => {
    const checkedInIds = new Set(todayRows.map((r) => r.employeeId));
    return (empData?.rows ?? []).filter((e) => !checkedInIds.has(e.id));
  }, [empData, todayRows]);

  const saveMut = useMutation({
    mutationFn: () =>
      hrAttendanceApi.checkIn({
        employeeId,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-attendance'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!employeeId) {
      setError(t('select_employee'));
      return;
    }
    saveMut.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('check_in_title')}
      widthClass="w-[480px]"
      testId="hr-attendance-check-in-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            data-test-id="hr-attendance-check-in-cancel"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={saveMut.isPending || availableEmployees.length === 0}
            data-test-id="hr-attendance-check-in-save"
          >
            {t('mark_check_in')}
          </Button>
        </div>
      }
    >
      <div
        className="flex flex-col gap-4 p-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-attendance-employee"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('employee')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <NativeSelect
            id="hr-attendance-employee"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={availableEmployees.length === 0}
            className="w-auto"
            data-test-id="hr-attendance-employee-select"
          >
            <option value="">{t('select_employee')}</option>
            {availableEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </NativeSelect>
          {availableEmployees.length === 0 && (
            <span className="text-[var(--ms-text-muted)] text-xs">
              {t('no_employees_available')}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-attendance-notes"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('notes')}
          </label>
          <Textarea
            id="hr-attendance-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            data-test-id="hr-attendance-notes"
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-attendance-check-in-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
