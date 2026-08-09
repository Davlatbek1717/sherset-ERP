import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrAttendanceService } from './hr-attendance.service.js';

function makePrisma() {
  return {
    client: {
      hrAttendance: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      employee: {
        findFirst: vi.fn(),
      },
    },
  };
}

function makeEmitter() {
  return { emit: vi.fn() };
}

/** HR-3 — davomat tahriridan keyin avto-jarimani moslovchi bog'liqlik. */
function makeLateFine() {
  return { syncForAttendance: vi.fn().mockResolvedValue(0n) };
}

describe('HrAttendanceService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let emitter: ReturnType<typeof makeEmitter>;
  let lateFine: ReturnType<typeof makeLateFine>;
  let service: HrAttendanceService;

  beforeEach(() => {
    prisma = makePrisma();
    emitter = makeEmitter();
    lateFine = makeLateFine();
    service = new HrAttendanceService(prisma as never, emitter as never, lateFine as never);
  });

  it('checkIn: success creates a manual row and records lateMinutes', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue(null);
    // No named schedule, no weekday rows → shift not a workday → late 0.
    prisma.client.employee.findFirst.mockResolvedValue({
      schedule: null,
      workSchedules: [],
    } as never);
    prisma.client.hrAttendance.create.mockResolvedValue({ id: 'a1' } as never);

    await service.checkIn('acc1', { employeeId: '11111111-1111-1111-1111-111111111111' });

    const createCall = prisma.client.hrAttendance.create.mock.calls[0]?.[0] as {
      data: {
        accountId: string;
        employeeId: string;
        checkInTime: Date;
        source: string;
        lateMinutes: number;
      };
    };
    expect(createCall.data.accountId).toBe('acc1');
    expect(createCall.data.employeeId).toBe('11111111-1111-1111-1111-111111111111');
    expect(createCall.data.checkInTime).toBeInstanceOf(Date);
    expect(createCall.data.source).toBe('manual');
    expect(createCall.data.lateMinutes).toBe(0);
  });

  it('checkIn: emits HR_ATTENDANCE_CHECKED_IN with attendanceId + lateMinutes', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue(null);
    prisma.client.employee.findFirst.mockResolvedValue({
      schedule: null,
      workSchedules: [],
    } as never);
    prisma.client.hrAttendance.create.mockResolvedValue({ id: 'a1' } as never);

    const emp = '11111111-1111-1111-1111-111111111111';
    await service.checkIn('acc1', { employeeId: emp });

    expect(emitter.emit).toHaveBeenCalledWith(
      'hr.attendance.checked_in',
      expect.objectContaining({ accountId: 'acc1', employeeId: emp, attendanceId: 'a1' }),
    );
    const payload = emitter.emit.mock.calls[0]?.[1] as { lateMinutes: number; at: Date };
    expect(payload.lateMinutes).toBe(0);
    expect(payload.at).toBeInstanceOf(Date);
  });

  it('checkOutByEmployee: closes the open record atomically', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      checkInTime: new Date('2026-07-24T04:00:00Z'),
    } as never);
    prisma.client.hrAttendance.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await service.checkOutByEmployee('acc1', {
      employeeId: '11111111-1111-1111-1111-111111111111',
      at: new Date('2026-07-24T13:00:00Z'),
    });
    expect(res).toEqual({ ok: true });
    const call = prisma.client.hrAttendance.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; checkOutTime: null };
    };
    expect(call.where).toMatchObject({ id: 'a1', checkOutTime: null });
    expect(emitter.emit).toHaveBeenCalledWith(
      'hr.attendance.checked_out',
      expect.objectContaining({
        accountId: 'acc1',
        attendanceId: 'a1',
        employeeId: '11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('checkOutByEmployee: 400 when no open record', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue(null);
    await expect(
      service.checkOutByEmployee('acc1', { employeeId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrAttendance.updateMany).not.toHaveBeenCalled();
  });

  it('checkIn: fails when employee already checked in today (BadRequest)', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({ id: 'existing' } as never);

    await expect(
      service.checkIn('acc1', { employeeId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrAttendance.create).not.toHaveBeenCalled();
  });

  it('checkOut: success marks row + employee returned', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      checkOutTime: null,
    } as never);
    prisma.client.hrAttendance.update.mockResolvedValue({
      id: 'a1',
      checkOutTime: new Date(),
      employee: { id: 'e1', name: 'Ahmad' },
    } as never);

    const result = await service.checkOut('acc1', 'a1');

    expect(prisma.client.hrAttendance.update).toHaveBeenCalled();
    const updateCall = prisma.client.hrAttendance.update.mock.calls[0]?.[0] as {
      data: { checkOutTime: Date };
    };
    expect(updateCall.data.checkOutTime).toBeInstanceOf(Date);
    expect((result as { employee: { name: string } }).employee.name).toBe('Ahmad');
    expect(emitter.emit).toHaveBeenCalledWith(
      'hr.attendance.checked_out',
      expect.objectContaining({ accountId: 'acc1', attendanceId: 'a1' }),
    );
  });

  it('checkOut: fails when checkOutTime already set', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      checkOutTime: new Date(),
    } as never);

    await expect(service.checkOut('acc1', 'a1')).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrAttendance.update).not.toHaveBeenCalled();
  });

  it('checkOut: fails on missing row (NotFound)', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue(null);
    await expect(service.checkOut('acc1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('edit: setting clearCheckOut=true resets checkOutTime to null', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      checkInTime: new Date('2026-05-20T03:00:00Z'),
      checkOutTime: new Date('2026-05-20T12:00:00Z'),
    } as never);
    prisma.client.hrAttendance.update.mockResolvedValue({} as never);

    await service.edit('acc1', 'a1', 'editor1', { clearCheckOut: true });

    const updateCall = prisma.client.hrAttendance.update.mock.calls[0]?.[0] as {
      data: { checkOutTime: Date | null; editedById: string };
    };
    expect(updateCall.data.checkOutTime).toBeNull();
    expect(updateCall.data.editedById).toBe('editor1');
  });

  it('edit: fails when new checkOutTime is before checkInTime', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      checkInTime: new Date('2026-05-20T08:00:00Z'),
      checkOutTime: null,
    } as never);

    await expect(
      service.edit('acc1', 'a1', 'editor1', {
        checkOutTime: new Date('2026-05-20T06:00:00Z'),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrAttendance.update).not.toHaveBeenCalled();
  });

  it('delete: success removes row', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({ id: 'a1' } as never);
    prisma.client.hrAttendance.delete.mockResolvedValue({} as never);

    const result = await service.delete('acc1', 'a1');

    expect(prisma.client.hrAttendance.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(result).toEqual({ ok: true });
  });
});

/**
 * HR-3 — admin `checkInTime`ni tuzatganda `lateMinutes` QAYTA HISOBLANMAS va
 * avto-jarima eski summada qolib ketardi ⇒ oylikdan noto'g'ri pul ushlanardi.
 */
describe('HrAttendanceService.edit — kechikish qayta hisobi + jarima sinxroni (HR-3)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let lateFine: ReturnType<typeof makeLateFine>;
  let service: HrAttendanceService;

  /** Har kuni 09:00–18:00 hafta-kuni jadvali (nomli jadvalsiz xodim). */
  const WEEK_9_TO_18 = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    startTime: '09:00',
    endTime: '18:00',
    isDayOff: false,
  }));

  beforeEach(() => {
    prisma = makePrisma();
    lateFine = makeLateFine();
    service = new HrAttendanceService(
      prisma as never,
      { emit: vi.fn() } as never,
      lateFine as never,
    );
    prisma.client.employee.findFirst.mockResolvedValue({
      schedule: null,
      workSchedules: WEEK_9_TO_18,
    } as never);
    prisma.client.hrAttendance.update.mockResolvedValue({
      id: 'a1',
      employee: { id: 'emp-1', name: 'Aziz Karimov' },
    } as never);
  });

  function existing(checkInIso: string, lateMinutes: number) {
    prisma.client.hrAttendance.findFirst.mockResolvedValue({
      id: 'a1',
      employeeId: 'emp-1',
      checkInTime: new Date(checkInIso),
      checkOutTime: null,
      lateMinutes,
    } as never);
  }

  function updateData() {
    return (
      prisma.client.hrAttendance.update.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      }
    ).data;
  }

  it('kelish vaqti 10:00 → 09:00 ga tuzatildi: lateMinutes 60 → 0', async () => {
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T09:00:00+05:00'),
    });
    expect(updateData().lateMinutes).toBe(0);
  });

  it('kechikish qayta hisoblangach avto-jarima STORNO uchun sinxronlanadi', async () => {
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T09:00:00+05:00'),
    });
    expect(lateFine.syncForAttendance).toHaveBeenCalledWith({
      accountId: 'acc1',
      attendanceId: 'a1',
      employeeId: 'emp-1',
      employeeName: 'Aziz Karimov',
      lateMinutes: 0,
    });
  });

  it('kelish kechroqqa surildi: lateMinutes ortadi va jarima yangilanadi', async () => {
    existing('2026-05-20T09:30:00+05:00', 30);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T11:15:00+05:00'),
    });
    expect(updateData().lateMinutes).toBe(135);
    expect(lateFine.syncForAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ lateMinutes: 135 }),
    );
  });

  it('kelish vaqti TEGILMASA (faqat izoh) kechikish ham jarima ham tegilmaydi', async () => {
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', { notes: 'yangi izoh' });
    expect(updateData().lateMinutes).toBeUndefined();
    expect(lateFine.syncForAttendance).not.toHaveBeenCalled();
  });

  it('kechikish o`zgarmagan bo`lsa jarima bezovta qilinmaydi', async () => {
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T10:00:00+05:00'), // aynan o'sha vaqt
    });
    expect(lateFine.syncForAttendance).not.toHaveBeenCalled();
  });

  it('siklik jadval hisobga olinadi (hafta-kuni jadvali EMAS)', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({
      schedule: {
        type: 'flexible',
        startDate: new Date('2026-05-20T00:00:00.000Z'),
        cycleDays: 2,
        calcOvertime: false,
        extendedWorkMin: 0,
        days: [
          {
            dayIndex: 1,
            isWorkday: true,
            startTime: '08:00',
            endTime: '17:00',
            breakStart: null,
            breakEnd: null,
          },
          {
            dayIndex: 2,
            isWorkday: false,
            startTime: null,
            endTime: null,
            breakStart: null,
            breakEnd: null,
          },
        ],
      },
      workSchedules: WEEK_9_TO_18,
    } as never);
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T09:00:00+05:00'),
    });
    // Siklik Kun 1 = 08:00 ⇒ 09:00 kelish 60 daqiqa kech (hafta-kuni 09:00 bo'yicha 0 bo'lardi).
    expect(updateData().lateMinutes).toBe(60);
  });

  it("xodim topilmasa kechikish qayta hisoblanmaydi (tahrir baribir o'tadi)", async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null as never);
    existing('2026-05-20T10:00:00+05:00', 60);
    await service.edit('acc1', 'a1', 'editor1', {
      checkInTime: new Date('2026-05-20T09:00:00+05:00'),
    });
    expect(updateData().lateMinutes).toBeUndefined();
    expect(lateFine.syncForAttendance).not.toHaveBeenCalled();
  });
});
