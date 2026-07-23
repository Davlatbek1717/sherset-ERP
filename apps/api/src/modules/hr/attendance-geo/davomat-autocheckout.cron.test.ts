import { describe, expect, it, vi } from 'vitest';
import { HrDavomatAutoCheckoutCron } from './davomat-autocheckout.cron.js';

function makePrisma(open: unknown[], sched: unknown = { endTime: '18:00', isDayOff: false }) {
  return {
    client: {
      hrAttendance: {
        findMany: vi.fn().mockResolvedValue(open),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      employeeWorkSchedule: {
        findUnique: vi.fn().mockResolvedValue(sched),
      },
    },
  };
}

describe('HrDavomatAutoCheckoutCron.runOnce', () => {
  it('closes an open record at schedule end with autoClosed=true', async () => {
    const prisma = makePrisma([
      { id: 'a1', employeeId: 'e1', checkInTime: new Date('2026-07-27T09:00:00+05:00') },
    ]);
    const now = new Date('2026-07-27T23:50:00+05:00');
    const res = await new HrDavomatAutoCheckoutCron(prisma as never).runOnce(now);

    expect(res.closed).toBe(1);
    const arg = prisma.client.hrAttendance.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; checkOutTime: null };
      data: { checkOutTime: Date; autoClosed: boolean };
    };
    expect(arg.data.autoClosed).toBe(true);
    // schedule end 18:00 Tashkent = 13:00Z
    expect(arg.data.checkOutTime.toISOString()).toBe('2026-07-27T13:00:00.000Z');
  });

  it('returns 0 when nothing is open', async () => {
    const prisma = makePrisma([]);
    const res = await new HrDavomatAutoCheckoutCron(prisma as never).runOnce(new Date());
    expect(res.closed).toBe(0);
    expect(prisma.client.hrAttendance.updateMany).not.toHaveBeenCalled();
  });
});
