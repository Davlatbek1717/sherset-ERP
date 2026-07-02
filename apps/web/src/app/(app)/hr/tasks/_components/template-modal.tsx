'use client';

/**
 * TemplateModal — HrTaskTemplate yaratish/tahrirlash. Master spec § 3 "16-input"
 * forma. Server tomonida `CreateHrTaskTemplateSchema` Zod superRefine bilan
 * tekshiriladi; bu yerda asosiy XOR + discriminator + anti-self-approval
 * mantiqi UI bo'yicha enforce qilinadi.
 *
 * Pul kiritmalari foydalanuvchiga so'mda ko'rsatiladi → server tiyin BigInt'da
 * saqlaydi (×100). Edit rejimda rewardMinor/fineMinor string sifatida keladi
 * va parse qilinadi.
 */

import {
  type EventConfig,
  type HrEmployeeListResult,
  type HrTaskPriority,
  type HrTaskResponseType,
  type HrTaskTemplateInput,
  type HrTaskTemplateListResult,
  type HrTaskTemplateRow,
  type HrTaskTriggerType,
  type ScheduleConfig,
  hrEmployeeApi,
  hrTaskTemplateApi,
} from '@/lib/hr-api';
import { Button, Checkbox, Input, Modal, NativeSelect, Textarea } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export interface TemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Required for edit. */
  initialValues?: HrTaskTemplateRow | null;
  onSuccess?: (row: HrTaskTemplateRow) => void;
}

type AssigneeKind = 'employee' | 'role';

interface FormState {
  title: string;
  description: string;
  assigneeKind: AssigneeKind;
  assignedEmployeeId: string;
  assignedRole: string;
  department: string;
  priority: HrTaskPriority;
  triggerType: HrTaskTriggerType;
  // scheduled
  scheduleTime: string; // HH:MM
  scheduleMode: 'weekly' | 'monthly';
  scheduleDays: number[]; // ISO 1..7
  scheduleDayOfMonth: number;
  // event
  eventDocType: EventConfig['docType'];
  eventState: EventConfig['state'];
  eventLargeSaleMinSom: string; // user input in som; converted to minor on submit
  responseType: HrTaskResponseType;
  deadlineMinutes: string; // text-bound for "" empty distinction
  rewardSom: string; // user input in so'm
  fineSom: string; // user input in so'm
  checkerId: string;
  dependsOnId: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    assigneeKind: 'employee',
    assignedEmployeeId: '',
    assignedRole: '',
    department: '',
    priority: 'medium',
    triggerType: 'manual',
    scheduleTime: '09:00',
    scheduleMode: 'weekly',
    scheduleDays: [1, 2, 3, 4, 5],
    scheduleDayOfMonth: 1,
    eventDocType: 'demand',
    eventState: 'posted',
    eventLargeSaleMinSom: '',
    responseType: 'none',
    deadlineMinutes: '',
    rewardSom: '',
    fineSom: '',
    checkerId: '',
    dependsOnId: '',
    isActive: true,
  };
}

/** BigInt minor (tiyin) → string som — divide by 100, keep precision for integer som. */
function minorToSom(v: string | null | undefined): string {
  if (!v) return '';
  // Server emits BigInt as decimal string (e.g. "1234500"). Divide by 100.
  // Use plain string arithmetic to avoid Number precision loss for >2^53.
  const negative = v.startsWith('-');
  const digits = (negative ? v.slice(1) : v).replace(/^0+/, '') || '0';
  if (digits.length <= 2) {
    const padded = digits.padStart(3, '0');
    const intPart = padded.slice(0, -2).replace(/^0+/, '') || '0';
    const fracPart = padded.slice(-2);
    const fracTrim = fracPart === '00' ? '' : `.${fracPart.replace(/0+$/, '')}`;
    return `${negative ? '-' : ''}${intPart}${fracTrim}`;
  }
  const intPart = digits.slice(0, -2);
  const fracPart = digits.slice(-2);
  const fracTrim = fracPart === '00' ? '' : `.${fracPart.replace(/0+$/, '')}`;
  return `${negative ? '-' : ''}${intPart}${fracTrim}`;
}

/**
 * User-typed so'm string → tiyin BigInt string.
 *   ""                  → null
 *   "10"                → "1000"
 *   "10.5"              → "1050"
 *   "1 000 000"         → "100000000"  (thousand separators tolerated)
 *   "1'000'000"         → "100000000"
 * Rejects: negative amounts, non-digits beyond the allowed separators,
 * and >15-digit integer parts (UZS sanity cap — 10^15 so'm ≈ 1 quadrillion).
 */
function somToMinor(
  s: string,
  // Localized via the caller (t()) — the design-system-default-leak bug-class:
  // hardcoded Uzbek here surfaced in the error Alert even in the RU UI.
  messages: { negative: string; format: string; tooLarge: string },
): string | null {
  // Strip common thousand separators: whitespace, underscore, apostrophe, comma.
  const cleaned = s.replace(/[\s_',]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('-')) {
    throw new Error(messages.negative);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(messages.format);
  }
  // After the regex guard above `cleaned` is "<digits>" or "<digits>.<1-2 digits>" so
  // split always produces a non-empty integer part — but tsc with noUncheckedIndexedAccess
  // doesn't know that, hence the explicit fallback.
  const [intPartRaw = '', fracPart = ''] = cleaned.split('.');
  if (intPartRaw.length > 15) {
    throw new Error(messages.tooLarge);
  }
  const fracPadded = `${fracPart}00`.slice(0, 2);
  const combined = `${intPartRaw}${fracPadded}`.replace(/^0+(?=\d)/, '');
  return combined;
}

function rowToForm(row: HrTaskTemplateRow): FormState {
  const sched = row.scheduleConfig;
  const ev = row.eventConfig;
  return {
    title: row.title,
    description: row.description ?? '',
    assigneeKind: row.assignedRole ? 'role' : 'employee',
    assignedEmployeeId: row.assignedEmployeeId ?? '',
    assignedRole: row.assignedRole ?? '',
    department: row.department ?? '',
    priority: row.priority,
    triggerType: row.triggerType,
    scheduleTime: sched?.time ?? '09:00',
    scheduleMode: sched?.mode ?? 'weekly',
    scheduleDays: sched?.days ?? [1, 2, 3, 4, 5],
    scheduleDayOfMonth: sched?.dayOfMonth ?? 1,
    eventDocType: ev?.docType ?? 'demand',
    eventState: ev?.state ?? 'posted',
    eventLargeSaleMinSom: ev?.largeSaleMinThresholdMinor
      ? minorToSom(String(ev.largeSaleMinThresholdMinor))
      : '',
    responseType: row.responseType,
    deadlineMinutes:
      row.deadlineMinutes != null && row.deadlineMinutes > 0 ? String(row.deadlineMinutes) : '',
    rewardSom: minorToSom(row.rewardMinor),
    fineSom: minorToSom(row.fineMinor),
    checkerId: row.checkerId ?? '',
    dependsOnId: row.dependsOnId ?? '',
    isActive: row.isActive,
  };
}

const WEEKDAY_LABELS: Array<{
  iso: number;
  key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
}> = [
  { iso: 1, key: 'mon' },
  { iso: 2, key: 'tue' },
  { iso: 3, key: 'wed' },
  { iso: 4, key: 'thu' },
  { iso: 5, key: 'fri' },
  { iso: 6, key: 'sat' },
  { iso: 7, key: 'sun' },
];

export function TemplateModal({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSuccess,
}: TemplateModalProps) {
  const t = useTranslations('pages.hrTasks');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // Reset/hydrate when (re)opening
  useEffect(() => {
    if (!open) return;
    setForm(mode === 'edit' && initialValues ? rowToForm(initialValues) : emptyForm());
    setError(null);
  }, [open, mode, initialValues]);

  const employeesQuery = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'template-modal'],
    queryFn: () => hrEmployeeApi.list({ limit: 200 }),
    enabled: open,
  });

  const templatesQuery = useQuery<HrTaskTemplateListResult>({
    queryKey: ['hr-task-templates', 'depends-picker'],
    queryFn: () => hrTaskTemplateApi.list({ isActive: true, limit: 200 }),
    enabled: open,
  });

  const employees = useMemo(() => employeesQuery.data?.rows ?? [], [employeesQuery.data]);
  const checkers = useMemo(
    () =>
      employees.filter(
        (e) => e.isChecker && (!form.assignedEmployeeId || e.id !== form.assignedEmployeeId),
      ),
    [employees, form.assignedEmployeeId],
  );
  const roleOptions = useMemo(() => {
    const all = new Set<string>();
    for (const e of employees) for (const r of e.hrRoles) all.add(r);
    return Array.from(all).sort();
  }, [employees]);
  const dependsCandidates = useMemo(
    () =>
      (templatesQuery.data?.rows ?? []).filter(
        (tpl) => !initialValues || tpl.id !== initialValues.id,
      ),
    [templatesQuery.data, initialValues],
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Clamp checker selection when assignee changes (anti-self-approval). */
  useEffect(() => {
    if (form.checkerId && form.assignedEmployeeId === form.checkerId) {
      update('checkerId', '');
    }
    // checker only makes sense for answerable responses
    if (form.checkerId && form.responseType === 'none') {
      update('checkerId', '');
    }
  }, [form.assignedEmployeeId, form.responseType, form.checkerId]);

  const buildPayload = (): HrTaskTemplateInput => {
    if (!form.title.trim()) throw new Error(t('form_err_title_required'));
    const moneyErr = {
      negative: t('form_err_money_negative'),
      format: t('form_err_money_format'),
      tooLarge: t('form_err_money_too_large'),
    };

    if (form.assigneeKind === 'employee' && !form.assignedEmployeeId) {
      throw new Error(t('form_err_assignee_required'));
    }
    if (form.assigneeKind === 'role' && !form.assignedRole.trim()) {
      throw new Error(t('form_err_assignee_required'));
    }

    let scheduleConfig: ScheduleConfig | null = null;
    if (form.triggerType === 'scheduled') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.scheduleTime)) {
        throw new Error(t('form_err_time_format'));
      }
      if (form.scheduleMode === 'weekly') {
        if (form.scheduleDays.length === 0) throw new Error(t('form_err_days_required'));
        scheduleConfig = {
          time: form.scheduleTime,
          mode: 'weekly',
          days: [...form.scheduleDays].sort((a, b) => a - b),
        };
      } else {
        if (form.scheduleDayOfMonth < 1 || form.scheduleDayOfMonth > 31) {
          throw new Error(t('form_err_day_of_month'));
        }
        scheduleConfig = {
          time: form.scheduleTime,
          mode: 'monthly',
          dayOfMonth: form.scheduleDayOfMonth,
        };
      }
    }

    let eventConfig: EventConfig | null = null;
    if (form.triggerType === 'event') {
      eventConfig = {
        docType: form.eventDocType,
        state: form.eventState,
        ...(form.eventLargeSaleMinSom
          ? { largeSaleMinThresholdMinor: somToMinor(form.eventLargeSaleMinSom, moneyErr) ?? '0' }
          : {}),
      };
    }

    const reward = somToMinor(form.rewardSom, moneyErr);
    const fine = somToMinor(form.fineSom, moneyErr);
    const deadlineMinutes = form.deadlineMinutes.trim()
      ? Number(form.deadlineMinutes.trim())
      : null;
    if (deadlineMinutes != null && (!Number.isFinite(deadlineMinutes) || deadlineMinutes < 0)) {
      throw new Error(t('form_err_deadline'));
    }

    if (form.checkerId && form.assignedEmployeeId === form.checkerId) {
      throw new Error(t('form_err_anti_self_approval'));
    }
    if (form.checkerId && form.responseType === 'none') {
      throw new Error(t('form_err_checker_needs_response'));
    }

    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      assignedEmployeeId: form.assigneeKind === 'employee' ? form.assignedEmployeeId : null,
      assignedRole: form.assigneeKind === 'role' ? form.assignedRole.trim() : null,
      department: form.department.trim() || null,
      priority: form.priority,
      triggerType: form.triggerType,
      scheduleConfig,
      eventConfig,
      responseType: form.responseType,
      deadlineMinutes,
      rewardMinor: reward,
      fineMinor: fine,
      checkerId: form.checkerId || null,
      dependsOnId: form.dependsOnId || null,
      isActive: form.isActive,
    };
  };

  const saveMut = useMutation({
    mutationFn: async (): Promise<HrTaskTemplateRow> => {
      const payload = buildPayload();
      if (mode === 'edit' && initialValues) {
        return hrTaskTemplateApi.update(initialValues.id, payload);
      }
      return hrTaskTemplateApi.create(payload);
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['hr-task-templates'] });
      onSuccess?.(row);
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    try {
      saveMut.mutate();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'edit' ? t('form_edit_title') : t('form_create_title')}
      widthClass="w-[760px]"
      testId="hr-template-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            data-test-id="hr-template-modal-cancel"
          >
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={saveMut.isPending}
            data-test-id="hr-template-modal-save"
          >
            {tCommon('save')}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        {/* 1. Title */}
        <Field label={t('form_title')} required className="sm:col-span-2">
          <Input
            type="text"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            maxLength={255}
            data-test-id="hr-template-title"
          />
        </Field>

        {/* 2. Description */}
        <Field label={t('form_description')} className="sm:col-span-2">
          <Textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            rows={3}
            maxLength={2000}
            data-test-id="hr-template-description"
          />
        </Field>

        {/* 3+4. Assignee (XOR: employee / role) */}
        <Field label={t('form_assignee')} required className="sm:col-span-2">
          <div className="mb-2 flex gap-2">
            <SegmentedTab
              active={form.assigneeKind === 'employee'}
              onClick={() => update('assigneeKind', 'employee')}
              testId="hr-template-assignee-kind-employee"
            >
              {t('form_assignee_employee')}
            </SegmentedTab>
            <SegmentedTab
              active={form.assigneeKind === 'role'}
              onClick={() => update('assigneeKind', 'role')}
              testId="hr-template-assignee-kind-role"
            >
              {t('form_assignee_role')}
            </SegmentedTab>
          </div>
          {form.assigneeKind === 'employee' ? (
            <NativeSelect
              value={form.assignedEmployeeId}
              onChange={(e) => update('assignedEmployeeId', e.target.value)}
              data-test-id="hr-template-assignee-employee"
            >
              <option value="">— {t('form_assignee_employee_placeholder')} —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.hrRoles.length > 0 ? ` (${e.hrRoles.join(', ')})` : ''}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <NativeSelect
              value={form.assignedRole}
              onChange={(e) => update('assignedRole', e.target.value)}
              data-test-id="hr-template-assignee-role"
            >
              <option value="">— {t('form_assignee_role_placeholder')} —</option>
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>

        {/* 5. Department */}
        <Field label={t('form_department')}>
          <Input
            type="text"
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            maxLength={100}
            data-test-id="hr-template-department"
          />
        </Field>

        {/* 6. Priority */}
        <Field label={t('form_priority')} required>
          <NativeSelect
            value={form.priority}
            onChange={(e) => update('priority', e.target.value as HrTaskPriority)}
            data-test-id="hr-template-priority"
          >
            <option value="low">{t('priority_low')}</option>
            <option value="medium">{t('priority_medium')}</option>
            <option value="high">{t('priority_high')}</option>
            <option value="urgent">{t('priority_urgent')}</option>
          </NativeSelect>
        </Field>

        {/* 7. Trigger type (discriminator) */}
        <Field label={t('form_trigger')} required className="sm:col-span-2">
          <div className="flex gap-2">
            {(['manual', 'scheduled', 'event'] as HrTaskTriggerType[]).map((tt) => (
              <SegmentedTab
                key={tt}
                active={form.triggerType === tt}
                onClick={() => update('triggerType', tt)}
                testId={`hr-template-trigger-${tt}`}
              >
                {t(`trigger_${tt}`)}
              </SegmentedTab>
            ))}
          </div>
        </Field>

        {/* 8. Scheduled config (conditional) */}
        {form.triggerType === 'scheduled' && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] p-3 sm:grid-cols-2">
            <Field label={t('form_schedule_time')} required>
              <Input
                type="time"
                value={form.scheduleTime}
                onChange={(e) => update('scheduleTime', e.target.value)}
                data-test-id="hr-template-schedule-time"
              />
            </Field>
            <Field label={t('form_schedule_mode')} required>
              <NativeSelect
                value={form.scheduleMode}
                onChange={(e) => update('scheduleMode', e.target.value as 'weekly' | 'monthly')}
                data-test-id="hr-template-schedule-mode"
              >
                <option value="weekly">{t('form_schedule_weekly')}</option>
                <option value="monthly">{t('form_schedule_monthly')}</option>
              </NativeSelect>
            </Field>
            {form.scheduleMode === 'weekly' ? (
              <Field label={t('form_schedule_days')} required className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map(({ iso, key }) => {
                    const selected = form.scheduleDays.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => {
                          const next = selected
                            ? form.scheduleDays.filter((d) => d !== iso)
                            : [...form.scheduleDays, iso];
                          update('scheduleDays', next);
                        }}
                        className={`h-9 rounded-[var(--ms-radius-default)] border px-3 text-sm transition-colors ${
                          selected
                            ? 'border-[var(--ms-border-focus)] bg-[var(--ms-border-focus)] text-white'
                            : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]'
                        }`}
                        data-test-id={`hr-template-day-${key}`}
                      >
                        {t(`form_day_${key}`)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            ) : (
              <Field label={t('form_schedule_day_of_month')} required>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.scheduleDayOfMonth}
                  onChange={(e) => update('scheduleDayOfMonth', Number(e.target.value))}
                  data-test-id="hr-template-schedule-dom"
                />
              </Field>
            )}
          </div>
        )}

        {/* Event config (conditional) */}
        {form.triggerType === 'event' && (
          <div className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-app)] p-3 sm:grid-cols-2">
            <Field label={t('form_event_doc_type')} required>
              <NativeSelect
                value={form.eventDocType}
                onChange={(e) => update('eventDocType', e.target.value as EventConfig['docType'])}
                data-test-id="hr-template-event-doc"
              >
                <option value="demand">{t('form_event_demand')}</option>
                <option value="customer_order">{t('form_event_customer_order')}</option>
                <option value="payment_in">{t('form_event_payment_in')}</option>
                <option value="supply">{t('form_event_supply')}</option>
                <option value="sales_return">{t('form_event_sales_return')}</option>
              </NativeSelect>
            </Field>
            <Field label={t('form_event_state')} required>
              <NativeSelect
                value={form.eventState}
                onChange={(e) => update('eventState', e.target.value as EventConfig['state'])}
                data-test-id="hr-template-event-state"
              >
                <option value="created">{t('form_event_state_created')}</option>
                <option value="posted">{t('form_event_state_posted')}</option>
                <option value="updated">{t('form_event_state_updated')}</option>
                <option value="large_sale">{t('form_event_state_large_sale')}</option>
              </NativeSelect>
            </Field>
            {form.eventState === 'large_sale' && (
              <Field
                label={t('form_event_large_sale_min')}
                hint={t('form_event_large_sale_hint')}
                className="sm:col-span-2"
              >
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.eventLargeSaleMinSom}
                  onChange={(e) => update('eventLargeSaleMinSom', e.target.value)}
                  placeholder="1000000"
                  data-test-id="hr-template-event-large-sale-min"
                />
              </Field>
            )}
          </div>
        )}

        {/* 9. Response type */}
        <Field label={t('form_response_type')} required>
          <NativeSelect
            value={form.responseType}
            onChange={(e) => update('responseType', e.target.value as HrTaskResponseType)}
            data-test-id="hr-template-response-type"
          >
            <option value="none">{t('form_response_none')}</option>
            <option value="yes_no">{t('form_response_yes_no')}</option>
            <option value="text">{t('form_response_text')}</option>
          </NativeSelect>
        </Field>

        {/* 10. Deadline */}
        <Field label={t('form_deadline')} hint={t('form_deadline_hint')}>
          <Input
            type="number"
            min={0}
            max={525600}
            value={form.deadlineMinutes}
            onChange={(e) => update('deadlineMinutes', e.target.value)}
            placeholder="30"
            data-test-id="hr-template-deadline"
          />
        </Field>

        {/* 11. Reward */}
        <Field label={t('form_reward')} hint={t('form_reward_hint')}>
          <Input
            type="text"
            inputMode="decimal"
            value={form.rewardSom}
            onChange={(e) => update('rewardSom', e.target.value)}
            placeholder="10000"
            data-test-id="hr-template-reward"
          />
        </Field>

        {/* 12. Fine */}
        <Field label={t('form_fine')} hint={t('form_fine_hint')}>
          <Input
            type="text"
            inputMode="decimal"
            value={form.fineSom}
            onChange={(e) => update('fineSom', e.target.value)}
            placeholder="5000"
            data-test-id="hr-template-fine"
          />
        </Field>

        {/* 13. Checker (only if answerable response) */}
        <Field
          label={t('form_checker')}
          hint={
            form.responseType === 'none' ? t('form_checker_disabled_hint') : t('form_checker_hint')
          }
        >
          <NativeSelect
            value={form.checkerId}
            onChange={(e) => update('checkerId', e.target.value)}
            disabled={form.responseType === 'none'}
            data-test-id="hr-template-checker"
          >
            <option value="">— {t('form_checker_none')} —</option>
            {checkers.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {/* 14. Depends on */}
        <Field label={t('form_depends_on')} hint={t('form_depends_on_hint')}>
          <NativeSelect
            value={form.dependsOnId}
            onChange={(e) => update('dependsOnId', e.target.value)}
            data-test-id="hr-template-depends-on"
          >
            <option value="">— {t('form_depends_none')} —</option>
            {dependsCandidates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {/* 15. Active */}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <Checkbox
            checked={form.isActive}
            onCheckedChange={(v) => update('isActive', v === true)}
            className="mt-0.5"
            data-test-id="hr-template-is-active"
          />
          <span>
            <span className="font-medium">{t('form_is_active')}</span>
            <span className="ml-2 text-[var(--ms-text-muted)] text-xs">
              {t('form_is_active_hint')}
            </span>
          </span>
        </label>

        {error && (
          <div
            className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-destructive)] bg-[var(--ms-bg-destructive-subtle)] p-2 text-[var(--ms-text-destructive)] text-sm sm:col-span-2"
            role="alert"
            data-test-id="hr-template-modal-error"
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

function SegmentedTab({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-test-id={testId}
      className={`h-9 rounded-[var(--ms-radius-default)] border px-3 text-sm transition-colors ${
        active
          ? 'border-[var(--ms-border-focus)] bg-[var(--ms-border-focus)] text-white'
          : 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] text-[var(--ms-text-primary)] hover:bg-[var(--ms-bg-muted)]'
      }`}
    >
      {children}
    </button>
  );
}
