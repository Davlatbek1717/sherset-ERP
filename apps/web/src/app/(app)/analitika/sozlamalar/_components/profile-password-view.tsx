'use client';

import { api } from '@/lib/api-client';
import { Button, PasswordInput } from '@moysklad/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Me {
  id: string;
  email: string | null;
  name: string;
  position: string | null;
  lastLoginAt: string | null;
}

export function ProfilePasswordView() {
  const t = useTranslations('pages.analitika_settings');
  const tCommon = useTranslations('common');
  const me = useQuery<Me>({ queryKey: ['auth', 'me'], queryFn: () => api.get<Me>('/auth/me') });

  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { oldPassword: oldPw, newPassword: newPw }),
    onSuccess: () => {
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
      setLocalError(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (newPw !== confirmPw) {
      setLocalError(t('password_mismatch'));
      return;
    }
    change.mutate();
  };

  const disabled =
    change.isPending || oldPw.length === 0 || newPw.length < 8 || confirmPw.length < 8;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Profile card */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-medium text-[var(--ms-text-primary)]">{t('profile_title')}</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Field label={t('profile_name')} value={me.data?.name ?? '—'} />
          <Field label={t('profile_email')} value={me.data?.email ?? '—'} />
          <Field label={t('profile_position')} value={me.data?.position ?? '—'} />
          <Field
            label={t('profile_last_login')}
            value={
              me.data?.lastLoginAt ? new Date(me.data.lastLoginAt).toLocaleString('ru-RU') : '—'
            }
          />
        </dl>
      </section>

      {/* Password form */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
        <h2 className="font-medium text-[var(--ms-text-primary)]">{t('password_title')}</h2>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('password_hint')}</p>
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm" htmlFor="profile-old-password">
            <span className="block text-[var(--ms-text-muted)]">{t('old_password')}</span>
            <PasswordInput
              id="profile-old-password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              className="mt-1"
              autoComplete="current-password"
              showLabel={tCommon('show_password')}
              hideLabel={tCommon('hide_password')}
            />
          </label>
          <label className="block text-sm" htmlFor="profile-new-password">
            <span className="block text-[var(--ms-text-muted)]">{t('new_password')}</span>
            <PasswordInput
              id="profile-new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="mt-1"
              autoComplete="new-password"
              showLabel={tCommon('show_password')}
              hideLabel={tCommon('hide_password')}
            />
          </label>
          <label className="block text-sm" htmlFor="profile-confirm-password">
            <span className="block text-[var(--ms-text-muted)]">{t('confirm_password')}</span>
            <PasswordInput
              id="profile-confirm-password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="mt-1"
              autoComplete="new-password"
              showLabel={tCommon('show_password')}
              hideLabel={tCommon('hide_password')}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={disabled}>
              {t('change_password_btn')}
            </Button>
            {change.isSuccess && (
              <span className="text-[var(--ms-success-600)] text-sm">{t('password_changed')}</span>
            )}
            {(localError || change.isError) && (
              <span className="text-[var(--ms-destructive-500)] text-sm">
                {localError ?? (change.error as Error)?.message}
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--ms-text-muted)]">{label}</dt>
      <dd className="text-[var(--ms-text-primary)]">{value}</dd>
    </div>
  );
}
