'use client';

import { api } from '@/lib/api-client';
import { archivedTone } from '@/lib/archived-tone';
import { Badge, Button, Input } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface MeProfile {
  id: string;
  email: string;
  name: string;
  fullName: string | null;
  position: string | null;
  phone: string | null;
  username: string | null;
  archived: boolean;
  lastLoginAt: string | null;
}

/**
 * Mening profilim — read-only identity card + 2-field editor (fullName,
 * phone). Mirrors the reference /staff/me page. Other fields (email, login,
 * position) are admin-owned and shown as locked rows. Password changes go
 * through /sozlamalar (existing change-password flow).
 */
export default function AnalitikaStaffMePage() {
  const t = useTranslations('pages.analitika_me');
  const qc = useQueryClient();

  const meQuery = useQuery<MeProfile>({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<MeProfile>('/auth/me'),
  });

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});

  useEffect(() => {
    if (meQuery.data) {
      setFullName(meQuery.data.fullName ?? '');
      setPhone(meQuery.data.phone ?? '');
    }
  }, [meQuery.data]);

  const save = useMutation({
    mutationFn: (body: { fullName: string | null; phone: string | null }) =>
      api.patch<MeProfile>('/auth/me', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  if (meQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</p>
      </div>
    );
  }
  if (!meQuery.data) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-[var(--ms-destructive-500)] text-sm">{t('load_failed')}</p>
      </div>
    );
  }

  const me = meQuery.data;
  const dirty = (me.fullName ?? '') !== fullName || (me.phone ?? '') !== phone;

  const handleSave = () => {
    const errs: { fullName?: string; phone?: string } = {};
    if (fullName.trim().length === 0) errs.fullName = t('err_name_required');
    if (phone.trim() && !/^\+?\d{9,15}$/.test(phone.trim())) errs.phone = t('err_phone_format');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    save.mutate({
      fullName: fullName.trim() || null,
      phone: phone.trim() || null,
    });
  };

  const handleReset = () => {
    setFullName(me.fullName ?? '');
    setPhone(me.phone ?? '');
    setErrors({});
  };

  return (
    <div className="space-y-4 p-6">
      <Link
        href="/analitika/xodimlar"
        className="text-[var(--ms-text-brand)] text-sm hover:underline"
      >
        {t('back')}
      </Link>

      <div>
        <h1 className="font-bold text-2xl text-[var(--ms-text-primary)] tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-1 text-[var(--ms-text-muted)] text-sm">{t('subtitle')}</p>
      </div>

      {/* Profile card */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white">
        <div className="border-[var(--ms-border)] border-b bg-[var(--ms-bg-subtle)] px-4 py-2.5">
          <h2 className="font-semibold text-[var(--ms-text-primary)] text-sm">
            {t('section_profile')}
          </h2>
        </div>
        <div className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label={t('label_email')} value={me.email} hint={t('hint_admin_only')} />
            <ReadOnlyField
              label={t('label_username')}
              value={me.username ?? '—'}
              hint={t('hint_admin_only')}
            />
            <EditableField label={t('label_full_name')} required error={errors.fullName}>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('label_full_name_ph')}
              />
            </EditableField>
            <EditableField label={t('label_phone')} error={errors.phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998901234567"
              />
            </EditableField>
            <ReadOnlyField
              label={t('label_position')}
              value={me.position ?? '—'}
              hint={t('hint_admin_only')}
            />
            <ReadOnlyField
              label={t('label_status')}
              value={
                <Badge tone={archivedTone(me.archived)}>
                  {me.archived ? t('status_archived') : t('status_active')}
                </Badge>
              }
            />
          </div>

          {save.isError && (
            <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800 text-sm">
              {(save.error as Error)?.message ?? 'Error'}
            </p>
          )}
          {save.isSuccess && !dirty && (
            <p className="text-[var(--ms-success-600)] text-sm">{t('saved')}</p>
          )}

          <div className="flex items-center justify-end gap-2 border-[var(--ms-border)] border-t pt-3">
            {dirty && (
              <Button variant="secondary" onClick={handleReset} disabled={save.isPending}>
                {t('cancel')}
              </Button>
            )}
            <Button onClick={handleSave} disabled={!dirty || save.isPending}>
              {save.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      </section>

      {/* Last login card */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white">
        <div className="border-[var(--ms-border)] border-b bg-[var(--ms-bg-subtle)] px-4 py-2.5">
          <h2 className="font-semibold text-[var(--ms-text-primary)] text-sm">
            {t('section_last_login')}
          </h2>
        </div>
        <div className="p-4">
          {me.lastLoginAt ? (
            <p className="text-[var(--ms-text-primary)] text-sm">
              {new Date(me.lastLoginAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          ) : (
            <p className="text-[var(--ms-text-muted)] text-sm">{t('no_login_history')}</p>
          )}
        </div>
      </section>

      {/* Password change link */}
      <section className="rounded-lg border border-[var(--ms-border)] bg-white">
        <div className="border-[var(--ms-border)] border-b bg-[var(--ms-bg-subtle)] px-4 py-2.5">
          <h2 className="font-semibold text-[var(--ms-text-primary)] text-sm">
            {t('section_password')}
          </h2>
        </div>
        <div className="p-4">
          <p className="text-[var(--ms-text-muted)] text-sm">{t('password_hint')}</p>
          <Link
            href="/analitika/sozlamalar"
            className="mt-2 inline-block text-[var(--ms-text-brand)] text-sm hover:underline"
          >
            {t('password_link')} →
          </Link>
        </div>
      </section>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <div className="text-[var(--ms-text-muted)]">{label}</div>
      <div className="rounded-md bg-[var(--ms-bg-subtle)] px-3 py-2 text-[var(--ms-text-primary)]">
        {value}
      </div>
      {hint && <p className="text-[10px] text-[var(--ms-text-muted)]">{hint}</p>}
    </div>
  );
}

function EditableField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children is an Input control rendered by the design system.
    <label className="block text-sm">
      <span className="block text-[var(--ms-text-muted)]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-red-600 text-xs">{error}</p>}
    </label>
  );
}
