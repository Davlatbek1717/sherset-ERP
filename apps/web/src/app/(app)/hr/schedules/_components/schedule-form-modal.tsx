'use client';

/**
 * Ish jadvali create/edit/view modal. Turi (Moslashuvchan/Erkin) segmented
 * toggle drives the form shape: flexible shows Sikl + per-day cards; free
 * collapses to name + start date + extended-work. View mode disables all
 * fields. Mirrors settings/work-locations BranchFormModal + week-schedule-grid.
 */

import {
  type HrScheduleDetail,
  type HrScheduleInput,
  type HrScheduleType,
  hrScheduleTemplateApi,
} from '@/lib/hr-api';
import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  Modal,
  NumberInput,
  SegmentedControl,
  useToast,
} from '@moysklad/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { CycleDayCard } from './cycle-day-card';

type Mode = 'create' | 'edit' | 'view';
type Day = HrScheduleInput['days'][number];

const TZ = 'Asia/Tashkent';
const todayIso = () => formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd');

function defaultDay(dayIndex: number): Day {
  return {
    dayIndex,
    isWorkday: true,
    startTime: '09:00',
    endTime: '18:00',
    breakStart: '13:00',
    breakEnd: '14:00',
  };
}

/** Grow/trim the day array to exactly `n` rows, keeping existing entries. */
function reconcileDays(days: Day[], n: number): Day[] {
  const out = days.slice(0, n);
  for (let i = out.length; i < n; i++) out.push(defaultDay(i + 1));
  return out.map((d, i) => ({ ...d, dayIndex: i + 1 }));
}

export function ScheduleFormModal({
  open,
  onOpenChange,
  mode,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  initial?: HrScheduleDetail | null;
}) {
  const t = useTranslations('pages.hrSchedules');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const { toast } = useToast();

  const readOnly = mode === 'view';

  const [type, setType] = useState<HrScheduleType>('flexible');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [cycleDays, setCycleDays] = useState(7);
  const [calcOvertime, setCalcOvertime] = useState(false);
  const [extendedHours, setExtendedHours] = useState(4);
  const [days, setDays] = useState<Day[]>(() => reconcileDays([], 7));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setType(initial.type);
      setName(initial.name);
      setStartDate(initial.startDate);
      setCycleDays(initial.cycleDays);
      setCalcOvertime(initial.calcOvertime);
      setExtendedHours(Math.round(initial.extendedWorkMin / 60));
      setDays(
        initial.type === 'flexible' && initial.days.length > 0
          ? initial.days.map((d) => ({ ...d }))
          : reconcileDays([], initial.cycleDays || 7),
      );
    } else {
      setType('flexible');
      setName('');
      setStartDate(todayIso());
      setCycleDays(7);
      setCalcOvertime(false);
      setExtendedHours(4);
      setDays(reconcileDays([], 7));
    }
  }, [open, initial]);

  const onCycleChange = (n: number | null) => {
    const next = Math.min(31, Math.max(1, n ?? 1));
    setCycleDays(next);
    setDays((prev) => reconcileDays(prev, next));
  };

  const patchDay = (idx: number, patch: Partial<Day>) =>
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: HrScheduleInput = {
        name: name.trim(),
        type,
        startDate,
        cycleDays: type === 'free' ? 1 : cycleDays,
        calcOvertime,
        extendedWorkMin: Math.max(0, extendedHours) * 60,
        days: type === 'free' ? [] : days,
      };
      if (mode === 'edit' && initial) return hrScheduleTemplateApi.update(initial.id, payload);
      return hrScheduleTemplateApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-schedules'] });
      toast.success(tCommon('saved'));
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError(t('name_placeholder'));
      return;
    }
    saveMut.mutate();
  };

  const title = useMemo(() => {
    if (mode === 'view') return t('view_title');
    if (mode === 'edit') return t('edit_title');
    return t('create_title');
  }, [mode, t]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      widthClass="w-[640px]"
      testId="hr-schedule-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {readOnly ? t('close') : t('cancel')}
          </Button>
          {!readOnly && (
            <Button onClick={submit} disabled={saveMut.isPending} data-test-id="hr-schedule-save">
              {t('save')}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-4">
        {/* Turi */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">{t('col_type')}</span>
          <SegmentedControl<HrScheduleType>
            value={type}
            onChange={setType}
            disabled={readOnly}
            ariaLabel={t('col_type')}
            options={[
              { value: 'flexible', label: t('type_flexible') },
              { value: 'free', label: t('type_free') },
            ]}
          />
        </div>

        {/* Nomi */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="hr-schedule-name"
            className="font-medium text-[var(--ms-text-primary)] text-sm"
          >
            {t('col_name')}
          </label>
          <Input
            id="hr-schedule-name"
            value={name}
            disabled={readOnly}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('name_placeholder')}
            data-test-id="hr-schedule-name-input"
          />
        </div>

        {/* Boshlanish sanasi */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('col_start_date')}
          </span>
          <DatePicker
            value={startDate}
            onChange={(v) => setStartDate(v ?? todayIso())}
            disabled={readOnly}
          />
        </div>

        {/* Sikl — faqat flexible */}
        {type === 'flexible' && (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-[var(--ms-text-primary)] text-sm">
              {t('col_cycle')}
            </span>
            <NumberInput
              value={cycleDays}
              onChange={onCycleChange}
              min={1}
              max={31}
              disabled={readOnly}
            />
          </div>
        )}

        {/* Qo'shimcha ish vaqtini hisoblash */}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={calcOvertime}
            disabled={readOnly}
            onCheckedChange={(v) => setCalcOvertime(v === true)}
          />
          {t('calc_overtime')}
        </label>

        {/* Uzaytirilgan ish vaqti (soatda) */}
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[var(--ms-text-primary)] text-sm">
            {t('extended_work')}
          </span>
          <NumberInput
            value={extendedHours}
            onChange={(v) => setExtendedHours(Math.max(0, v ?? 0))}
            min={0}
            max={24}
            suffix={t('hours_suffix')}
            disabled={readOnly}
          />
        </div>

        {/* Moslashuvchan jadval tafsilotlari */}
        {type === 'flexible' && (
          <div className="flex flex-col gap-2">
            <span className="font-medium text-[var(--ms-text-strong)] text-sm">
              {t('flex_details')}
            </span>
            {days.map((d, i) => (
              <CycleDayCard
                key={d.dayIndex}
                day={d}
                disabled={readOnly}
                onChange={(patch) => patchDay(i, patch)}
              />
            ))}
          </div>
        )}

        {error && (
          <div
            className="text-[var(--ms-text-destructive)] text-sm"
            role="alert"
            data-test-id="hr-schedule-modal-error"
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
