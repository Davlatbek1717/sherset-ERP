import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrAttendanceNotifier } from './attendance-notifier.service.js';

const ACC = 'acc-1';
const A = 'att-1';
const E = 'emp-1';

function makePrisma() {
  return {
    client: {
      hrAttendanceNotifyConfig: { findUnique: vi.fn().mockResolvedValue(null) },
      hrTelegramOutbox: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'o-1' }),
        count: vi.fn().mockResolvedValue(0),
      },
      employee: {
        findFirst: vi.fn().mockResolvedValue({
          name: 'Aziz Karimov',
          department: null,
          position: null,
          department2: { name: 'Sotuv' },
          position2: { name: 'Sotuvchi' },
        }),
      },
      hrAttendance: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
}

function makeLateFine(amount = 0n) {
  return { applyIfLate: vi.fn().mockResolvedValue(amount) };
}

function cfg(over: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: ACC,
    enabled: false,
    notifyCheckIn: true,
    notifyCheckOut: true,
    directorSlot: null,
    lateFineEnabled: false,
    lateThresholdMin: 15,
    lateFineAmountMinor: 0n,
    lateFinePerMinute: false,
    ...over,
  };
}

const checkedInEvt = {
  accountId: ACC,
  attendanceId: A,
  employeeId: E,
  at: new Date(),
  lateMinutes: 15,
};

describe('HrAttendanceNotifier.onCheckedIn', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let lateFine: ReturnType<typeof makeLateFine>;
  let notifier: HrAttendanceNotifier;

  beforeEach(() => {
    prisma = makePrisma();
    lateFine = makeLateFine();
    notifier = new HrAttendanceNotifier(prisma as never, lateFine as never);
  });

  it('disabled config → no outbox row, no throw', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(cfg({ enabled: false }));
    await notifier.onCheckedIn(checkedInEvt);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('enabled but no directorSlot → no outbox row (warn), no throw', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: null }),
    );
    await notifier.onCheckedIn(checkedInEvt);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('notifyCheckIn=false → no outbox row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3, notifyCheckIn: false }),
    );
    await notifier.onCheckedIn(checkedInEvt);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('enabled → applies fine + enqueues a self outbox row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3, lateFineEnabled: true }),
    );
    lateFine.applyIfLate.mockResolvedValue(10000n);

    await notifier.onCheckedIn(checkedInEvt);

    expect(lateFine.applyIfLate).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: ACC, attendanceId: A, employeeId: E, lateMinutes: 15 }),
    );
    const arg = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: {
        toSelf: boolean;
        viaSlot: number;
        toPhone: null;
        sourceEventType: string;
        sourceDocId: string;
        messageText: string;
        status: string;
      };
    };
    expect(arg.data).toMatchObject({
      toSelf: true,
      viaSlot: 3,
      toPhone: null,
      sourceEventType: 'attendance.check_in',
      sourceDocId: A,
      status: 'pending',
    });
    expect(arg.data.messageText).toContain('Keldi');
    expect(arg.data.messageText).toContain('Jarima');
    expect(arg.data.messageText).toContain('Sotuv · Sotuvchi');
  });

  it('dedup — an already-enqueued attendance skips a second enqueue', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3 }),
    );
    prisma.client.hrTelegramOutbox.findFirst.mockResolvedValue({ id: 'existing' });
    await notifier.onCheckedIn(checkedInEvt);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
    expect(lateFine.applyIfLate).not.toHaveBeenCalled();
  });

  it('handler never throws even if enqueue fails', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3 }),
    );
    prisma.client.hrTelegramOutbox.create.mockRejectedValue(new Error('db down'));
    await expect(notifier.onCheckedIn(checkedInEvt)).resolves.toBeUndefined();
  });
});

describe('HrAttendanceNotifier.onCheckedOut', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let lateFine: ReturnType<typeof makeLateFine>;
  let notifier: HrAttendanceNotifier;

  const outEvt = { accountId: ACC, attendanceId: A, employeeId: E, at: new Date() };

  beforeEach(() => {
    prisma = makePrisma();
    lateFine = makeLateFine();
    notifier = new HrAttendanceNotifier(prisma as never, lateFine as never);
  });

  it('enabled → enqueues a self check-out row with worked label', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3 }),
    );
    // One closed 8h50m segment today.
    prisma.client.hrAttendance.findMany.mockResolvedValue([
      {
        checkInTime: new Date('2026-07-25T09:00:00+05:00'),
        checkOutTime: new Date('2026-07-25T17:50:00+05:00'),
      },
    ]);

    await notifier.onCheckedOut(outEvt);

    const arg = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: { toSelf: boolean; viaSlot: number; sourceEventType: string; messageText: string };
    };
    expect(arg.data).toMatchObject({
      toSelf: true,
      viaSlot: 3,
      sourceEventType: 'attendance.check_out',
    });
    expect(arg.data.messageText).toContain('Ketdi');
    expect(arg.data.messageText).toContain('8s 50d');
  });

  it('notifyCheckOut=false → no outbox row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfg({ enabled: true, directorSlot: 3, notifyCheckOut: false }),
    );
    await notifier.onCheckedOut(outEvt);
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('handler never throws', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockRejectedValue(new Error('boom'));
    await expect(notifier.onCheckedOut(outEvt)).resolves.toBeUndefined();
  });
});
