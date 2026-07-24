import { fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { computeLateMinutes } from './late-minutes.util.js';
import {
  type ResolvedScheduleInput,
  type WeekdayShift,
  computeOvertimeMinutes,
  computeTotalWorkedMinutes,
  dayNumber,
  lateMinutesForShift,
  resolveShift,
} from './resolve-shift.util.js';

const TZ = 'Asia/Tashkent';

// A flexible schedule whose day N has startTime "0N:00" so tests can tell which
// cycle day resolved. All days are workdays unless overridden.
function flexSchedule(
  startDate: string,
  cycleDays: number,
  overrides: Partial<Record<number, Partial<ResolvedScheduleInput['days'][number]>>> = {},
): ResolvedScheduleInput {
  const days = Array.from({ length: cycleDays }, (_, i) => {
    const dayIndex = i + 1;
    const hh = String(dayIndex).padStart(2, '0');
    return {
      dayIndex,
      isWorkday: true,
      startTime: `${hh}:00`,
      endTime: '18:00',
      breakStart: null,
      breakEnd: null,
      ...overrides[dayIndex],
    };
  });
  return {
    type: 'flexible',
    startDate,
    cycleDays,
    calcOvertime: false,
    extendedWorkMinutes: 0,
    days,
  };
}

const resolve = (
  date: string,
  schedule: ResolvedScheduleInput | null,
  weekFallback: WeekdayShift[] | null = null,
) => resolveShift({ date, tz: TZ, schedule, weekFallback });

describe('resolveShift — cycle math', () => {
  it('1. startDate == date → cycle day 1', () => {
    const s = flexSchedule('2026-07-24', 7);
    expect(resolve('2026-07-24', s).startTime).toBe('01:00');
  });

  it('2. date == startDate + cycleDays → wraps back to day 1', () => {
    const s = flexSchedule('2026-07-24', 7);
    expect(resolve('2026-07-31', s).startTime).toBe('01:00');
  });

  it('3. date == startDate + cycleDays - 1 → last day', () => {
    const s = flexSchedule('2026-07-24', 7);
    expect(resolve('2026-07-30', s).startTime).toBe('07:00');
  });

  it('4. dates before startDate use negative-modulo correctly', () => {
    const s = flexSchedule('2026-07-24', 7);
    expect(resolve('2026-07-23', s).startTime).toBe('07:00'); // -1 → day 7
    expect(resolve('2026-07-17', s).startTime).toBe('01:00'); // -7 → one full cycle back → day 1
    expect(resolve('2026-07-16', s).startTime).toBe('07:00'); // -8 → day 7
  });

  it('5. large offset (+1000 days, cycle 5) → 1000 % 5 == 0 → day 1', () => {
    const s = flexSchedule('2026-01-01', 5);
    // 2026-01-01 + 1000 days
    const target = new Date(Date.UTC(2026, 0, 1) + 1000 * 86_400_000);
    const iso = target.toISOString().slice(0, 10);
    expect(resolve(iso, s).startTime).toBe('01:00');
  });

  it('6. cycleDays == 1 → always day 1', () => {
    const s = flexSchedule('2026-07-24', 1);
    expect(resolve('2026-07-24', s).startTime).toBe('01:00');
    expect(resolve('2026-12-31', s).startTime).toBe('01:00');
    expect(resolve('2025-01-01', s).startTime).toBe('01:00');
  });

  it('7. crossing a year boundary counts calendar days', () => {
    const s = flexSchedule('2025-12-30', 7);
    expect(resolve('2026-01-05', s).startTime).toBe('07:00'); // diff 6 → day 7
  });

  it('8. spanning Feb 29 (leap year) counts the extra day', () => {
    const s = flexSchedule('2028-02-27', 7); // 2028 is a leap year
    // 27→d1, 28→d2, 29→d3, Mar-01→d4
    expect(resolve('2028-02-29', s).startTime).toBe('03:00');
    expect(resolve('2028-03-01', s).startTime).toBe('04:00');
  });

  it('dayNumber difference equals raw calendar days across Feb 29', () => {
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-27')).toBe(3);
  });
});

describe('resolveShift — schedule variants', () => {
  it('9. free schedule → isFree, isWorkday, no fixed start', () => {
    const s: ResolvedScheduleInput = {
      type: 'free',
      startDate: '2026-01-01',
      cycleDays: 1,
      calcOvertime: true,
      extendedWorkMinutes: 120,
      days: [],
    };
    const r = resolve('2026-07-24', s);
    expect(r).toMatchObject({ isFree: true, isWorkday: true, startTime: null, source: 'schedule' });
    expect(r.calcOvertime).toBe(true);
  });

  it('10. a non-workday cycle day → isWorkday false, times null', () => {
    const s = flexSchedule('2026-07-24', 7, { 1: { isWorkday: false } });
    const r = resolve('2026-07-24', s);
    expect(r.isWorkday).toBe(false);
    expect(r.startTime).toBeNull();
    expect(r.source).toBe('schedule');
  });

  it('11. missing dayIndex (incomplete days array) → defensively isWorkday false', () => {
    const s = flexSchedule('2026-07-24', 7);
    s.days = s.days.filter((d) => d.dayIndex !== 1); // drop day 1
    expect(resolve('2026-07-24', s).isWorkday).toBe(false);
  });
});

describe('resolveShift — weekday fallback (schedule=null)', () => {
  const week: WeekdayShift[] = [
    { weekday: 5, startTime: '09:00', endTime: '18:00', isDayOff: false }, // Friday
    { weekday: 0, startTime: '00:00', endTime: '00:00', isDayOff: true }, // Sunday off
  ];

  it('12. picks the weekday row (noon-anchored) and honours isDayOff', () => {
    // 2026-07-24 is a Friday
    const fri = resolve('2026-07-24', null, week);
    expect(fri).toMatchObject({ isWorkday: true, startTime: '09:00', source: 'weekday' });
    // 2026-07-26 is a Sunday (day off)
    const sun = resolve('2026-07-26', null, week);
    expect(sun.isWorkday).toBe(false);
    expect(sun.source).toBe('weekday');
  });

  it('a weekday with no row → source none', () => {
    const sat = resolve('2026-07-25', null, week); // Saturday, no row
    expect(sat.isWorkday).toBe(false);
    expect(sat.source).toBe('none');
  });

  it('13. both schedule and weekFallback null → source none', () => {
    const r = resolve('2026-07-24', null, null);
    expect(r).toMatchObject({ isWorkday: false, source: 'none' });
  });
});

describe('resolveShift — backward-compat with computeLateMinutes', () => {
  it('14. lateMinutes via resolveShift == legacy computeLateMinutes(weekday row)', () => {
    const week: WeekdayShift[] = [
      { weekday: 5, startTime: '09:00', endTime: '18:00', isDayOff: false },
    ];
    const shift = resolve('2026-07-24', null, week); // Friday
    // check-in 09:25 local → 25 late minutes
    const checkIn = fromZonedTime('2026-07-24T09:25:00', TZ);
    const viaShift = lateMinutesForShift(checkIn, shift, TZ);
    const legacy = computeLateMinutes(
      checkIn,
      { startTime: '09:00', endTime: '18:00', isDayOff: false },
      TZ,
    );
    expect(viaShift).toBe(legacy);
    expect(viaShift).toBe(25);
  });

  it('free / day-off shift is never late', () => {
    const free = resolve('2026-07-24', {
      type: 'free',
      startDate: '2026-01-01',
      cycleDays: 1,
      calcOvertime: false,
      extendedWorkMinutes: 0,
      days: [],
    });
    const checkIn = fromZonedTime('2026-07-24T12:00:00', TZ);
    expect(lateMinutesForShift(checkIn, free, TZ)).toBe(0);
  });
});

describe('computeOvertimeMinutes', () => {
  const base = flexSchedule('2026-07-24', 1, { 1: { startTime: '09:00', endTime: '18:00' } });
  const shiftOf = (calcOvertime: boolean, extended: number) =>
    resolve('2026-07-24', { ...base, calcOvertime, extendedWorkMinutes: extended });

  it('is 0 when calcOvertime is off', () => {
    const out = fromZonedTime('2026-07-24T19:00:00', TZ);
    expect(computeOvertimeMinutes(out, shiftOf(false, 240), TZ, '2026-07-24')).toBe(0);
  });

  it('counts minutes past endTime when on', () => {
    const out = fromZonedTime('2026-07-24T18:30:00', TZ);
    expect(computeOvertimeMinutes(out, shiftOf(true, 240), TZ, '2026-07-24')).toBe(30);
  });

  it('caps at extendedWorkMinutes', () => {
    const out = fromZonedTime('2026-07-24T23:00:00', TZ); // 300 min past 18:00
    expect(computeOvertimeMinutes(out, shiftOf(true, 240), TZ, '2026-07-24')).toBe(240);
  });

  it('free schedule → 0', () => {
    const free = resolve('2026-07-24', {
      type: 'free',
      startDate: '2026-01-01',
      cycleDays: 1,
      calcOvertime: true,
      extendedWorkMinutes: 240,
      days: [],
    });
    const out = fromZonedTime('2026-07-24T23:00:00', TZ);
    expect(computeOvertimeMinutes(out, free, TZ, '2026-07-24')).toBe(0);
  });
});

describe('computeTotalWorkedMinutes', () => {
  const withBreak = resolve(
    '2026-07-24',
    flexSchedule('2026-07-24', 1, {
      1: { startTime: '09:00', endTime: '18:00', breakStart: '13:00', breakEnd: '14:00' },
    }),
  );

  it('subtracts a fully-contained break', () => {
    const inn = fromZonedTime('2026-07-24T09:00:00', TZ);
    const out = fromZonedTime('2026-07-24T18:00:00', TZ);
    // 9h = 540 min minus 60 min break = 480
    expect(computeTotalWorkedMinutes(inn, out, withBreak, TZ, '2026-07-24')).toBe(480);
  });

  it('subtracts only the real overlap when check-out is mid-break', () => {
    const inn = fromZonedTime('2026-07-24T09:00:00', TZ);
    const out = fromZonedTime('2026-07-24T13:30:00', TZ); // 4.5h, break overlaps 13:00–13:30 = 30
    // 270 min minus 30 = 240
    expect(computeTotalWorkedMinutes(inn, out, withBreak, TZ, '2026-07-24')).toBe(240);
  });

  it('no break → raw worked', () => {
    const noBreak = resolve('2026-07-24', flexSchedule('2026-07-24', 1));
    const inn = fromZonedTime('2026-07-24T09:00:00', TZ);
    const out = fromZonedTime('2026-07-24T17:00:00', TZ);
    expect(computeTotalWorkedMinutes(inn, out, noBreak, TZ, '2026-07-24')).toBe(480);
  });
});
