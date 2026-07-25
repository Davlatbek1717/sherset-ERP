import { describe, expect, it, vi } from 'vitest';
import { AttendanceNotifyService, formatDailyDigestMessage } from './attendance-notify.service.js';

const NOW = new Date('2026-07-27T10:00:00+05:00');

describe('formatDailyDigestMessage', () => {
  it('lists arrived employees with time + late minutes, absent ones separately', () => {
    const msg = formatDailyDigestMessage({
      now: NOW,
      arrived: [
        { name: 'Otabek', checkInTime: new Date('2026-07-27T08:01:00+05:00'), lateMinutes: 1 },
        { name: 'Umid', checkInTime: new Date('2026-07-27T07:23:00+05:00'), lateMinutes: 0 },
      ],
      notYetArrived: [{ name: 'Aziz' }],
    });
    expect(msg).toContain('27-07-2026');
    expect(msg).toContain('🟢 Otabek — 08:01 (1 daqiqa kech)');
    expect(msg).toContain('🟢 Umid — 07:23');
    expect(msg).not.toContain('Umid — 07:23 (');
    expect(msg).toContain('🔴 Aziz — hali kelmadi');
  });

  it('reports no tracked employees today', () => {
    const msg = formatDailyDigestMessage({ now: NOW, arrived: [], notYetArrived: [] });
    expect(msg).toContain("Bugun kuzatiladigan xodim yo'q");
  });
});

function makePrisma() {
  return {
    client: {
      employee: { findMany: vi.fn().mockResolvedValue([]) },
      employeeWorkSchedule: { findUnique: vi.fn().mockResolvedValue(null) },
      hrAttendance: { findFirst: vi.fn().mockResolvedValue(null) },
      hrTelegramOutbox: { create: vi.fn().mockResolvedValue({ id: 'row1' }) },
    },
  };
}

describe('AttendanceNotifyService.sendDailyDigest', () => {
  it('groups opted-in employees by account and sends one digest per account', async () => {
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([
      { id: 'e1', accountId: 'acc1', name: 'Otabek' },
      { id: 'e2', accountId: 'acc1', name: 'Aziz' },
      { id: 'e3', accountId: 'acc2', name: 'Karim' },
    ]);
    prisma.client.hrAttendance.findFirst.mockImplementation(({ where }: never) =>
      Promise.resolve(
        (where as { employeeId: string }).employeeId === 'e1'
          ? { checkInTime: new Date('2026-07-27T08:01:00+05:00'), lateMinutes: 1 }
          : null,
      ),
    );

    await new AttendanceNotifyService(prisma as never).sendDailyDigest(NOW);

    expect(prisma.client.hrTelegramOutbox.create).toHaveBeenCalledTimes(2);
    const calls = prisma.client.hrTelegramOutbox.create.mock.calls.map((c: never[]) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'acc1',
            toSelf: true,
            viaSlot: 1,
            sourceEventType: 'hr.davomat_daily_digest',
            status: 'pending',
          }),
        }),
        expect.objectContaining({ data: expect.objectContaining({ accountId: 'acc2' }) }),
      ]),
    );
  });

  it('skips employees whose schedule marks today as a day off', async () => {
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([
      { id: 'e1', accountId: 'acc1', name: 'Otabek' },
    ]);
    prisma.client.employeeWorkSchedule.findUnique.mockResolvedValue({ isDayOff: true });

    await new AttendanceNotifyService(prisma as never).sendDailyDigest(NOW);

    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('sends nothing when there are no opted-in employees', async () => {
    const prisma = makePrisma();
    await new AttendanceNotifyService(prisma as never).sendDailyDigest(NOW);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it("one account's failure does not block another account's digest", async () => {
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([
      { id: 'e1', accountId: 'acc1', name: 'Otabek' },
      { id: 'e2', accountId: 'acc2', name: 'Karim' },
    ]);
    prisma.client.employeeWorkSchedule.findUnique.mockImplementation(({ where }: never) =>
      (where as { employeeId_weekday: { employeeId: string } }).employeeId_weekday.employeeId ===
      'e1'
        ? Promise.reject(new Error('db down'))
        : Promise.resolve(null),
    );

    await expect(
      new AttendanceNotifyService(prisma as never).sendDailyDigest(NOW),
    ).resolves.toBeUndefined();
    expect(prisma.client.hrTelegramOutbox.create).toHaveBeenCalledTimes(1);
    expect(prisma.client.hrTelegramOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: 'acc2' }) }),
    );
  });
});
