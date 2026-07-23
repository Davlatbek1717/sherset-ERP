import { describe, expect, it, vi } from 'vitest';
import { HrDavomatReportService } from './davomat-report.service.js';

// all-workday week so the attended date is a work day regardless of calendar
const week = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startTime: '09:00',
  endTime: '18:00',
  isDayOff: false,
}));

describe('HrDavomatReportService.monthly', () => {
  it('aggregates a past month per employee via computeMonthlyAttendance', async () => {
    const prisma = {
      client: {
        employee: {
          findMany: vi.fn().mockResolvedValue([{ id: 'e1', name: 'Ali', workSchedules: week }]),
        },
        hrAttendance: {
          findMany: vi.fn().mockResolvedValue([
            {
              checkInTime: new Date('2026-06-15T09:20:00+05:00'),
              checkOutTime: new Date('2026-06-15T18:00:00+05:00'),
              lateMinutes: 20,
            },
          ]),
        },
      },
    };
    const svc = new HrDavomatReportService(prisma as never);
    const r = await svc.monthly('acc', { yearMonth: '2026-06' });

    expect(r.employees).toHaveLength(1);
    expect(r.employees[0]?.name).toBe('Ali');
    expect(r.employees[0]?.rows).toHaveLength(30); // June has 30 days
    expect(r.employees[0]?.lateMinutesTotal).toBe(20);
    expect(r.employees[0]?.lateDays).toBe(1);
  });
});
