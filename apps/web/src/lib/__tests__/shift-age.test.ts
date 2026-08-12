import { describe, expect, it } from 'vitest';
import { formatShiftAge, splitShiftAge } from '../shift-age';

/** Kalit + parametrlarni ko'rinadigan satrga aylantiruvchi soxta `t`. */
const t = (key: string, values?: Record<string, string | number>) =>
  `${key}(${Object.entries(values ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join(',')})`;

describe('splitShiftAge', () => {
  it('kun/soat/daqiqaga ajratadi', () => {
    expect(splitShiftAge(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(splitShiftAge(59)).toEqual({ days: 0, hours: 0, minutes: 59 });
    expect(splitShiftAge(60)).toEqual({ days: 0, hours: 1, minutes: 0 });
    expect(splitShiftAge(11 * 24 * 60 + 5 * 60 + 7)).toEqual({ days: 11, hours: 5, minutes: 7 });
  });

  it('manfiy va buzuq qiymat 0 ga qisiladi (ekranda `-3 soat` chiqmasin)', () => {
    expect(splitShiftAge(-120)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(splitShiftAge(Number.NaN)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe('formatShiftAge', () => {
  it('eng katta ikki birlikni tanlaydi', () => {
    expect(formatShiftAge(45, t)).toBe('shift_age_minutes(m=45)');
    expect(formatShiftAge(5 * 60 + 20, t)).toBe('shift_age_hours(h=5,m=20)');
    expect(formatShiftAge(2 * 24 * 60 + 3 * 60, t)).toBe('shift_age_days(d=2,h=3)');
  });
});
