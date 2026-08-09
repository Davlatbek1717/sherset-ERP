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
      hrBonusFineLog: {
        create: vi.fn().mockResolvedValue({ id: 'bf-1' }),
        upsert: vi.fn().mockResolvedValue({ id: 'bf-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
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

/**
 * HR-3 — davomat TUZATILGANDA avto-jarima sinxron emas edi.
 *
 * `applyIfLate` faqat `create` qiladi va `(attendanceId, source)` unikal
 * indeksi tufayli QAYTA chaqirilganda jimgina eskisini qoldiradi. Admin
 * `checkInTime`ni to'g'rilaganda (masalan xodim aslida o'z vaqtida kelgan)
 * jarima o'z holicha qolib ketardi. `syncForAttendance` — reconsile:
 * kerak bo'lsa yozadi/yangilaydi, kerak bo'lmasa STORNO qiladi.
 */
describe('LateFineService.syncForAttendance (HR-3)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: LateFineService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new LateFineService(prisma as never);
  });

  it("kechikish yo'qoldi → mavjud auto_late jarima STORNO qilinadi", async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 15, lateFineAmountMinor: 10000n }),
    );
    expect(await svc.syncForAttendance({ ...base, lateMinutes: 0 })).toBe(0n);
    const del = prisma.client.hrBonusFineLog.deleteMany.mock.calls[0]?.[0] as {
      where: { attendanceId: string; source: string };
    };
    expect(del.where).toMatchObject({ attendanceId: 'att-1', source: 'auto_late' });
    expect(prisma.client.hrBonusFineLog.upsert).not.toHaveBeenCalled();
  });

  it('jarima o`chirib qo`yilgan bo`lsa ham eski qator STORNO qilinadi', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: false, lateFineAmountMinor: 10000n }),
    );
    expect(await svc.syncForAttendance({ ...base, lateMinutes: 99 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.deleteMany).toHaveBeenCalled();
  });

  it('kechikish o`zgardi → summa/sabab YANGILANADI (dublikat emas)', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({
        lateFineEnabled: true,
        lateThresholdMin: 0,
        lateFineAmountMinor: 500n,
        lateFinePerMinute: true,
      }),
    );
    expect(await svc.syncForAttendance({ ...base, lateMinutes: 12 })).toBe(6000n);

    const arg = prisma.client.hrBonusFineLog.upsert.mock.calls[0]?.[0] as {
      where: { uq_bonusfine_attendance_source: { attendanceId: string; source: string } };
      create: { amountMinor: bigint; source: string; kind: string };
      update: { amountMinor: bigint; reason: string };
    };
    expect(arg.where.uq_bonusfine_attendance_source).toMatchObject({
      attendanceId: 'att-1',
      source: 'auto_late',
    });
    expect(arg.create.amountMinor).toBe(6000n);
    expect(arg.create.kind).toBe('fine');
    expect(arg.update.amountMinor).toBe(6000n);
    expect(arg.update.reason).toContain('12');
    expect(prisma.client.hrBonusFineLog.deleteMany).not.toHaveBeenCalled();
  });

  it('chegaradan pastga tushdi → STORNO (jarima qolib ketmaydi)', async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(
      cfgRow({ lateFineEnabled: true, lateThresholdMin: 15, lateFineAmountMinor: 10000n }),
    );
    expect(await svc.syncForAttendance({ ...base, lateMinutes: 15 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.deleteMany).toHaveBeenCalled();
  });

  it("konfiguratsiya yo'q — storno baribir ishlaydi", async () => {
    prisma.client.hrAttendanceNotifyConfig.findUnique.mockResolvedValue(null);
    expect(await svc.syncForAttendance({ ...base, lateMinutes: 40 })).toBe(0n);
    expect(prisma.client.hrBonusFineLog.deleteMany).toHaveBeenCalled();
  });
});

/**
 * HR-13 (Faza Q7) — davomat qatori O'CHIRILGANDA jarima ham ketishi kerak.
 * `HrBonusFineLog.attendanceId` xom FK (relation/cascade YO'Q) ⇒ o'chirilgan
 * davomatning `auto_late` jarimasi hech kim ko'rmaydigan holda oylikdan pul
 * ushlab turaverardi.
 */
describe('LateFineService.stornoForAttendance (HR-13)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: LateFineService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new LateFineService(prisma as never);
  });

  it('faqat auto_late qatorini o`chiradi (qo`lda kiritilgan jarima tegilmaydi)', async () => {
    await svc.stornoForAttendance(ACC, 'att-1');
    const del = prisma.client.hrBonusFineLog.deleteMany.mock.calls[0]?.[0] as {
      where: { accountId: string; attendanceId: string; source: string };
    };
    expect(del.where).toMatchObject({
      accountId: ACC,
      attendanceId: 'att-1',
      source: 'auto_late',
    });
  });

  it('konfiguratsiyani umuman o`qimaydi — storno shartsiz', async () => {
    await svc.stornoForAttendance(ACC, 'att-1');
    expect(prisma.client.hrAttendanceNotifyConfig.findUnique).not.toHaveBeenCalled();
    expect(prisma.client.hrBonusFineLog.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('qator bo`lmasa ham xato bermaydi (idempotent)', async () => {
    prisma.client.hrBonusFineLog.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(svc.stornoForAttendance(ACC, 'att-1')).resolves.toBeUndefined();
  });
});
