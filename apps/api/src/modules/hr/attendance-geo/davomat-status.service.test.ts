import { describe, expect, it, vi } from 'vitest';
import { HrDavomatStatusService } from './davomat-status.service.js';

function makePrisma(today: unknown, optIn = true) {
  return {
    client: {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ attendanceOptIn: optIn, workLocation: null }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeWorkSchedule: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ startTime: '09:00', endTime: '18:00', isDayOff: false }),
      },
      hrAttendance: {
        findFirst: vi.fn().mockResolvedValue(today),
      },
    },
  };
}

describe('HrDavomatStatusService', () => {
  it('status at_work when open record', async () => {
    const prisma = makePrisma({
      checkInTime: new Date(),
      checkOutTime: null,
      lateMinutes: 0,
      source: 'auto_gps',
      autoClosed: false,
    });
    const r = await new HrDavomatStatusService(prisma as never).myToday('acc', 'emp');
    expect(r.status).toBe('at_work');
    expect(r.optIn).toBe(true);
  });

  it('status left when checked out', async () => {
    const prisma = makePrisma({
      checkInTime: new Date(),
      checkOutTime: new Date(),
      lateMinutes: 5,
      source: 'auto_gps',
      autoClosed: false,
    });
    const r = await new HrDavomatStatusService(prisma as never).myToday('acc', 'emp');
    expect(r.status).toBe('left');
  });

  it('status not_arrived when no record', async () => {
    const prisma = makePrisma(null);
    const r = await new HrDavomatStatusService(prisma as never).myToday('acc', 'emp');
    expect(r.status).toBe('not_arrived');
    expect(r.today).toBeNull();
  });

  it('setOptIn updates the employee flag', async () => {
    const prisma = makePrisma(null);
    const r = await new HrDavomatStatusService(prisma as never).setOptIn('acc', 'emp', true);
    expect(r).toEqual({ optIn: true });
    expect(prisma.client.employee.updateMany).toHaveBeenCalledWith({
      where: { id: 'emp', accountId: 'acc' },
      data: { attendanceOptIn: true },
    });
  });
});
