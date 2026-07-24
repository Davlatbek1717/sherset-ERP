import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LateFineService } from './late-fine.service.js';

const ACC = 'acc-1';
const base = {
  accountId: ACC,
  attendanceId: 'att-1',
  employeeId: 'emp-1',
  employeeName: 'Aziz Karimov',
};

function makePrisma() {
  return {
    client: {
      hrAttendanceNotifyConfig: { findUnique: vi.fn() },
      hrBonusFineLog: { create: vi.fn().mockResolvedValue({ id: 'bf-1' }) },
    },
  };
}

/** Builds a config row with sane defaults, overridable per test. */
function cfgRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: ACC,
    lateFineEnabled: false,
    lateThresholdMin: 15,
    lateFineAmountMinor: 0n,
    lateFinePerMinute: false,
    ...over,
  };
}

describe('LateFineService.applyIfLate', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: LateFineService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new LateFineService(prisma as never);
  });

  it('no config → 0, no ledger row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(null);
    expect(await svc.applyIfLate({ ...base, lateMinutes: 30 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });

  it('fine disabled → 0, no ledger row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: false, lateFineAmountMinor: 10000n }),
    );
    expect(await svc.applyIfLate({ ...base, lateMinutes: 30 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });

  it('late within threshold → 0 (no fine)', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 15, lateFineAmountMinor: 10000n }),
    );
    // 15 is not > 15 → no fine.
    expect(await svc.applyIfLate({ ...base, lateMinutes: 15 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });

  it('flat fine when late > threshold', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({
        lateFineEnabled: true,
        lateThresholdMin: 15,
        lateFineAmountMinor: 10000n,
        lateFinePerMinute: false,
      }),
    );
    expect(await svc.applyIfLate({ ...base, lateMinutes: 20 })).toBe(10000n);
    const arg = prisma.client.hrBonusFineLog.create.mock.calls[0]?.[0] as {
      data: {
        kind: string;
        source: string;
        amountMinor: bigint;
        attendanceId: string;
        employeeName: string;
        reason: string;
      };
    };
    expect(arg.data.kind).toBe('fine');
    expect(arg.data.source).toBe('auto_late');
    expect(arg.data.amountMinor).toBe(10000n);
    expect(arg.data.attendanceId).toBe('att-1');
    expect(arg.data.employeeName).toBe('Aziz Karimov');
    expect(arg.data.reason).toContain('20');
  });

  it('per-minute fine = amount * lateMinutes', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({
        lateFineEnabled: true,
        lateThresholdMin: 0,
        lateFineAmountMinor: 500n,
        lateFinePerMinute: true,
      }),
    );
    expect(await svc.applyIfLate({ ...base, lateMinutes: 12 })).toBe(6000n);
  });

  it('amount resolves to 0 → no ledger row', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 0, lateFineAmountMinor: 0n }),
    );
    expect(await svc.applyIfLate({ ...base, lateMinutes: 5 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });

  it('idempotent — a unique-violation (P2002) returns the amount without throwing', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 0, lateFineAmountMinor: 1000n }),
    );
    prisma.client.hrBonusFineLog.create.mockRejectedValueOnce({ code: 'P2002' });
    expect(await svc.applyIfLate({ ...base, lateMinutes: 5 })).toBe(1000n);
  });

  it('rethrows non-unique DB errors', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 0, lateFineAmountMinor: 1000n }),
    );
    prisma.client.hrBonusFineLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.applyIfLate({ ...base, lateMinutes: 5 })).rejects.toThrow('db down');
  });
});
