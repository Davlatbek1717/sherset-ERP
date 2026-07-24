import { describe, expect, it } from 'vitest';
import { computeLateMinutes } from './late-minutes.util.js';

const TZ = 'Asia/Tashkent';
const sched = { startTime: '09:00', endTime: '18:00', isDayOff: false };

describe('computeLateMinutes', () => {
  it('15 min late', () => {
    expect(computeLateMinutes(new Date('2026-07-27T09:15:00+05:00'), sched, TZ)).toBe(15);
  });
  it('early -> 0', () => {
    expect(computeLateMinutes(new Date('2026-07-27T08:50:00+05:00'), sched, TZ)).toBe(0);
  });
  it('null schedule -> 0', () => {
    expect(computeLateMinutes(new Date('2026-07-27T09:15:00+05:00'), null, TZ)).toBe(0);
  });
  it('day off -> 0', () => {
    expect(
      computeLateMinutes(new Date('2026-07-27T09:15:00+05:00'), { ...sched, isDayOff: true }, TZ),
    ).toBe(0);
  });
});
