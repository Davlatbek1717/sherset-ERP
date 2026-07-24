import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrAttendanceNotifyService } from './hr-attendance-notify.service.js';

const ACC = '11111111-1111-1111-1111-111111111111';

function makePrisma() {
  return {
    client: {
      hrAttendanceNotifyConfig: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      hrTelegramOutbox: {
        create: vi.fn(),
      },
    },
  };
}

describe('HrAttendanceNotifyService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrAttendanceNotifyService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new HrAttendanceNotifyService(prisma as never);
  });

  it('getConfig returns an in-memory default (id=null) when none exists', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(null);
    const cfg = await svc.getConfig(ACC);
    expect(cfg.id).toBeNull();
    expect(cfg.enabled).toBe(false);
    expect(cfg.notifyCheckIn).toBe(true);
    expect(cfg.lateThresholdMin).toBe(15);
    expect(cfg.lateFineAmountMinor).toBe('0'); // BigInt serialized to string
  });

  it('getConfig serializes the stored BigInt amount to a string', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue({
      id: 'cfg-1',
      enabled: true,
      notifyCheckIn: true,
      notifyCheckOut: false,
      directorSlot: 3,
      lateFineEnabled: true,
      lateThresholdMin: 10,
      lateFineAmountMinor: 5000n,
      lateFinePerMinute: false,
    });
    const cfg = await svc.getConfig(ACC);
    expect(cfg.id).toBe('cfg-1');
    expect(cfg.directorSlot).toBe(3);
    expect(cfg.lateFineAmountMinor).toBe('5000');
  });

  it('upsert creates then updates the single per-account config', async () => {
    // First upsert → returns a created row.
    prisma.client.hrAttendanceNotifyConfig.upsert.mockResolvedValueOnce({
      id: 'cfg-1',
      enabled: true,
      notifyCheckIn: true,
      notifyCheckOut: true,
      directorSlot: null,
      lateFineEnabled: true,
      lateThresholdMin: 10,
      lateFineAmountMinor: 5000n,
      lateFinePerMinute: false,
    });
    const a = await svc.upsertConfig(ACC, {
      enabled: true,
      lateFineEnabled: true,
      lateThresholdMin: 10,
      lateFineAmountMinor: '5000',
    });
    expect(a.enabled).toBe(true);
    expect(a.lateFineAmountMinor).toBe('5000');

    // Second upsert → same id (no duplicate), threshold updated.
    prisma.client.hrAttendanceNotifyConfig.upsert.mockResolvedValueOnce({
      id: 'cfg-1',
      enabled: true,
      notifyCheckIn: true,
      notifyCheckOut: true,
      directorSlot: null,
      lateFineEnabled: true,
      lateThresholdMin: 20,
      lateFineAmountMinor: 5000n,
      lateFinePerMinute: false,
    });
    const b = await svc.upsertConfig(ACC, { lateThresholdMin: 20 });
    expect(b.lateThresholdMin).toBe(20);
    expect(b.id).toBe(a.id); // upsert, not duplicate

    // The upsert `where` targets accountId (single per account).
    const call = prisma.client.hrAttendanceNotifyConfig.upsert.mock.calls[0]?.[0] as {
      where: { accountId: string };
      create: { lateFineAmountMinor: bigint };
    };
    expect(call.where).toEqual({ accountId: ACC });
    expect(call.create.lateFineAmountMinor).toBe(5000n); // string → BigInt
  });

  it('upsert only writes fields present in the DTO (partial)', async () => {
    prisma.client.hrAttendanceNotifyConfig.upsert.mockResolvedValue({
      id: 'cfg-1',
      enabled: false,
      notifyCheckIn: true,
      notifyCheckOut: true,
      directorSlot: null,
      lateFineEnabled: false,
      lateThresholdMin: 15,
      lateFineAmountMinor: 0n,
      lateFinePerMinute: false,
    });
    await svc.upsertConfig(ACC, { notifyCheckOut: false });
    const call = prisma.client.hrAttendanceNotifyConfig.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update).toEqual({ notifyCheckOut: false });
  });

  it('sendTest without a director slot → ok:false, no outbox row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue({ directorSlot: null });
    const res = await svc.sendTest(ACC);
    expect(res).toEqual({ ok: false, reason: 'no_director_slot' });
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('sendTest with no config at all → ok:false', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(null);
    const res = await svc.sendTest(ACC);
    expect(res).toEqual({ ok: false, reason: 'no_director_slot' });
    expect(prisma.client.hrTelegramOutbox.create).not.toHaveBeenCalled();
  });

  it('sendTest with a director slot → enqueues one self test outbox row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue({ directorSlot: 3 });
    prisma.client.hrTelegramOutbox.create.mockResolvedValue({ id: 'o-1' });
    const res = await svc.sendTest(ACC);
    expect(res).toEqual({ ok: true });
    const arg = prisma.client.hrTelegramOutbox.create.mock.calls[0]?.[0] as {
      data: {
        accountId: string;
        toSelf: boolean;
        viaSlot: number;
        toPhone: null;
        status: string;
        sourceEventType: string;
        messageText: string;
      };
    };
    expect(arg.data).toMatchObject({
      accountId: ACC,
      toSelf: true,
      viaSlot: 3,
      toPhone: null,
      status: 'pending',
      sourceEventType: 'attendance.test',
    });
    expect(arg.data.messageText).toContain('Test');
  });
});
