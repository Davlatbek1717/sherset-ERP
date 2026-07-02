import { describe, expect, it } from 'vitest';
import { reportDateBounds, tashkentRangeBounds } from './report-date-bounds.util.js';

/**
 * The half-open Tashkent-day window. The FE sends date-only strings that
 * z.coerce.date() turns into UTC midnight; these assertions encode the
 * ±5h (UTC+5, no DST) shift that makes the last picked day fully included.
 */
describe('reportDateBounds — Asia/Tashkent calendar-day UTC window', () => {
  const from = new Date('2026-06-01T00:00:00.000Z'); // "2026-06-01"
  const to = new Date('2026-06-13T00:00:00.000Z'); // "2026-06-13"
  const { gte, lt } = reportDateBounds(from, to);

  it('gte = Tashkent 00:00 of the from-day (from − 5h)', () => {
    expect(gte.toISOString()).toBe('2026-05-31T19:00:00.000Z');
  });

  it('lt = Tashkent 00:00 of the day AFTER to (to + 24h − 5h), exclusive', () => {
    expect(lt.toISOString()).toBe('2026-06-13T19:00:00.000Z');
  });

  it('INCLUDES a document posted late on the last Tashkent day (the bug it fixes)', () => {
    // 2026-06-13 23:30 Tashkent = 2026-06-13T18:30:00Z — was EXCLUDED by `moment <= dateTo`
    const lastDayLate = new Date('2026-06-13T18:30:00.000Z');
    expect(lastDayLate >= gte && lastDayLate < lt).toBe(true);
  });

  it('INCLUDES a document early on the first Tashkent day', () => {
    // 2026-06-01 01:00 Tashkent = 2026-05-31T20:00:00Z
    const firstDayEarly = new Date('2026-05-31T20:00:00.000Z');
    expect(firstDayEarly >= gte && firstDayEarly < lt).toBe(true);
  });

  it('EXCLUDES a document on the day after the to-day (Tashkent)', () => {
    // 2026-06-14 00:30 Tashkent = 2026-06-13T19:30:00Z
    const nextDay = new Date('2026-06-13T19:30:00.000Z');
    expect(nextDay < lt).toBe(false);
  });

  it('EXCLUDES a document before the from-day (Tashkent)', () => {
    // 2026-05-31 23:00 Tashkent = 2026-05-31T18:00:00Z
    const beforeFrom = new Date('2026-05-31T18:00:00.000Z');
    expect(beforeFrom >= gte).toBe(false);
  });

  it('single-day range covers exactly 24h', () => {
    const d = new Date('2026-06-13T00:00:00.000Z');
    const b = reportDateBounds(d, d);
    expect(b.lt.getTime() - b.gte.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('tashkentRangeBounds — optional date-only list filter bounds', () => {
  it('both bounds: gte = from − 5h, lt = to + 24h − 5h (half-open)', () => {
    const b = tashkentRangeBounds('2026-06-01', '2026-06-13');
    expect(b.gte?.toISOString()).toBe('2026-05-31T19:00:00.000Z');
    expect(b.lt?.toISOString()).toBe('2026-06-13T19:00:00.000Z');
  });

  it('from-only: only gte, no upper bound', () => {
    const b = tashkentRangeBounds('2026-06-01', undefined);
    expect(b.gte?.toISOString()).toBe('2026-05-31T19:00:00.000Z');
    expect(b.lt).toBeUndefined();
  });

  it('to-only: only lt (exclusive), no lower bound', () => {
    const b = tashkentRangeBounds(null, '2026-06-13');
    expect(b.gte).toBeUndefined();
    expect(b.lt?.toISOString()).toBe('2026-06-13T19:00:00.000Z');
  });

  it('neither: empty object', () => {
    expect(tashkentRangeBounds()).toEqual({});
  });

  it('includes a doc late on the last Tashkent day (the list bug it fixes)', () => {
    const b = tashkentRangeBounds('2026-06-01', '2026-06-13');
    const lastDayLate = new Date('2026-06-13T18:30:00.000Z'); // 23:30 Tashkent
    expect(b.gte! <= lastDayLate && lastDayLate < b.lt!).toBe(true);
  });
});
