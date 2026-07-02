'use client';

/**
 * EditAttendanceModal — admin editor for a single attendance row.
 *
 * - Edit check-in/check-out datetime
 * - "Tozalash" mini-button clears check-out (employee returns to "Working")
 * - Notes textarea
 * - Delete button (red, with confirm) removes the row entirely
 */

import { hrAttendanceApi } from '@/lib/hr-api';
import type { HrAttendanceRow } from '@/lib/hr-api';
import { Button, Icons, Input, Modal, Textarea, useConfirm, useToast } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface EditAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: HrAttendanceRow | null;
}

function toLocalDatetimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  // datetime-local expects "YYYY-MM-DDTHH:mm" in local time.
  // Browser's local time is fine — server stores UTC, app shows Asia/Tashkent.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditAttendanceModal({ open, onOpenChange, row }: EditAttendanceModalProps) {
  const t = useTranslations('pages.hrAttendance');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [checkInTime, setCheckInTime] = useState<string>('');
  const [checkOutTime, setCheckOutTime] = useState<string>('');
  const [clearOnSave, setClearOnSave] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setCheckInTime(toLocalDatetimeInput(row.checkInTime));
    setCheckOutTime(toLocalDatetimeInput(row.checkOutTime));
    setClearOnSave(false);
    setNotes(row.notes ?? '');
    setError(null);
  }, [open, row]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!row) throw new Error('No row');
      return hrAttendanceApi.edit(row.id, {
        checkInTime: checkInTime ? new Date(checkInTime).toISOString() : undefined,
        checkOutTime: clearOnSave || !checkOutTime ? null : new Date(checkOutTime).toISOString(),
        clearCheckOut: clearOnSave || undefined,
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-attendance'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => {
      if (!row) throw new Error('No row');
      return hrAttendanceApi.remove(row.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-attendance'] });
      toast.success(tCommon('deleted'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!checkInTime) {
      setError(t('check_in'));
      return;
    }
    saveMut.mutate();
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('delete_confirm'),
      description: t('delete_confirm_desc'),
      confirmLabel: tCommon('delete'),
      cancelLabel: tCommon('cancel'),
      tone: 'destructive',
    });
    if (ok) deleteMut.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('edit_title')}
      widthClass="w-[520px]"
      testId="hr-attendance-edit-modal"
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!row || deleteMut.isPending}
            data-test-id="hr-attendance-edit-delete"
          >
            <Icons.delete className="h-4 w-4" />
            {tCommon('delete')}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              data-test-id="hr-attendance-edit-cancel"
            >
              {tCommon('cancel')}
            </Button>
            <Button
              onClick={submit}
              disabled={saveMut.isPending}
              data-test-id="hr-attendance-edit-save"
            >
              {tCommon('save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {row && (
          <div className="text-[var(--ms-text-muted)] text-sm">
            {t('employee')}: <span className="font-medium">{row.employee.name}</span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-attendance-edit-in"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('check_in')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Input
            id="hr-attendance-edit-in"
            type="datetime-local"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            className="w-auto"
            data-test-id="hr-attendance-edit-in-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="hr-attendance-edit-out"
              className="font-medium text-[var(--ms-text-primary)] text-sm"
            >
              {t('check_out')}
            </label>
            {(checkOutTime || row?.checkOutTime) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCheckOutTime('');
                  setClearOnSave(true);
                }}
                className="gap-1 text-xs"
                data-test-id="hr-attendance-edit-clear-out"
              >
                <Icons.refresh className="h-3 w-3" />
                {t('clear_check_out')}
              </Button>
            )}
          </div>
          <Input
            id="hr-attendance-edit-out"
            type="datetime-local"
            value={checkOutTime}
            onChange={(e) => {
              setCheckOutTime(e.target.value);
              setClearOnSave(false);
            }}
            className="w-auto"
            data-test-id="hr-attendance-edit-out-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-attendance-edit-notes"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('notes')}
          </label>
          <Textarea
            id="hr-attendance-edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            data-test-id="hr-attendance-edit-notes"
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-attendance-edit-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
