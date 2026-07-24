import { describe, expect, it } from 'vitest';
import {
  type AttendanceMarkRow,
  expandMarks,
  resolveDayRow,
  shiftToSchedule,
} from './monitoring.util.js';
import type { ExpectedShift } from './resolve-shift.util.js';

const mkShift = (over: Partial<ExpectedShift>): ExpectedShift => ({
  isWorkday: true,
  isFree: false,
  startTime: '09:00',
  endTime: '18:00',
  breakStart: null,
  breakEnd: null,
  calcOvertime: false,
  extendedWorkMinutes: 0,
  source: 'schedule',
  ...over,
});

const workday = { startTime: '09:00', endTime: '18:00', isDayOff: false };
const dayoff = { startTime: '00:00', endTime: '00:00', isDayOff: true };

describe('resolveDayRow', () => {
  it('on-time present, still at work today', () => {
    expect(
      resolveDayRow({
        schedule: workday,
        arrival: { lateMinutes: 0 },
        latest: { checkOutTime: null },
        isToday: true,
      }),
    ).toEqual({ attendanceState: 'ontime', presence: 'at_work' });
  });

  it('late + already left', () => {
    expect(
      resolveDayRow({
        schedule: workday,
        arrival: { lateMinutes: 12 },
        latest: { checkOutTime: new Date() },
        isToday: true,
      }),
    ).toEqual({ attendanceState: 'late', presence: 'left' });
  });

  it('open record on a PAST day reads left (departure never seen)', () => {
    expect(
      resolveDayRow({
        schedule: workday,
        arrival: { lateMinutes: 0 },
        latest: { checkOutTime: null },
        isToday: false,
      }),
    ).toEqual({ attendanceState: 'ontime', presence: 'left' });
  });

  it('no record on a workday → absent', () => {
    expect(
      resolveDayRow({ schedule: workday, arrival: null, latest: null, isToday: true }),
    ).toEqual({
      attendanceState: null,
      presence: 'absent',
    });
  });

  it('no record on a day off → dayoff', () => {
    expect(resolveDayRow({ schedule: dayoff, arrival: null, latest: null, isToday: true })).toEqual(
      {
        attendanceState: null,
        presence: 'dayoff',
      },
    );
    // no schedule at all is also treated as a non-workday
    expect(
      resolveDayRow({ schedule: null, arrival: null, latest: null, isToday: true }).presence,
    ).toBe('dayoff');
  });

  it('worked on a day off → present, not counted absent/late', () => {
    expect(
      resolveDayRow({
        schedule: dayoff,
        arrival: { lateMinutes: 0 },
        latest: { checkOutTime: null },
        isToday: true,
      }),
    ).toEqual({ attendanceState: 'ontime', presence: 'at_work' });
  });
});

describe('shiftToSchedule', () => {
  it('source=none → null (no schedule at all)', () => {
    expect(
      shiftToSchedule(
        mkShift({ source: 'none', isWorkday: false, startTime: null, endTime: null }),
      ),
    ).toBeNull();
  });

  it('resolved named-schedule workday → isDayOff false with resolved times', () => {
    // The Faza-6 HIGH fix: a named HrSchedule workday must NOT read as day off.
    expect(shiftToSchedule(mkShift({ source: 'schedule' }))).toEqual({
      startTime: '09:00',
      endTime: '18:00',
      isDayOff: false,
    });
  });

  it('resolved non-workday → isDayOff true', () => {
    expect(
      shiftToSchedule(
        mkShift({ source: 'schedule', isWorkday: false, startTime: null, endTime: null }),
      ),
    ).toMatchObject({ isDayOff: true });
  });

  it('free schedule (no fixed times) → workday with empty times', () => {
    expect(shiftToSchedule(mkShift({ isFree: true, startTime: null, endTime: null }))).toEqual({
      startTime: '',
      endTime: '',
      isDayOff: false,
    });
  });
});

const row = (over: Partial<AttendanceMarkRow>): AttendanceMarkRow => ({
  id: 'a1',
  checkInTime: new Date('2026-07-24T04:00:00Z'),
  checkOutTime: null,
  lateMinutes: 0,
  checkInLat: 41.31,
  checkInLng: 69.28,
  checkInAccuracy: 20,
  checkOutLat: null,
  checkOutLng: null,
  autoClosed: false,
  ...over,
});

describe('expandMarks', () => {
  it('open record → single entry mark with coordinates', () => {
    const marks = expandMarks([row({ lateMinutes: 5 })]);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({
      type: 'entry',
      state: 'late',
      lat: 41.31,
      lng: 69.28,
      accuracy: 20,
    });
  });

  it('closed record → entry + exit, exit carries checkout coords + autoClosed', () => {
    const marks = expandMarks([
      row({
        checkOutTime: new Date('2026-07-24T13:00:00Z'),
        checkOutLat: 41.4,
        checkOutLng: 69.3,
        autoClosed: true,
      }),
    ]);
    expect(marks).toHaveLength(2);
    expect(marks[0].type).toBe('entry');
    expect(marks[1]).toMatchObject({
      type: 'exit',
      state: null,
      lat: 41.4,
      lng: 69.3,
      autoClosed: true,
    });
  });

  it('sorts all marks chronologically across records', () => {
    const marks = expandMarks([
      row({ id: 'b', checkInTime: new Date('2026-07-24T09:00:00Z') }),
      row({
        id: 'a',
        checkInTime: new Date('2026-07-24T04:00:00Z'),
        checkOutTime: new Date('2026-07-24T06:00:00Z'),
      }),
    ]);
    const times = marks.map((m) => m.at.toISOString());
    expect(times).toEqual([...times].sort());
  });
});
