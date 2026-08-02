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

import { WeekScheduleGrid } from '@/components/hr/week-schedule-grid';
import { useConflictReload } from '@/hooks/use-conflict-reload';
import {
  hrDepartmentApi,
  hrEmployeeApi,
  hrPositionApi,
  hrScheduleApi,
  hrScheduleTemplateApi,
  hrWorkLocationApi,
} from '@/lib/hr-api';
import type {
  HrDepartment,
  HrEmployeeCreateInput,
  HrEmployeeDetail,
  HrEmployeeRow,
  HrPosition,
  HrScheduleListResult,
  HrWeekDay,
  HrWorkLocation,
} from '@/lib/hr-api';
import { isOptimisticConflict } from '@/lib/optimistic-lock';
import { Button, Checkbox, Input, Modal, NativeSelect, Switch } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MoyskladAgentDropdown } from './moysklad-agent-dropdown';
import { RoleMultiSelect } from './role-multi-select';

function defaultSchedule(): HrWeekDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    startTime: '09:00',
    endTime: '18:00',
    isDayOff: false,
  }));
}

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
  trackingMode: 'geofence' | 'field';
  moyskladAgentId: string | null;
  username: string;
  password: string;
  // TimePay catalog assignment ('' = biriktirilmagan).
  positionId: string;
  departmentId: string;
  scheduleId: string;
  workLocationId: string; // '' = biriktirilmagan
  attendanceOptIn: boolean;
  scheduleDays: HrWeekDay[];
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
    trackingMode: 'geofence',
    moyskladAgentId: null,
    username: '',
    password: '',
    positionId: '',
    departmentId: '',
    scheduleId: '',
    workLocationId: '',
    attendanceOptIn: false,
    scheduleDays: defaultSchedule(),
  };
}

function rowToForm(row: HrEmployeeRow | HrEmployeeDetail): FormState {
  const detail = row as HrEmployeeDetail;
  return {
    name: row.name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    telegramPhone: row.telegramPhone ?? '',
    department: row.department ?? '',
    hrRoles: row.hrRoles ?? [],
    isChecker: row.isChecker,
    trackingMode: detail.trackingMode ?? 'geofence',
    moyskladAgentId: row.moyskladAgentId,
    username: '',
    password: '',
    positionId: detail.positionId ?? '',
    departmentId: detail.departmentId ?? '',
    scheduleId: detail.scheduleId ?? '',
    workLocationId: detail.workLocationId ?? '',
    attendanceOptIn: detail.attendanceOptIn ?? false,
    scheduleDays: defaultSchedule(), // overwritten by the async getWeek() fetch below
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

  // Filiallar ro'yxati — "Ish joyi" dropdown uchun.
  const { data: workLocations = [] } = useQuery<HrWorkLocation[]>({
    queryKey: ['hr-work-locations'],
    queryFn: () => hrWorkLocationApi.list(),
    enabled: open,
  });
  // TimePay catalogs for the assignment selects.
  const { data: positions = [] } = useQuery<HrPosition[]>({
    queryKey: ['hr-positions'],
    queryFn: () => hrPositionApi.list(),
    enabled: open,
  });
  const { data: departments = [] } = useQuery<HrDepartment[]>({
    queryKey: ['hr-departments'],
    queryFn: () => hrDepartmentApi.list(),
    enabled: open,
  });
  const { data: schedulesResult } = useQuery<HrScheduleListResult>({
    queryKey: ['hr-schedules', { page: 1, limit: 100 }],
    queryFn: () => hrScheduleTemplateApi.list({ page: 1, limit: 100 }),
    enabled: open,
  });
  const schedules = schedulesResult?.rows ?? [];

  // Reset / hydrate when opening
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialValues) {
      setForm(rowToForm(initialValues));
      setVersion(initialValues.version);
      // rowToForm's attendance-config fields may be stale (list rows don't
      // carry them) — always refetch the full detail + real week schedule
      // so the modal shows the employee's true current davomat setup.
      Promise.all([
        hrEmployeeApi.findOne(initialValues.id),
        hrScheduleApi.getWeek(initialValues.id),
      ]).then(([detail, week]) => {
        setForm((prev) => ({
          ...prev,
          workLocationId: detail.workLocationId ?? '',
          attendanceOptIn: detail.attendanceOptIn ?? false,
          scheduleDays: week,
        }));
      });
    } else {
      setForm(emptyForm());
      setVersion(0);
    }
    setError(null);
  }, [open, mode, initialValues]);

  const buildPayload = (): HrEmployeeCreateInput => ({
    name: form.name.trim(),
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || null,
    telegramPhone: form.telegramPhone.trim() || null,
    department: form.department.trim() || null,
    hrRoles: form.hrRoles,
    isChecker: form.isChecker,
    trackingMode: form.trackingMode,
    moyskladAgentId: form.moyskladAgentId,
    // TimePay catalog assignment ('' → null).
    positionId: form.positionId || null,
    departmentId: form.departmentId || null,
    scheduleId: form.scheduleId || null,
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

      // MASTER-TODO #2 (2026-07-28): bu yerda «Sklad» (omborchi) biriktirish
      // bloki turardi — `/sklad-keepers` GET/PUT/DELETE. Lekin `sklad-keeper`
      // BE moduli climart adoption'ida DROP qilingan (`omborchi` oilasi bilan
      // birga), ya'ni uchala chaqiruv ham JIMGINA 404 qaytarardi.
      //
      // Bu shunchaki o'lik maydon emas, HIGH bug edi: `api.put` himoyalanmagan
      // va quyidagi `hrScheduleApi` chaqiruvlaridan OLDIN turardi → foydalanuvchi
      // ombor tanlasa: (1) xodim SAQLANARDI, (2) PUT 404 tashlardi,
      // (3) GPS ish joyi + haftalik jadval HECH QACHON yozilmasdi (jimgina
      // yo'qolardi), (4) modal xato bilan ochiq qolardi → foydalanuvchi qayta
      // urinib dublikat yaratishi mumkin edi.
      //
      // Maydon va uchala chaqiruv olib tashlandi. Agar omborchi oilasi
      // qaytarilsa (MASTER-TODO #118/#137 — foydalanuvchi qarori), maydon
      // moduli bilan birga qaytadi.

      // GPS-davomat: ish joyi/ruxsat + haftalik jadval — xodim yangi
      // yaratilgan bo'lsa ham, `saved.id` shu yerda allaqachon mavjud.
      await hrScheduleApi.setConfig(saved.id, {
        workLocationId: form.workLocationId || null,
        attendanceOptIn: form.attendanceOptIn,
      });
      await hrScheduleApi.replaceWeek(saved.id, form.scheduleDays);

      return saved;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
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
    if (!form.name.trim()) {
      setError('Ism familiya kiritilishi shart');
      return;
    }
    if (!form.phone.trim()) {
      setError('Telefon raqam kiritilishi shart');
      return;
    }
    if (form.hrRoles.length === 0) {
      setError('Kamida bitta rol tanlanishi shart');
      return;
    }
    if (mode === 'create') {
      if (!form.username.trim()) {
        setError('Login kiritilishi shart');
        return;
      }
      if (!form.password) {
        setError('Parol kiritilishi shart');
        return;
      }
      if (form.password.length < 4) {
        setError('Parol kamida 4 belgi bolishi kerak');
        return;
      }
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
      widthClass="w-[720px]"
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

        {/* Egasi 2026-08-01: «Bo'lim / Lavozim / Ish grafigi» yangi-xodim oynasidan
            OLIB TASHLANDI — bular endi Xodimlar → xodim-sahifasi tab'larida boshqariladi.
            Form-state + buildPayload saqlanadi (edit'da mavjud qiymatlar round-trip qiladi,
            yo'qolmaydi). Qaytarish uchun: `false` → `true`. */}
        {false && (
          <>
            <Field label={t('form_department')}>
              <Input
                type="text"
                value={form.department}
                onChange={(e) => update('department', e.target.value)}
                data-test-id="hr-employee-department"
              />
            </Field>

            {/* TimePay catalog assignment: lavozim / bo'lim / jadval */}
            <Field label={t('form_position')}>
              <NativeSelect
                value={form.positionId}
                onChange={(e) => update('positionId', e.target.value)}
                data-test-id="hr-employee-position-select"
              >
                <option value="">{t('form_unassigned')}</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label={t('form_department_catalog')}>
              <NativeSelect
                value={form.departmentId}
                onChange={(e) => update('departmentId', e.target.value)}
                data-test-id="hr-employee-department-select"
              >
                <option value="">{t('form_unassigned')}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label={t('form_schedule')}>
              <NativeSelect
                value={form.scheduleId}
                onChange={(e) => update('scheduleId', e.target.value)}
                data-test-id="hr-employee-schedule-select"
              >
                <option value="">{t('form_unassigned')}</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        )}

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

        {/* «Haydovchi (jonli-iz)» — driver live-tracking (trackingMode='field'). */}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={form.trackingMode === 'field'}
            onCheckedChange={(v) => update('trackingMode', v === true ? 'field' : 'geofence')}
            className="mt-0.5"
            data-test-id="hr-employee-driver"
          />
          <span>
            <span className="font-medium">{t('form_driver')}</span>
            <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
              {t('form_driver_hint')}
            </span>
          </span>
        </label>

        <div className="sm:col-span-2 border-[var(--ms-border-default)] border-t pt-4">
          <h3 className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('davomat_section_title')}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('davomat_branch')}>
              <NativeSelect
                value={form.workLocationId}
                onChange={(e) => update('workLocationId', e.target.value)}
                data-test-id="hr-employee-work-location"
              >
                <option value="">{t('davomat_branch_none')}</option>
                {workLocations.map((wl) => (
                  <option key={wl.id} value={wl.id}>
                    {wl.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-[var(--ms-text-primary)] text-sm">
                {t('davomat_optin')}
              </span>
              <div className="flex min-h-[36px] items-center gap-2">
                <Switch
                  checked={form.attendanceOptIn}
                  onCheckedChange={(v) => update('attendanceOptIn', v === true)}
                  data-test-id="hr-employee-attendance-optin"
                />
                <span className="text-[var(--ms-text-muted)] text-sm">
                  {t('davomat_optin_hint')}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <WeekScheduleGrid
              value={form.scheduleDays}
              onChange={(days) => update('scheduleDays', days)}
            />
          </div>
        </div>

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
