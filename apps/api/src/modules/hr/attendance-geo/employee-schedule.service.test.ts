import { describe, expect, it, vi } from 'vitest';
import { HrEmployeeScheduleService } from './employee-schedule.service.js';

function makePrisma(scheduleRows: unknown[] = []) {
  const tx = {
    employeeWorkSchedule: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return {
    tx,
    client: {
      employeeWorkSchedule: { findMany: vi.fn().mockResolvedValue(scheduleRows) },
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: 'e1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      hrWorkLocation: { findFirst: vi.fn().mockResolvedValue({ id: 'wl1' }) },
      $transaction: vi.fn().mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  };
}

describe('HrEmployeeScheduleService', () => {
  it('getWeek fills 7 rows with defaults for missing weekdays', async () => {
    const prisma = makePrisma([
      { weekday: 1, startTime: '10:00', endTime: '19:00', isDayOff: false },
    ]);
    const week = await new HrEmployeeScheduleService(prisma as never).getWeek('acc', 'e1');
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ weekday: 0, startTime: '09:00', endTime: '18:00', isDayOff: false });
    expect(week[1]).toEqual({ weekday: 1, startTime: '10:00', endTime: '19:00', isDayOff: false });
  });

  it('replaceWeek deletes then createMany inside a transaction', async () => {
    const prisma = makePrisma();
    const r = await new HrEmployeeScheduleService(prisma as never).replaceWeek('acc', 'e1', {
      days: [
        { weekday: 1, startTime: '09:00', endTime: '18:00', isDayOff: false },
        { weekday: 0, startTime: '00:00', endTime: '00:00', isDayOff: true },
      ],
    });
    expect(r.count).toBe(2);
    expect(prisma.tx.employeeWorkSchedule.deleteMany).toHaveBeenCalled();
    const arg = prisma.tx.employeeWorkSchedule.createMany.mock.calls[0]?.[0] as {
      data: { accountId: string; employeeId: string; weekday: number }[];
    };
    expect(arg.data).toHaveLength(2);
    expect(arg.data[0]).toMatchObject({ accountId: 'acc', employeeId: 'e1', weekday: 1 });
  });

  it('setConfig updates workLocationId + attendanceOptIn', async () => {
    const prisma = makePrisma();
    const r = await new HrEmployeeScheduleService(prisma as never).setConfig('acc', 'e1', {
      workLocationId: '11111111-1111-1111-1111-111111111111',
      attendanceOptIn: true,
    });
    expect(r.attendanceOptIn).toBe(true);
    expect(prisma.client.employee.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', accountId: 'acc' },
      data: {
        workLocationId: '11111111-1111-1111-1111-111111111111',
        attendanceOptIn: true,
      },
    });
  });
});
