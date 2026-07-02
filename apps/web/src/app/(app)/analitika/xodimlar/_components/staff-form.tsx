'use client';

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { systemTone } from '@/lib/domain-status-tone';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Badge, Button, Input, Switch } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

interface StaffDetailMinimal {
  id: string;
  roles: Array<{ id: string; name: string; isSystem: boolean }>;
}

interface BaseFields {
  email: string;
  name: string;
  fullName: string;
  position: string;
  phone: string;
  username: string;
  password: string;
  roleIds: string[];
}

const blankFields: BaseFields = {
  email: '',
  name: '',
  fullName: '',
  position: '',
  phone: '',
  username: '',
  password: '',
  roleIds: [],
};

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<BaseFields> & { id?: string; archived?: boolean; version?: number };
  staffId?: string;
}

/**
 * Shared 2-step wizard for create + edit. Step 1 is identity/credentials;
 * step 2 is RBAC role assignment. On submit, create posts to /analitika/staff
 * and edit patches /analitika/staff/:id. The same component drives /yangi
 * (create) and the edit panel on /xodimlar/[id] so spacing, validation and
 * keyboard behaviour stay identical.
 */
export function StaffForm({ mode, initial, staffId }: Props) {
  const t = useTranslations('pages.analitika_staff');
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [fields, setFields] = useState<BaseFields>({ ...blankFields, ...initial });
  const [showPassword, setShowPassword] = useState(false);
  const [archived, setArchived] = useState(initial?.archived ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const roleQuery = useQuery<RoleOption[]>({
    queryKey: ['analitika', 'staff', 'roles'],
    queryFn: () => api.get<RoleOption[]>('/analitika/staff/roles'),
    staleTime: 5 * 60 * 1000,
  });

  // On an optimistic-lock 409 (another admin / the HR form / a self-profile
  // edit changed this employee while this form was open) show the localized
  // reload dialog. Reloading invalidates the detail query; the parent re-keys
  // <StaffForm key={data.version}> so the form remounts and re-seeds from the
  // fresh server copy (the local field state is seeded once on mount).
  const onConflict = useConflictReload(['analitika', 'staff-detail', staffId]);

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<StaffDetailMinimal>('/analitika/staff', body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['analitika', 'staff-list'] });
      router.push(`/analitika/xodimlar/${data.id}`);
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<StaffDetailMinimal>(`/analitika/staff/${staffId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analitika', 'staff-list'] });
      qc.invalidateQueries({ queryKey: ['analitika', 'staff-detail', staffId] });
    },
    onError: (e: Error) => {
      // Route a real conflict to the reload dialog; other errors fall through
      // to the inline banner below.
      if (isOptimisticConflict(e)) onConflict();
    },
  });

  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!fields.email.trim()) errs.email = t('err_email_required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()))
      errs.email = t('err_email_invalid');
    if (!fields.name.trim()) errs.name = t('err_name_required');
    if (mode === 'create' && fields.password.length < 8) errs.password = t('err_password_min');
    if (mode === 'edit' && fields.password.length > 0 && fields.password.length < 8)
      errs.password = t('err_password_min');
    if (fields.phone.trim() && !/^\+?\d{9,15}$/.test(fields.phone.trim()))
      errs.phone = t('err_phone_format');
    if (fields.username.trim() && !/^[a-z0-9_]+$/.test(fields.username.trim()))
      errs.username = t('err_username_format');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep1()) setStep(2);
  };

  const handleSubmit = () => {
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    const body: Record<string, unknown> = {
      email: fields.email.trim(),
      name: fields.name.trim(),
      fullName: fields.fullName.trim() || undefined,
      position: fields.position.trim() || undefined,
      phone: fields.phone.trim() || undefined,
      username: fields.username.trim() || undefined,
      roleIds: fields.roleIds,
    };
    if (fields.password) body.password = fields.password;
    if (mode === 'edit') {
      body.archived = archived;
      // Optimistic-lock token the form loaded — the backend 409s if it's stale.
      body.version = initial?.version ?? 0;
    }
    if (mode === 'create') createMut.mutate(body);
    else updateMut.mutate(body);
  };

  const toggleRole = (id: string) => {
    setFields((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id],
    }));
  };

  const mut = mode === 'create' ? createMut : updateMut;

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-3">
        <StepPip n={1} label={t('step_basic')} active={step === 1} done={step > 1} />
        <div className="h-px w-10 bg-[var(--ms-border)]" aria-hidden="true" />
        <StepPip n={2} label={t('step_roles')} active={step === 2} done={false} />
      </div>

      {step === 1 && (
        <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
          <h3 className="font-semibold text-[var(--ms-text-primary)] text-sm">{t('step_basic')}</h3>
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('step_basic_hint')}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t('label_email')} required error={errors.email}>
              <Input
                type="email"
                value={fields.email}
                onChange={(e) => setFields({ ...fields, email: e.target.value })}
                placeholder="user@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label={t('label_name')} required error={errors.name}>
              <Input
                value={fields.name}
                onChange={(e) => setFields({ ...fields, name: e.target.value })}
                placeholder={t('label_name_ph')}
              />
            </Field>
            <Field label={t('label_full_name')} error={errors.fullName}>
              <Input
                value={fields.fullName}
                onChange={(e) => setFields({ ...fields, fullName: e.target.value })}
                placeholder={t('label_full_name_ph')}
              />
            </Field>
            <Field label={t('label_position')} error={errors.position}>
              <Input
                value={fields.position}
                onChange={(e) => setFields({ ...fields, position: e.target.value })}
                placeholder={t('label_position_ph')}
              />
            </Field>
            <Field label={t('label_phone')} error={errors.phone}>
              <Input
                value={fields.phone}
                onChange={(e) => setFields({ ...fields, phone: e.target.value })}
                placeholder="+998901234567"
              />
            </Field>
            <Field label={t('label_username')} error={errors.username}>
              <Input
                value={fields.username}
                onChange={(e) => setFields({ ...fields, username: e.target.value.toLowerCase() })}
                placeholder="user_login"
              />
            </Field>
            <Field
              label={mode === 'create' ? t('label_password') : t('label_password_reset')}
              required={mode === 'create'}
              error={errors.password}
              className="sm:col-span-2"
            >
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={fields.password}
                  onChange={(e) => setFields({ ...fields, password: e.target.value })}
                  placeholder={
                    mode === 'create' ? t('label_password_ph') : t('label_password_reset_ph')
                  }
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="-translate-y-1/2 absolute top-1/2 right-2 px-1 text-[var(--ms-text-muted)] text-xs hover:text-[var(--ms-text-primary)]"
                  aria-label={showPassword ? t('hide') : t('show')}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </Field>
            {mode === 'edit' && (
              <div className="sm:col-span-2">
                <label className="flex items-center gap-3" htmlFor="archived-switch">
                  <Switch
                    id="archived-switch"
                    checked={archived}
                    onCheckedChange={(v) => setArchived(Boolean(v))}
                  />
                  <span className="text-[var(--ms-text-primary)] text-sm">
                    {t('label_archived')}
                  </span>
                  <span className="text-[var(--ms-text-muted)] text-xs">
                    {t('label_archived_hint')}
                  </span>
                </label>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-[var(--ms-border)] bg-white p-5">
          <h3 className="font-semibold text-[var(--ms-text-primary)] text-sm">{t('step_roles')}</h3>
          <p className="mt-1 text-[var(--ms-text-muted)] text-xs">{t('step_roles_hint')}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(roleQuery.data ?? []).map((r) => {
              const checked = fields.roleIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRole(r.id)}
                  className={`flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors ${
                    checked
                      ? 'border-[var(--ms-text-brand)] bg-[var(--ms-bg-subtle)] ring-1 ring-[var(--ms-text-brand)]'
                      : 'border-[var(--ms-border)] hover:border-[var(--ms-text-brand)]'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ms-text-primary)] text-sm">
                      {r.name}
                    </span>
                    <span className="flex items-center gap-1">
                      {r.isSystem && (
                        <Badge tone={systemTone(r.isSystem)}>{t('role_system_badge')}</Badge>
                      )}
                      {checked && <span className="text-[var(--ms-text-brand)]">✓</span>}
                    </span>
                  </div>
                  {r.description && (
                    <span className="text-[var(--ms-text-muted)] text-xs">{r.description}</span>
                  )}
                </button>
              );
            })}
            {roleQuery.isLoading && (
              <div className="col-span-full text-[var(--ms-text-muted)] text-sm">
                {t('loading')}
              </div>
            )}
          </div>
          <p className="mt-3 text-[var(--ms-text-muted)] text-xs">
            {t('roles_selected', { n: fields.roleIds.length })}
          </p>
        </section>
      )}

      {/* A 409 conflict is handled by the reload dialog (onConflict), not shown
          here — only surface other errors in the inline banner. */}
      {mut.isError && !isOptimisticConflict(mut.error) && (
        <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800 text-sm">
          {(mut.error as Error)?.message ?? 'Error'}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <a
          href="/analitika/xodimlar"
          className="text-[var(--ms-text-muted)] text-sm hover:underline"
        >
          {t('cancel')}
        </a>
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← {t('back')}
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={handleNext}>{t('next')} →</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={mut.isPending}>
              {mut.isPending
                ? t('saving')
                : mode === 'create'
                  ? t('create_submit')
                  : t('save_submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepPip({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full font-semibold text-xs ${
          active
            ? 'bg-[var(--ms-text-brand)] text-white'
            : done
              ? 'bg-[var(--ms-text-brand)]/20 text-[var(--ms-text-brand)]'
              : 'bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)]'
        }`}
      >
        {done ? '✓' : n}
      </div>
      <span
        className={`text-sm ${active ? 'font-semibold text-[var(--ms-text-primary)]' : 'text-[var(--ms-text-muted)]'}`}
      >
        {label}
      </span>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children is an Input control rendered by the design system.
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="block text-[var(--ms-text-muted)]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-red-600 text-xs">{error}</p>}
    </label>
  );
}
