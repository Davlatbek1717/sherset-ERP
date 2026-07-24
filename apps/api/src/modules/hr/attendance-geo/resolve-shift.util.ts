import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { type DaySchedule, computeLateMinutes } from './late-minutes.util.js';

/**
 * resolveShift — the single sanctioned source for "what shift did this employee
 * owe on calendar date D". Unifies three inputs:
 *   1. a named cyclic HrSchedule ('flexible' — Kun 1..N with per-day times), or
 *   2. a named 'free' (Erkin) HrSchedule (no fixed start → never late), or
 *   3. the legacy per-weekday EmployeeWorkSchedule fallback (when scheduleId is null).
 *
 * Pure (no DI, no Prisma) so ping-ingest / auto-checkout cron / monthly-report
 * all read one implementation. Backward-compatible invariant: a null schedule
 * falls straight through to the weekday fallback → existing behaviour is
 * preserved bit-for-bit. See spec §5.1.
 *
 * TZ note: Asia/Tashkent has been a fixed +05:00 (no DST) since 1991, so the
 * cycle index is computed from a UTC-anchored calendar-day difference
 * (`dayNumber`) which can never drift; the weekday fallback anchors at local
 * noon (mirror monthly-report.util.ts) to stay clear of midnight edges.
 */

export interface ScheduleDayInput {
  dayIndex: number;
  isWorkday: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface ResolvedScheduleInput {
  type: 'flexible' | 'free';
  /** Cycle anchor as a calendar date "yyyy-MM-dd" (no time component). */
  startDate: string;
  cycleDays: number;
  calcOvertime: boolean;
  extendedWorkMinutes: number;
  days: ScheduleDayInput[];
}

export interface WeekdayShift {
  weekday: number; // 0=Sun … 6=Sat (tashkentWeekday convention, LOCKED)
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}

export interface ExpectedShift {
  isWorkday: boolean;
  isFree: boolean;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  calcOvertime: boolean;
  extendedWorkMinutes: number;
  source: 'schedule' | 'weekday' | 'none';
}

const MS_PER_DAY = 86_400_000;

/** UTC-anchored calendar day number for "yyyy-MM-dd" (wall-clock independent). */
export function dayNumber(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / MS_PER_DAY);
}

function emptyShift(
  source: ExpectedShift['source'],
  calcOvertime = false,
  extendedWorkMinutes = 0,
): ExpectedShift {
  return {
    isWorkday: false,
    isFree: false,
    startTime: null,
    endTime: null,
    breakStart: null,
    breakEnd: null,
    calcOvertime,
    extendedWorkMinutes,
    source,
  };
}

export function resolveShift(params: {
  date: string; // "yyyy-MM-dd" local (Tashkent) calendar date
  tz: string;
  schedule: ResolvedScheduleInput | null;
  weekFallback: WeekdayShift[] | null;
}): ExpectedShift {
  const { date, tz, schedule, weekFallback } = params;

  // A) A named schedule is assigned.
  if (schedule) {
    if (schedule.type === 'free') {
      // Erkin: no fixed start, any day is workable, never late.
      return {
        isWorkday: true,
        isFree: true,
        startTime: null,
        endTime: null,
        breakStart: null,
        breakEnd: null,
        calcOvertime: schedule.calcOvertime,
        extendedWorkMinutes: schedule.extendedWorkMinutes,
        source: 'schedule',
      };
    }

    // flexible: cycle index. JS % can be negative for dates before startDate →
    // normalise with ((x % n) + n) % n, then 1-based.
    const cycle = Math.max(1, schedule.cycleDays);
    const diff = dayNumber(date) - dayNumber(schedule.startDate);
    const cycleDayIndex = (((diff % cycle) + cycle) % cycle) + 1;
    const day = schedule.days.find((d) => d.dayIndex === cycleDayIndex);
    if (!day || !day.isWorkday) {
      return emptyShift('schedule', schedule.calcOvertime, schedule.extendedWorkMinutes);
    }
    return {
      isWorkday: true,
      isFree: false,
      startTime: day.startTime,
      endTime: day.endTime,
      breakStart: day.breakStart,
      breakEnd: day.breakEnd,
      calcOvertime: schedule.calcOvertime,
      extendedWorkMinutes: schedule.extendedWorkMinutes,
      source: 'schedule',
    };
  }

  // B) No schedule → legacy weekday fallback (existing behaviour).
  if (weekFallback) {
    const noonUtc = fromZonedTime(`${date}T12:00:00`, tz);
    const weekday = Number(formatInTimeZone(noonUtc, tz, 'i')) % 7; // 0=Sun..6=Sat
    const row = weekFallback.find((w) => w.weekday === weekday);
    if (!row || row.isDayOff) {
      return emptyShift(row ? 'weekday' : 'none');
    }
    return {
      isWorkday: true,
      isFree: false,
      startTime: row.startTime,
      endTime: row.endTime,
      breakStart: null,
      breakEnd: null,
      calcOvertime: false,
      extendedWorkMinutes: 0,
      source: 'weekday',
    };
  }

  // C) No schedule at all.
  return emptyShift('none');
}

/**
 * Late minutes for a resolved shift — reuses computeLateMinutes unchanged.
 * Free / day-off / no-start shifts are never late (0).
 */
export function lateMinutesForShift(checkInUtc: Date, shift: ExpectedShift, tz: string): number {
  if (shift.isFree || !shift.isWorkday || !shift.startTime) return 0;
  const day: DaySchedule = {
    startTime: shift.startTime,
    endTime: shift.endTime ?? shift.startTime,
    isDayOff: false,
  };
  return computeLateMinutes(checkInUtc, day, tz);
}

/**
 * "Qo'shimcha" (overtime): minutes worked past the shift's endTime, capped at
 * the schedule's extendedWorkMinutes ("Uzaytirilgan ish vaqti"). Only counted
 * when calcOvertime is on and the shift has a fixed end. Free ⇒ 0.
 */
export function computeOvertimeMinutes(
  checkOutUtc: Date,
  shift: ExpectedShift,
  tz: string,
  localDate: string,
): number {
  if (!shift.calcOvertime || shift.isFree || !shift.endTime) return 0;
  const endUtc = fromZonedTime(`${localDate}T${shift.endTime}:00`, tz);
  const raw = Math.max(0, Math.floor((checkOutUtc.getTime() - endUtc.getTime()) / 60_000));
  return Math.min(raw, Math.max(0, shift.extendedWorkMinutes));
}

/**
 * "Jami" (total worked): checkOut − checkIn minus any real overlap with the
 * shift's break window. Free / break-less shifts ⇒ raw worked minutes.
 */
export function computeTotalWorkedMinutes(
  checkInUtc: Date,
  checkOutUtc: Date,
  shift: ExpectedShift,
  tz: string,
  localDate: string,
): number {
  let worked = Math.max(0, Math.floor((checkOutUtc.getTime() - checkInUtc.getTime()) / 60_000));
  if (shift.breakStart && shift.breakEnd) {
    const bStart = fromZonedTime(`${localDate}T${shift.breakStart}:00`, tz).getTime();
    const bEnd = fromZonedTime(`${localDate}T${shift.breakEnd}:00`, tz).getTime();
    const overlapMs =
      Math.min(checkOutUtc.getTime(), bEnd) - Math.max(checkInUtc.getTime(), bStart);
    if (overlapMs > 0) worked -= Math.floor(overlapMs / 60_000);
  }
  return Math.max(0, worked);
}
