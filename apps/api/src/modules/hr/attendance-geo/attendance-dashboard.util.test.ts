import { fromZonedTime } from 'date-fns-tz';
import { describe, expect, it } from 'vitest';
import { aggregateEmployeeDay } from './attendance-dashboard.util.js';
import type { ExpectedShift } from './resolve-shift.util.js';

const TZ = 'Asia/Tashkent';
const DATE = '2026-07-24';
const at = (hhmm: string) => fromZonedTime(`${DATE}T${hhmm}:00`, TZ);

const shift = (over: Partial<ExpectedShift> = {}): ExpectedShift => ({
  isWorkday: true,
  isFree: false,
  startTime: '09:00',
  endTime: '18:00',
  breakStart: null,
  breakEnd: null,
  calcOvertime: false,
  extendedWorkMinutes: 240,
  source: 'schedule',
  ...over,
});

describe('aggregateEmployeeDay', () => {
  it('no rows → all zero, not at work', () => {
    const r = aggregateEmployeeDay({
      rows: [],
      shift: shift(),
      tz: TZ,
      localDate: DATE,
      now: at('12:00'),
      isToday: true,
    });
    expect(r).toMatchObject({ checkIn: null, checkOut: null, totalMinutes: 0, isAtWork: false });
  });

  it('single closed segment → total = worked minutes', () => {
    const r = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: at('18:00'), lateMinutes: 0 }],
      shift: shift(),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.totalMinutes).toBe(540); // 9h
    expect(r.isAtWork).toBe(false);
    expect(r.checkIn).toEqual(at('09:00'));
    expect(r.checkOut).toEqual(at('18:00'));
  });

  it('subtracts a break inside the worked span', () => {
    const r = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: at('18:00'), lateMinutes: 0 }],
      shift: shift({ breakStart: '13:00', breakEnd: '14:00' }),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.totalMinutes).toBe(480); // 9h − 1h break
  });

  it('does NOT double-deduct the break on a stepped-out multi-segment day', () => {
    // Employee left for lunch: two segments whose gap IS the break window.
    // Per-segment worked = 240 + 240 = 480; the break must not be charged again.
    const r = aggregateEmployeeDay({
      rows: [
        { checkInTime: at('09:00'), checkOutTime: at('13:00'), lateMinutes: 0 },
        { checkInTime: at('14:00'), checkOutTime: at('18:00'), lateMinutes: 0 },
      ],
      shift: shift({ breakStart: '13:00', breakEnd: '14:00' }),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.totalMinutes).toBe(480);
  });

  it('deducts only the real overlap when one segment partially covers the break', () => {
    // 09:00–13:30 overlaps 13:00–13:30 of the break (30 min), single segment.
    const r = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: at('13:30'), lateMinutes: 0 }],
      shift: shift({ breakStart: '13:00', breakEnd: '14:00' }),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.totalMinutes).toBe(240); // 270 worked − 30 break overlap
  });

  it('open segment counts to now only when today', () => {
    const today = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: null, lateMinutes: 0 }],
      shift: shift(),
      tz: TZ,
      localDate: DATE,
      now: at('12:00'),
      isToday: true,
    });
    expect(today.totalMinutes).toBe(180); // 09:00→12:00
    expect(today.isAtWork).toBe(true);
    expect(today.checkOut).toBeNull();

    const past = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: null, lateMinutes: 0 }],
      shift: shift(),
      tz: TZ,
      localDate: DATE,
      now: at('12:00'),
      isToday: false,
    });
    expect(past.totalMinutes).toBe(0); // stale open record on a past day
  });

  it('multiple segments: earliest in, latest out, summed total', () => {
    const r = aggregateEmployeeDay({
      rows: [
        { checkInTime: at('09:00'), checkOutTime: at('12:00'), lateMinutes: 5 },
        { checkInTime: at('14:00'), checkOutTime: at('18:00'), lateMinutes: 0 },
      ],
      shift: shift(),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.checkIn).toEqual(at('09:00'));
    expect(r.checkOut).toEqual(at('18:00'));
    expect(r.totalMinutes).toBe(3 * 60 + 4 * 60); // 3h + 4h = 420 (the 12–14 gap excluded)
    expect(r.lateMinutes).toBe(5); // from the earliest row
  });

  it('overtime past scheduled end when calcOvertime is on', () => {
    const r = aggregateEmployeeDay({
      rows: [{ checkInTime: at('09:00'), checkOutTime: at('19:30'), lateMinutes: 0 }],
      shift: shift({ calcOvertime: true, extendedWorkMinutes: 240 }),
      tz: TZ,
      localDate: DATE,
      now: at('20:00'),
      isToday: true,
    });
    expect(r.overtimeMinutes).toBe(90); // 18:00 → 19:30
  });
});
