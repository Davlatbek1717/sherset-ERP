'use client';

import type { HrWeekDay } from '@/lib/hr-api';
import { Button, Input, Switch } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

// UI order Mon..Sat, Sun (weekday model is 0=Sun..6=Sat).
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const WORKDAYS = [1, 2, 3, 4, 5];

/**
 * Responsive weekly schedule editor: a 7-row grid on >=sm, a stacked day-card
 * list below sm. Emits the full 7-day array. Day-off disables that row's time
 * inputs; "fill workdays" copies Monday's hours to Tue–Fri.
 */
export function WeekScheduleGrid({
  value,
  onChange,
}: {
  value: HrWeekDay[];
  onChange: (days: HrWeekDay[]) => void;
}) {
  const t = useTranslations('pages.employeeSchedule');
  const byWd = (wd: number) =>
    value.find((d) => d.weekday === wd) ?? {
      weekday: wd,
      startTime: '09:00',
      endTime: '18:00',
      isDayOff: false,
    };

  const setDay = (wd: number, patch: Partial<HrWeekDay>) =>
    onChange(value.map((d) => (d.weekday === wd ? { ...d, ...patch } : d)));

  const fillWorkdays = () => {
    const mon = byWd(1);
    onChange(
      value.map((d) =>
        WORKDAYS.includes(d.weekday)
          ? { ...d, startTime: mon.startTime, endTime: mon.endTime, isDayOff: mon.isDayOff }
          : d,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="tertiary" size="sm" onClick={fillWorkdays}>
          {t('fill_workdays')}
        </Button>
      </div>

      {/* Desktop grid */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-[120px_1fr_1fr_120px] items-center gap-x-3 gap-y-2">
          <div className="text-[var(--ms-text-muted)] text-xs">{t('col_day')}</div>
          <div className="text-[var(--ms-text-muted)] text-xs">{t('col_start')}</div>
          <div className="text-[var(--ms-text-muted)] text-xs">{t('col_end')}</div>
          <div className="text-right text-[var(--ms-text-muted)] text-xs">{t('col_dayoff')}</div>
          {ORDER.map((wd) => {
            const d = byWd(wd);
            return (
              <DayRow key={wd} label={t(`day_${wd}`)} day={d} onSet={(p) => setDay(wd, p)} grid />
            );
          })}
        </div>
      </div>

      {/* Mobile card stack */}
      <div className="space-y-2 sm:hidden">
        {ORDER.map((wd) => {
          const d = byWd(wd);
          return <DayRow key={wd} label={t(`day_${wd}`)} day={d} onSet={(p) => setDay(wd, p)} />;
        })}
      </div>
    </div>
  );
}

function DayRow({
  label,
  day,
  onSet,
  grid,
}: {
  label: string;
  day: HrWeekDay;
  onSet: (patch: Partial<HrWeekDay>) => void;
  grid?: boolean;
}) {
  const t = useTranslations('pages.employeeSchedule');
  if (grid) {
    return (
      <>
        <div className="font-medium text-[var(--ms-text-primary)] text-sm">{label}</div>
        <Input
          type="time"
          value={day.startTime}
          disabled={day.isDayOff}
          onChange={(e) => onSet({ startTime: e.target.value })}
        />
        <Input
          type="time"
          value={day.endTime}
          disabled={day.isDayOff}
          onChange={(e) => onSet({ endTime: e.target.value })}
        />
        <div className="flex justify-end">
          <Switch checked={day.isDayOff} onCheckedChange={(v) => onSet({ isDayOff: v === true })} />
        </div>
      </>
    );
  }
  return (
    <div
      className={`rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] p-3 ${
        day.isDayOff ? 'bg-[var(--ms-bg-muted)]' : 'bg-[var(--ms-bg-surface)]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-[var(--ms-text-primary)]">{label}</span>
        <div className="flex min-h-[44px] items-center gap-2">
          <span className="text-[var(--ms-text-muted)] text-sm">{t('col_dayoff')}</span>
          <Switch checked={day.isDayOff} onCheckedChange={(v) => onSet({ isDayOff: v === true })} />
        </div>
      </div>
      {!day.isDayOff && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input
            type="time"
            value={day.startTime}
            onChange={(e) => onSet({ startTime: e.target.value })}
          />
          <Input
            type="time"
            value={day.endTime}
            onChange={(e) => onSet({ endTime: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
