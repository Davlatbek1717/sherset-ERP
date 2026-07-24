import { fromZonedTime } from 'date-fns-tz';
import { type ExpectedShift, computeOvertimeMinutes } from './resolve-shift.util.js';

/**
 * Aggregate one employee's attendance rows for a single calendar day into the
 * dashboard's Kirish/Chiqish/Qo'shimcha/Jami figures. An employee may check in
 * and out several times a day (stepped out and returned): check-in is the
 * earliest, check-out the latest (null while any segment is still open), and
 * total is the sum of each segment's worked minutes minus any break overlap.
 * Pure + co-located test. See spec §5.3.
 */

export interface AttendanceRowLite {
  checkInTime: Date;
  checkOutTime: Date | null;
  lateMinutes: number;
}

export interface EmployeeDayAgg {
  checkIn: Date | null;
  checkOut: Date | null;
  lateMinutes: number;
  totalMinutes: number;
  overtimeMinutes: number;
  /** True while at least one segment is still open (checked in, not out). */
  isAtWork: boolean;
}

export function aggregateEmployeeDay(params: {
  rows: AttendanceRowLite[];
  shift: ExpectedShift;
  tz: string;
  localDate: string;
  now: Date;
  isToday: boolean;
}): EmployeeDayAgg {
  const { rows, shift, tz, localDate, now, isToday } = params;
  if (rows.length === 0) {
    return {
      checkIn: null,
      checkOut: null,
      lateMinutes: 0,
      totalMinutes: 0,
      overtimeMinutes: 0,
      isAtWork: false,
    };
  }

  const sorted = [...rows].sort((a, b) => a.checkInTime.getTime() - b.checkInTime.getTime());
  const checkIn = sorted[0]?.checkInTime ?? null;
  const hasOpen = sorted.some((r) => r.checkOutTime === null);
  const closedOuts = sorted
    .map((r) => r.checkOutTime)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  const checkOut = hasOpen || closedOuts.length === 0 ? null : new Date(Math.max(...closedOuts));

  // Sum each segment's worked minutes minus that segment's own overlap with the
  // break window. Per-segment (not whole-span) so a "stepped out for lunch"
  // multi-segment day — where the between-segment gap already excludes the
  // break — is not charged the break a second time. An open segment counts up
  // to `now` only when we're viewing today (a stale open record on a past day
  // contributes 0).
  const bStart = shift.breakStart
    ? fromZonedTime(`${localDate}T${shift.breakStart}:00`, tz).getTime()
    : null;
  const bEnd = shift.breakEnd
    ? fromZonedTime(`${localDate}T${shift.breakEnd}:00`, tz).getTime()
    : null;
  let totalMinutes = 0;
  for (const r of sorted) {
    const end = r.checkOutTime ?? (isToday ? now : null);
    if (!end) continue;
    let seg = Math.max(0, Math.floor((end.getTime() - r.checkInTime.getTime()) / 60_000));
    if (bStart !== null && bEnd !== null) {
      const overlap = Math.min(end.getTime(), bEnd) - Math.max(r.checkInTime.getTime(), bStart);
      if (overlap > 0) seg -= Math.floor(overlap / 60_000);
    }
    totalMinutes += Math.max(0, seg);
  }

  return {
    checkIn,
    checkOut,
    lateMinutes: sorted[0]?.lateMinutes ?? 0,
    totalMinutes,
    overtimeMinutes: checkOut ? computeOvertimeMinutes(checkOut, shift, tz, localDate) : 0,
    // An open record on a PAST day is not "at work now" (cron will auto-close
    // it); gating on isToday keeps the dashboard atWork count consistent with
    // the monitoring board, which reads such records as 'left'.
    isAtWork: hasOpen && isToday,
  };
}
