'use client';

/**
 * EmployeeModal — create + edit HR Employee.
 *
 * Two modes:
 *   - mode='create' → POST /hr/employees
 *   - mode='edit'   → PUT  /hr/employees/:id (initialValues required)
 *
 * Fields (moysklad-parity):
 *   1. Ism Familiya*
 *   2. Email
 *   3. Telefon
 *   4. Telegram telefon
 *   5. Bo'lim
 *   6. Rollar (multi-select via RoleMultiSelect)
 *   7. Tekshiruvchi (checkbox)
 *   8. MoySklad agent (MoyskladAgentDropdown)
 *
 * On success invalidates ['hr-employees'] and closes the modal.
 */

import { useConflictReload } from '@/hooks/use-conflict-reload';
import { api } from '@/lib/api-client';
import { hrEmployeeApi } from '@/lib/hr-api';
import type { HrEmployeeCreateInput, HrEmployeeDetail, HrEmployeeRow } from '@/lib/hr-api';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Button, Checkbox, Input, Modal } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MoyskladAgentDropdown } from './moysklad-agent-dropdown';
import { RoleMultiSelect } from './role-multi-select';

export interface EmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Required when mode='edit'. Pre-fills the form. */
  initialValues?: HrEmployeeRow | HrEmployeeDetail | null;
  /** Called after successful create/update; useful to refetch parent list. */
  onSuccess?: (row: HrEmployeeRow) => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  telegramPhone: string;
  department: string;
  hrRoles: string[];
  isChecker: boolean;
  moyskladAgentId: string | null;
  username: string;
  password: string;
  skladNo: string; // '' = biriktirilmagan
}

function emptyForm(): FormState {
  return {
    name: '',
    email: '',
    phone: '',
    telegramPhone: '',
    department: '',
    hrRoles: [],
    isChecker: false,
    moyskladAgentId: null,
    username: '',
    password: '',
    skladNo: '',
  };
}

function rowToForm(row: HrEmployeeRow | HrEmployeeDetail, skladNo?: number | null): FormState {
  return {
    name: row.name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    telegramPhone: row.telegramPhone ?? '',
    department: row.department ?? '',
    hrRoles: row.hrRoles ?? [],
    isChecker: row.isChecker,
    moyskladAgentId: row.moyskladAgentId,
    username: '',
    password: '',
    skladNo: skladNo != null ? String(skladNo) : '',
  };
}

export function EmployeeModal({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSuccess,
}: EmployeeModalProps) {
  const t = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);

  // Mavjud sklad birikmalari — edit rejimida xodimning hozirgi skladi aniqlanadi
  const { data: keepersData } = useQuery<{ items: Array<{ skladNo: number; employeeId: string }> }>({
    queryKey: ['sklad-keepers'],
    queryFn: () => api.get('/sklad-keepers'),
    enabled: open,
  });

  // Reset / hydrate when opening
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialValues) {
      const currentSklad = keepersData?.items.find((k) => k.employeeId === initialValues.id);
      setForm(rowToForm(initialValues, currentSklad?.skladNo ?? null));
      setVersion(initialValues.version);
    } else {
      setForm(emptyForm());
      setVersion(0);
    }
    setError(null);
  }, [open, mode, initialValues, keepersData]);

  const buildPayload = (): HrEmployeeCreateInput => ({
    name: form.name.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || null,
    telegramPhone: form.telegramPhone.trim() || null,
    department: form.department.trim() || null,
    hrRoles: form.hrRoles,
    isChecker: form.isChecker,
    moyskladAgentId: form.moyskladAgentId,
    ...(mode === 'create' && form.username.trim() && { username: form.username.trim() }),
    ...(mode === 'create' && form.password && { password: form.password }),
  });

  // On an optimistic-lock 409 (another user / the staff form / a self-profile
  // edit changed this employee while the modal was open) show the localized
  // reload dialog. The modal hydrates from a captured list/detail row, not a
  // live query, so re-hydration refetches the fresh record and re-seeds the
  // form + version, keeping the modal open with the latest copy (the user's
  // unsaved edits are discarded — moysklad does the same).
  const onConflict = useConflictReload(['hr-employee', initialValues?.id ?? ''], async () => {
    if (mode !== 'edit' || !initialValues) return;
    const fresh = await hrEmployeeApi.findOne(initialValues.id);
    setForm(rowToForm(fresh));
    setVersion(fresh.version);
    qc.invalidateQueries({ queryKey: ['hr-employees'] });
  });

  const saveMut = useMutation({
    mutationFn: async (): Promise<HrEmployeeRow> => {
      const payload = buildPayload();
      const saved =
        mode === 'edit' && initialValues
          ? await hrEmployeeApi.update(initialValues.id, { ...payload, version })
          : await hrEmployeeApi.create(payload);

      // Sklad biriktirish / o'chirish
      const newSkladNo = form.skladNo.trim() !== '' ? Number(form.skladNo) : null;
      const prevSkladNo = keepersData?.items.find((k) => k.employeeId === saved.id)?.skladNo ?? null;

      if (newSkladNo != null) {
        // Yangi yoki o'zgargan sklad
        await api.put('/sklad-keepers', { skladNo: newSkladNo, employeeId: saved.id });
      } else if (prevSkladNo != null) {
        // Sklad o'chirilgan — eski biriktmani olib tashlash
        await api.delete(`/sklad-keepers/${prevSkladNo}`);
      }

      return saved;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      qc.invalidateQueries({ queryKey: ['sklad-keepers'] });
      if (mode === 'edit' && initialValues) {
        qc.invalidateQueries({ queryKey: ['hr-employee', initialValues.id] });
      }
      onSuccess?.(row);
      onOpenChange(false);
    },
    onError: (e: Error) => {
      if (isOptimisticConflict(e)) {
        onConflict();
        return;
      }
      setError(e.message);
    },
  });

  const submit = () => {
    setError(null);
    if (!form.name.trim()) { setError('Ism familiya kiritilishi shart'); return; }
    if (!form.phone.trim()) { setError('Telefon raqam kiritilishi shart'); return; }
    if (form.hrRoles.length === 0) { setError('Kamida bitta rol tanlanishi shart'); return; }
    if (mode === 'create') {
      if (!form.username.trim()) { setError('Login kiritilishi shart'); return; }
      if (!form.password) { setError('Parol kiritilishi shart'); return; }
      if (form.password.length < 4) { setError('Parol kamida 4 belgi bolishi kerak'); return; }
    }
    saveMut.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'edit' ? t('edit_title') : t('create_title')}
      widthClass="w-[640px]"
      testId="hr-employee-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            data-test-id="hr-employee-modal-cancel"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={saveMut.isPending}
            data-test-id="hr-employee-modal-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2" onKeyDown={handleKeyDown}>
        <Field label={t('form_name')} required>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            data-test-id="hr-employee-name"
          />
        </Field>

        <Field label={t('form_email')}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            data-test-id="hr-employee-email"
          />
        </Field>

        <Field label={t('form_phone')} required>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+998901234567"
            data-test-id="hr-employee-phone"
          />
        </Field>

        <Field label={t('form_telegram')} hint={t('form_telegram_hint')}>
          <Input
            type="tel"
            value={form.telegramPhone}
            onChange={(e) => update('telegramPhone', e.target.value)}
            placeholder="+998901234567"
            data-test-id="hr-employee-telegram"
          />
        </Field>

        <Field label={t('form_department')}>
          <Input
            type="text"
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            data-test-id="hr-employee-department"
          />
        </Field>

        <Field label={t('form_roles')} required>
          <RoleMultiSelect value={form.hrRoles} onChange={(next) => update('hrRoles', next)} />
        </Field>

        {mode === 'create' && (
          <>
            <Field label="Login" required>
              <Input
                type="text"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="kassir1"
                autoComplete="off"
                data-test-id="hr-employee-username"
              />
            </Field>

            <Field label="Parol" required>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                data-test-id="hr-employee-password"
              />
            </Field>
          </>
        )}

        <Field label={t('form_moysklad_agent')} className="sm:col-span-2">
          <MoyskladAgentDropdown
            value={form.moyskladAgentId}
            onChange={(next) => update('moyskladAgentId', next)}
            excludeId={mode === 'edit' ? initialValues?.id : undefined}
          />
        </Field>

        <SkladSelect
          value={form.skladNo}
          onChange={(v) => update('skladNo', v)}
        />

        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={form.isChecker}
            onCheckedChange={(v) => update('isChecker', v === true)}
            className="mt-0.5"
            data-test-id="hr-employee-checker"
          />
          <span>
            <span className="font-medium">{t('form_checker')}</span>
            <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
              {t('form_checker_hint')}
            </span>
          </span>
        </label>

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm sm:col-span-2"
            data-test-id="hr-employee-modal-error"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="font-medium text-[var(--ms-text-primary)] text-sm">
        {label}
        {required && <span className="ml-1 text-[var(--ms-text-destructive)]">*</span>}
      </span>
      {children}
      {hint && <span className="text-[var(--ms-text-muted)] text-xs">{hint}</span>}
    </div>
  );
}

interface StoreItem { id: string; name: string; }

function SkladSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useQuery<{ items: StoreItem[] }>({
    queryKey: ['stores-for-sklad-select'],
    queryFn: () => api.get('/stores?limit=100'),
    staleTime: 60_000,
  });
  const stores = data?.items ?? [];

  return (
    <Field
      label="Sklad"
      hint="Omborchi sifatida mas'ul bo'lgan ombor. Bo'sh = sklad biriktirilmagan."
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[var(--ms-radius-sm)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-2 text-sm text-[var(--ms-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ms-accent)]"
        data-test-id="hr-employee-sklad-no"
      >
        <option value="">— Tanlanmagan —</option>
        {stores.map((s, idx) => (
          <option key={s.id} value={String(idx + 1)}>
            Sklad {idx + 1}: {s.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
