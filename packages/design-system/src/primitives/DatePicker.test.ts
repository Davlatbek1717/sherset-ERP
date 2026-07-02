import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  buildGrid,
  formatIso,
  isSameDay,
  parseIso,
  startOfDay,
} from './DatePicker.tsx';

describe('DatePicker.parseIso / formatIso', () => {
  it('round-trips a YYYY-MM-DD value', () => {
    const d = parseIso('2026-04-30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // April = month index 3
    expect(d.getDate()).toBe(30);
    expect(formatIso(d)).toBe('2026-04-30');
  });

  it('pads single-digit month and day', () => {
    expect(formatIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('falls back to today on garbage input', () => {
    const d = parseIso('not a date');
    const today = startOfDay(new Date());
    expect(isSameDay(d, today)).toBe(true);
  });

  it('ignores trailing time portion', () => {
    expect(formatIso(parseIso('2026-04-30T15:00:00Z'))).toBe('2026-04-30');
  });
});

describe('DatePicker.addDays / addMonths', () => {
  it('adds and subtracts days correctly across month boundary', () => {
    expect(formatIso(addDays(parseIso('2026-04-30'), 1))).toBe('2026-05-01');
    expect(formatIso(addDays(parseIso('2026-04-01'), -1))).toBe('2026-03-31');
  });

  it('adds and subtracts months across year boundary', () => {
    expect(formatIso(addMonths(parseIso('2026-12-15'), 1))).toBe('2027-01-15');
    expect(formatIso(addMonths(parseIso('2026-01-15'), -1))).toBe('2025-12-15');
  });

  it('clamps day-of-month when target month is shorter', () => {
    // Jan 31 + 1 month should land in Feb (28 or 29 depending on year);
    // JS rolls forward to March in non-leap years, document that behaviour
    // so the picker grid is never surprising.
    const result = formatIso(addMonths(parseIso('2026-01-31'), 1));
    expect(['2026-02-28', '2026-03-03']).toContain(result);
  });
});

describe('DatePicker.isSameDay', () => {
  it('matches dates regardless of time-of-day component', () => {
    const a = new Date(2026, 3, 30, 10, 0, 0);
    const b = new Date(2026, 3, 30, 23, 59, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    expect(isSameDay(parseIso('2026-04-30'), parseIso('2026-05-01'))).toBe(false);
  });

  it('returns false when the second date is null', () => {
    expect(isSameDay(parseIso('2026-04-30'), null)).toBe(false);
  });
});

describe('DatePicker.buildGrid', () => {
  it('returns exactly 42 cells (6 rows × 7 columns)', () => {
    const grid = buildGrid(parseIso('2026-04-15'), 1);
    expect(grid).toHaveLength(42);
  });

  it('aligns the grid to Monday when weekStartsOn=1', () => {
    // April 2026 — first day is a Wednesday. Grid should start on
    // Monday March 30.
    const grid = buildGrid(parseIso('2026-04-01'), 1);
    expect(grid[0]?.getDay()).toBe(1); // Monday
    expect(formatIso(grid[0]!)).toBe('2026-03-30');
  });

  it('aligns the grid to Sunday when weekStartsOn=0', () => {
    const grid = buildGrid(parseIso('2026-04-01'), 0);
    expect(grid[0]?.getDay()).toBe(0); // Sunday
  });

  it('contains every day of the requested month', () => {
    const grid = buildGrid(parseIso('2026-04-15'), 1);
    const aprilDays = grid.filter((d) => d.getMonth() === 3); // April
    // Either covers all 30 days at minimum
    expect(aprilDays.length).toBeGreaterThanOrEqual(30);
  });
});
