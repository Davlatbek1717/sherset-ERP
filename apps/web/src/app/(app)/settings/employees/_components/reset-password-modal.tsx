'use client';

/**
 * moysklad «Сбросить пароль» — on our clone the admin sets the login +
 * a new password directly (no reset e-mail flow yet). POSTs to the existing
 * /hr/employees/:id/set-password endpoint (username + password, min 4 chars).
 */

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Input, Modal, PasswordInput } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ResetPasswordModal({
  open,
  onOpenChange,
  employeeId,
  currentUsername,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  currentUsername: string;
  onDone: () => void;
}) {
  const t = useTranslations('pages.employee_card');
  const tCommon = useTranslations('common');
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername(currentUsername);
      setPassword('');
      setError(null);
    }
  }, [open, currentUsername]);

  const mutation = useApiMutation<unknown, Error, void>({
    mutationFn: () => api.post(`/hr/employees/${employeeId}/set-password`, { username, password }),
    successMessage: t('password_saved'),
    onSuccess: () => {
      onOpenChange(false);
      onDone();
    },
  });

  function submit() {
    // Owner 2026-07-19: free-form login — only non-empty + ≤50 (DB size).
    if (!username.trim() || username.trim().length > 50) {
      setError(t('login_too_short'));
      return;
    }
    if (password.length < 4) {
      setError(t('password_too_short'));
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('reset_password')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={mutation.isPending}
            data-testid="reset-password-save"
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-4" data-testid="reset-password-modal">
        {/* autoComplete guards — Chrome ADMIN loginini tiqmasin (owner report). */}
        <label className="flex flex-col gap-1 text-[13px] text-[var(--ms-text-secondary)]">
          {t('login')}
          <Input
            name="employee-reset-login"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="reset-password-username"
          />
        </label>
        <label
          className="flex flex-col gap-1 text-[13px] text-[var(--ms-text-secondary)]"
          htmlFor="employee-reset-password"
        >
          {t('new_password')}
          <PasswordInput
            id="employee-reset-password"
            name="employee-reset-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="reset-password-password"
            showLabel={tCommon('show_password')}
            hideLabel={tCommon('hide_password')}
          />
        </label>
        {error && <div className="text-[var(--ms-text-destructive)] text-xs">{error}</div>}
      </div>
    </Modal>
  );
}
