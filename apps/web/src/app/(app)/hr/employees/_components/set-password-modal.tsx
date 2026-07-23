'use client';

/**
 * SetPasswordModal — sets username + password for an HR Employee.
 *
 * Calls POST /hr/employees/:id/set-password. The server enforces username
 * regex (`[a-zA-Z0-9_-]+`, 3-50 chars) and password length (4-200 chars);
 * we mirror that validation client-side as a UX nicety only — the server
 * is the source of truth.
 */

import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeRow } from '@/lib/hr-api';
import { Button, Input, Modal, PasswordInput, useToast } from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// Owner 2026-07-19 (second report): the login is FREE-FORM — no character
// rules. Only non-empty + ≤50 (DB column size) stay, mirroring the server.
const USERNAME_MAX = 50;

export interface SetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Pick<HrEmployeeRow, 'id' | 'name' | 'username'> | null;
}

export function SetPasswordModal({ open, onOpenChange, employee }: SetPasswordModalProps) {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(employee?.username ?? '');
    setPassword('');
    setError(null);
  }, [open, employee]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!employee) throw new Error('No employee selected');
      return hrEmployeeApi.setPassword(employee.id, { username, password });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      if (employee) qc.invalidateQueries({ queryKey: ['hr-employee', employee.id] });
      toast.success(t('set_password_success'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    const trimmedUsername = username.trim();
    if (!trimmedUsername || trimmedUsername.length > USERNAME_MAX) {
      setError(t('set_password_username_hint'));
      return;
    }
    if (password.length < 4) {
      setError(`${t('set_password_password')} ≥ 4`);
      return;
    }
    saveMut.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`${t('set_password_title')}${employee ? ` — ${employee.name}` : ''}`}
      widthClass="w-[480px]"
      testId="hr-set-password-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            data-test-id="hr-set-password-cancel"
          >
            {tCommon('cancel')}
          </Button>
          <Button onClick={submit} disabled={saveMut.isPending} data-test-id="hr-set-password-save">
            {t('set_password_save')}
          </Button>
        </div>
      }
    >
      <div
        className="flex flex-col gap-4 p-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-set-password-username"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('set_password_username')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <Input
            id="hr-set-password-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-auto"
            data-test-id="hr-set-password-username"
          />
          <span className="text-[var(--ms-text-muted)] text-xs">
            {t('set_password_username_hint')}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-set-password-password"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('set_password_password')}
            <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>
          </label>
          <PasswordInput
            id="hr-set-password-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-auto"
            data-test-id="hr-set-password-password"
            showLabel={tCommon('show_password')}
            hideLabel={tCommon('hide_password')}
          />
        </div>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-set-password-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
