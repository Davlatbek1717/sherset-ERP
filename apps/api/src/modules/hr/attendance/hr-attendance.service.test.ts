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
        delete: vi.fn(),
      },
    },
  };
}

describe('HrAttendanceService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrAttendanceService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrAttendanceService(prisma as never);
  });

  it('checkIn: success creates row with current timestamp', async () => {
    prisma.client.hrAttendance.findFirst.mockResolvedValue(null);
    prisma.client.hrAttendance.create.mockResolvedValue({ id: 'a1' } as never);

    await service.checkIn('acc1', { employeeId: '11111111-1111-1111-1111-111111111111' });

    const createCall = prisma.client.hrAttendance.create.mock.calls[0]?.[0] as {
      data: { accountId: string; employeeId: string; checkInTime: Date; notes?: string };
    };
    expect(createCall.data.accountId).toBe('acc1');
    expect(createCall.data.employeeId).toBe('11111111-1111-1111-1111-111111111111');
    expect(createCall.data.checkInTime).toBeInstanceOf(Date);
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
