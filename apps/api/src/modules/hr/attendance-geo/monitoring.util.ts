/**
 * Pure derivation for the "Xodimlarni kuzatish" (employee monitoring) board.
 * Reads only already-stored attendance data — lateMinutes was written at
 * check-in time (computeLateMinutes), so nothing is recomputed here. See spec
 * §5.5.
 */

import type { ExpectedShift } from './resolve-shift.util.js';

export interface MonitoringSchedule {
  startTime: string;
  endTime: string;
  isDayOff: boolean;
}

/**
 * Project a resolveShift() result into the monitoring row's schedule cell.
 * `source: 'none'` (no schedule at all) → null; otherwise isDayOff reflects the
 * resolved workday flag. Free schedules have null start/end → empty strings.
 */
export function shiftToSchedule(shift: ExpectedShift): MonitoringSchedule | null {
  if (shift.source === 'none') return null;
  return {
    startTime: shift.startTime ?? '',
    endTime: shift.endTime ?? '',
    isDayOff: !shift.isWorkday,
  };
}

export type AttendanceState = 'ontime' | 'late' | null;
export type Presence = 'at_work' | 'left' | 'absent' | 'dayoff';

export interface DayRowInput {
  /** The weekday row from EmployeeWorkSchedule, or null when none / day off. */
  schedule: MonitoringSchedule | null;
  /** Earliest attendance record of the day, or null when absent. */
  arrival: { lateMinutes: number } | null;
  /** Latest attendance record of the day (for open/closed presence). */
  latest: { checkOutTime: Date | null } | null;
  isToday: boolean;
}

export interface DayRowStatus {
  attendanceState: AttendanceState;
  presence: Presence;
}

/**
 * Two-badge status: attendance-state (Vaqtida/Kechikkan, from the earliest
 * record's lateMinutes) + presence (Ishda/Ketgan/Kelmagan/Dam olish). A record
 * on a day off still reads present (worked voluntarily). An open record on a
 * PAST day reads `left` (came but departure never seen — cron auto-closes it).
 */
export function resolveDayRow(input: DayRowInput): DayRowStatus {
  const { schedule, arrival, latest, isToday } = input;
  const isWorkday = schedule != null && !schedule.isDayOff;

  if (arrival) {
    const attendanceState: AttendanceState = arrival.lateMinutes > 0 ? 'late' : 'ontime';
    const open = !latest?.checkOutTime;
    const presence: Presence = open ? (isToday ? 'at_work' : 'left') : 'left';
    return { attendanceState, presence };
  }
  return { attendanceState: null, presence: isWorkday ? 'absent' : 'dayoff' };
}

export interface AttendanceMarkRow {
  id: string;
  checkInTime: Date;
  checkOutTime: Date | null;
  lateMinutes: number;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  autoClosed: boolean;
}

export interface Mark {
  id: string;
  at: Date;
  type: 'entry' | 'exit';
  state: 'ontime' | 'late' | null;
  lateMinutes: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  autoClosed: boolean;
  photoUrl: null; // punch photo — DEFER (schema has no column)
}

/**
 * Expand each HrAttendance record into an entry mark (+ an exit mark when
 * checked out). Sorted chronologically. Coordinates come from the punch
 * lat/lng; an auto-closed exit may lack coordinates (→ null).
 */
export function expandMarks(rows: AttendanceMarkRow[]): Mark[] {
  const marks: Mark[] = [];
  for (const r of rows) {
    marks.push({
      id: r.id,
      at: r.checkInTime,
      type: 'entry',
      state: r.lateMinutes > 0 ? 'late' : 'ontime',
      lateMinutes: r.lateMinutes,
      lat: r.checkInLat,
      lng: r.checkInLng,
      accuracy: r.checkInAccuracy,
      autoClosed: false,
      photoUrl: null,
    });
    if (r.checkOutTime) {
      marks.push({
        id: r.id,
        at: r.checkOutTime,
        type: 'exit',
        state: null,
        lateMinutes: 0,
        lat: r.checkOutLat,
        lng: r.checkOutLng,
        accuracy: null,
        autoClosed: r.autoClosed,
        photoUrl: null,
      });
    }
  }
  return marks.sort((a, b) => a.at.getTime() - b.at.getTime());
}
