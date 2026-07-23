import { describe, expect, it } from 'vitest';
import { computeMonthlyAttendance } from './monthly-report.util.js';

const TZ = 'Asia/Tashkent';
// week indexed 0=Sun..6=Sat; Sun+Sat off, Mon-Fri 09:00-18:00
const week = [0, 1, 2, 3, 4, 5, 6].map((wd) => ({
  weekday: wd,
  startTime: '09:00',
  endTime: '18:00',
  isDayOff: wd === 0 || wd === 6,
}));

describe('computeMonthlyAttendance', () => {
  it('scheduled workday with no attendance -> absent', () => {
    const r = computeMonthlyAttendance({
      yearMonth: '2026-07',
      week,
      attendance: [],
      tz: TZ,
      todayLocalDate: '2026-07-31',
    });
    expect(r.rows.find((x) => x.date === '2026-07-27')?.status).toBe('absent'); // Monday
    expect(r.absentDays).toBeGreaterThan(0);
  });
  it('late attendance -> late', () => {
    const r = computeMonthlyAttendance({
      yearMonth: '2026-07',
      week,
      tz: TZ,
      todayLocalDate: '2026-07-31',
      attendance: [
        {
          checkInTime: new Date('2026-07-27T09:20:00+05:00'),
          checkOutTime: new Date('2026-07-27T18:00:00+05:00'),
          lateMinutes: 20,
        },
      ],
    });
    expect(r.rows.find((x) => x.date === '2026-07-27')?.status).toBe('late');
    expect(r.lateDays).toBe(1);
  });
  it('day-off weekday -> dayoff (never absent)', () => {
    const r = computeMonthlyAttendance({
      yearMonth: '2026-07',
      week,
      attendance: [],
      tz: TZ,
      todayLocalDate: '2026-07-31',
    });
    expect(r.rows.find((x) => x.date === '2026-07-26')?.status).toBe('dayoff'); // Sunday
  });
});
