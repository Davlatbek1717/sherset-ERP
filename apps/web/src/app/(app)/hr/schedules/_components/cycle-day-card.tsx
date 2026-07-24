'use client';

/**
 * One cycle-day card ("Kun N") for the schedule modal. "Ish kuni" toggle +
 * four time fields (start / end / break start / break end). When the day is a
 * rest day the time inputs are disabled and muted. Mirrors the time-input +
 * Switch pattern in components/hr/week-schedule-grid.tsx.
 */

import type { HrScheduleDay } from '@/lib/hr-api';
import { Input, Switch } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export function CycleDayCard({
  day,
  disabled,
  onChange,
}: {
  day: HrScheduleDay;
  disabled?: boolean;
  onChange: (patch: Partial<HrScheduleDay>) => void;
}) {
  const t = useTranslations('pages.hrSchedules');
  const off = !day.isWorkday;

  const field = (label: string, key: 'startTime' | 'endTime' | 'breakStart' | 'breakEnd') => (
    <div className="flex flex-col gap-1">
      <span className="text-[var(--ms-text-muted)] text-xs">{label}</span>
      <Input
        type="time"
        value={day[key] ?? ''}
        disabled={disabled || off}
        onChange={(e) => onChange({ [key]: e.target.value || null })}
        data-test-id={`hr-schedule-day-${day.dayIndex}-${key}`}
      />
    </div>
  );

  return (
    <div
      className={`rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-3 ${
        off ? 'bg-[var(--ms-bg-app)]' : 'bg-[var(--ms-bg-surface)]'
      }`}
      data-test-id={`hr-schedule-day-${day.dayIndex}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-[var(--ms-text-strong)] text-sm">
          {t('day_n', { n: day.dayIndex })}
        </span>
        <span className="flex items-center gap-2 text-[var(--ms-text-muted)] text-xs">
          {t('is_workday')}
          <Switch
            checked={day.isWorkday}
            disabled={disabled}
            onCheckedChange={(v) => onChange({ isWorkday: v === true })}
            aria-label={t('is_workday')}
            data-test-id={`hr-schedule-day-${day.dayIndex}-workday`}
          />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field(t('field_start'), 'startTime')}
        {field(t('field_end'), 'endTime')}
        {field(t('field_break_start'), 'breakStart')}
        {field(t('field_break_end'), 'breakEnd')}
      </div>
    </div>
  );
}
