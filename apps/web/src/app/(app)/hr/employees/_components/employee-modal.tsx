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
import { api } from '@/lib/api-client';
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
  /**
   * ERP (RBAC) roli — `roles` jadvali, HR rollaridan BUTUNLAY boshqa narsa.
   * HR rollari (`hrRoles`) faqat HR sahifalarini ochadi; ERP bo'limlariga
   * (buyurtma, mijoz, faktura…) kirish AYNAN shu roldan keladi. '' = tanlanmagan.
   */
  erpRoleId: string;
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
    erpRoleId: '',
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
    erpRoleId: '',
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
  /** Xodim saqlangan, lekin keyingi qadamlardan biri bajarilmagan holatlar. */
  const [postSaveWarnings, setPostSaveWarnings] = useState<string[]>([]);
  /**
   * ERP roli HAQIQATAN o'qib olindimi. Bu bayroqsiz tahrir rejimi xavfli
   * bo'lardi: `role:view` ruxsati bo'lmagan HR xodimi oynani ochib saqlasa,
   * bo'sh `erpRoleId` «rolni olib tashla» deb uzatilib, xodimning MAVJUD
   * ERP roli jimgina o'chib ketardi. Yuklanmagan bo'lsa — TEGMAYMIZ.
   */
  const [erpRoleLoaded, setErpRoleLoaded] = useState(false);

  /**
   * ERP (RBAC) rollari — `GET /roles`. HR xodimida `role:view` ruxsati
   * bo'lmasligi mumkin (403) — o'shanda maydon KO'RSATILMAYDI, xato
   * chiqarilmaydi: HR kartasi ERP roli bo'lmasa ham ishlashi kerak.
   */
  const erpRolesQuery = useQuery<{ items: Array<{ id: string; name: string }> }>({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Array<{ id: string; name: string }> }>('/roles'),
    enabled: open,
    retry: false,
  });
  const erpRoles = erpRolesQuery.data?.items ?? [];

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
      // ERP roli AYRIM so'rov bilan keladi (`roles` va `hr_role` — boshqa
      // tizimlar). Buni yuklamasak, roli BOR xodimda ham maydon «Tanlanmagan»
      // ko'rsatardi — ya'ni ekran yolg'on gapirardi va foydalanuvchi mavjud
      // rolni «yo'q» deb o'ylardi.
      api
        .get<{ roleIds?: string[] }>(`/roles/employee/${initialValues.id}`)
        .then((r) => {
          setForm((prev) => ({ ...prev, erpRoleId: r?.roleIds?.[0] ?? '' }));
          setErpRoleLoaded(true);
        })
        .catch(() => {
          /* role:view ruxsati yo'q — maydon ko'rsatilmaydi va TEGILMAYDI */
        });
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
    setPostSaveWarnings([]);
    setErpRoleLoaded(false);
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
  });
  // 🔴 `username`/`password` bu payloadga QO'SHILMAYDI. Ilgari shu yerda
  // `...(mode === 'create' && form.username.trim() && { username })` turardi va
  // u JIMGINA yo'qolardi: `CreateHrEmployeeSchema` da bunday maydon yo'q, Zod
  // esa noma'lum kalitlarni sukut bo'yicha TASHLAB yuboradi. TypeScript ham
  // tutmagan — spread natijasida ortiqcha-maydon tekshiruvi ishlamaydi.
  // Natija: xodim LOGINSIZ yaratilardi, oyna esa «saqlandi» derdi va odam
  // faqat kira olmaganda bilardi. Login alohida endpoint bilan qo'yiladi
  // (`POST /hr/employees/:id/set-password`) — pastdagi saqlash zanjiriga qara.

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

      // ── Yaratishdan keyingi zanjir ────────────────────────────────────────
      // Xodim ALLAQACHON bazada. Shu sababli quyidagi qadamlarning har biri
      // alohida ushlanadi: bittasi yiqilsa ham oyna «yaratilmadi» degan
      // taassurot bermasligi kerak — aks holda foydalanuvchi qayta bosib
      // DUBLIKAT xodim yasaydi. Nima bajarilmagani `postSaveWarnings` ga
      // yig'iladi va oshkora ko'rsatiladi (jimgina yutilmaydi).
      const warnings: string[] = [];

      // (a) Login + parol — `create` payloadi bilan YUBORIB BO'LMAYDI
      //     (server sxemasida bunday maydon yo'q, Zod tashlab yuboradi).
      if (mode === 'create' && form.username.trim() && form.password) {
        try {
          await hrEmployeeApi.setPassword(saved.id, {
            username: form.username.trim(),
            password: form.password,
          });
        } catch (e) {
          warnings.push(`${t('warn_login_failed')} ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // (b) ERP roli — HR rollari ERP bo'limlarini OCHMAYDI, bu alohida tizim.
      // Bo'sh qiymat ham MA'NOLI: «rolni olib tashlash». Shuning uchun
      // `if (form.erpRoleId)` emas — tahrirda foydalanuvchi rolni ataylab
      // bo'shatgan bo'lishi mumkin. Yaratishda esa rolsiz holat normal.
      // Tahrirda faqat rolni HAQIQATAN o'qib olgan bo'lsak yozamiz — aks
      // holda bo'sh qiymat mavjud rolni o'chirib yuborardi (yuqoriga qara).
      const writeErpRole =
        mode === 'create' ? Boolean(form.erpRoleId) : erpRoleLoaded && erpRoles.length > 0;
      if (writeErpRole) {
        try {
          await api.put(`/roles/employee/${saved.id}`, {
            roleIds: form.erpRoleId ? [form.erpRoleId] : [],
          });
        } catch (e) {
          warnings.push(
            `${t('warn_erp_role_failed')} ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

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
      try {
        await hrScheduleApi.setConfig(saved.id, {
          workLocationId: form.workLocationId || null,
          attendanceOptIn: form.attendanceOptIn,
        });
        await hrScheduleApi.replaceWeek(saved.id, form.scheduleDays);
      } catch (e) {
        warnings.push(`${t('warn_schedule_failed')} ${e instanceof Error ? e.message : String(e)}`);
      }

      if (warnings.length > 0) setPostSaveWarnings(warnings);
      return saved;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      if (mode === 'edit' && initialValues) {
        qc.invalidateQueries({ queryKey: ['hr-employee', initialValues.id] });
      }
      onSuccess?.(row);
      // Ogohlantirish bo'lsa oyna OCHIQ qoladi: xodim saqlangan, lekin
      // login/rol/jadval qadamlaridan biri o'tmagan — buni ko'rsatmasdan
      // yopib yuborish aynan «jim muvaffaqiyat» bug-klassi bo'lardi.
      if (postSaveWarnings.length === 0) onOpenChange(false);
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
      setError(t('err_name_required'));
      return;
    }
    if (!form.phone.trim()) {
      setError(t('err_phone_required'));
      return;
    }
    // Shakl tekshiruvi `Sozlamalar → Xodimlar` kartasidagi bilan BIR XIL
    // (`^[\d+()\-\s]{4,20}$`). Ilgari bu ekran telefonga har qanday matnni
    // o'tkazib yuborardi — ikki ekran bir maydonni ikki xil qabul qilardi.
    // ⚠️ Qiymat ATAYLAB normallashtirilmaydi: telegram normalizatori mobil
    // raqamga mo'ljallangan va shahar raqamini buzadi («71 200 00 00» →
    // «+712000000», 998 kodi yo'qoladi). Shu sababli saqlash formati
    // o'zgarmaydi, faqat qabul qilinadigan shakl cheklanadi.
    if (!/^[\d+()\-\s]{4,20}$/.test(form.phone.trim())) {
      setError(t('err_phone_format'));
      return;
    }
    if (form.hrRoles.length === 0) {
      setError(t('err_role_required'));
      return;
    }
    if (mode === 'create') {
      if (!form.username.trim()) {
        setError(t('err_username_required'));
        return;
      }
      if (!form.password) {
        setError(t('err_password_required'));
        return;
      }
      if (form.password.length < 4) {
        setError(t('err_password_too_short'));
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

        {/* ERP roli — HR rollaridan boshqa tizim; ERP bo'limlarini AYNAN shu ochadi. */}
        {erpRoles.length > 0 && (
          <Field
            label={t('form_erp_role')}
            hint={t('form_erp_role_hint')}
            className="sm:col-span-2"
          >
            <NativeSelect
              value={form.erpRoleId}
              onChange={(e) => update('erpRoleId', e.target.value)}
              data-test-id="hr-employee-erp-role"
            >
              <option value="">{t('form_erp_role_none')}</option>
              {erpRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}

        {mode === 'create' && (
          <>
            <Field label={t('form_username')} required>
              <Input
                type="text"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="kassir1"
                autoComplete="off"
                data-test-id="hr-employee-username"
              />
            </Field>

            <Field label={t('form_password')} required>
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

        {postSaveWarnings.length > 0 && (
          <div
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-2 text-[var(--ms-text-destructive)] text-sm sm:col-span-2"
            data-test-id="hr-employee-modal-warnings"
            role="alert"
          >
            <div className="font-medium">{t('warn_partial_title')}</div>
            <ul className="mt-1 list-disc pl-5">
              {postSaveWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

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
