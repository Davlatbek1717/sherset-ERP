import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrDepartmentService } from './hr-department.service.js';

function makePrisma() {
  return {
    client: {
      hrDepartment: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      employee: {
        groupBy: vi.fn(),
        count: vi.fn(),
      },
    },
  };
}

describe('HrDepartmentService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrDepartmentService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrDepartmentService(prisma as never);
  });

  it('list returns active rows with employeeCount joined by name string', async () => {
    prisma.client.hrDepartment.findMany.mockResolvedValue([
      { id: 'd1', name: 'Sotuv', archived: false },
      { id: 'd2', name: 'IT', archived: false },
    ] as never);
    prisma.client.employee.groupBy.mockResolvedValue([
      { department: 'Sotuv', _count: { _all: 3 } },
    ] as never);

    const rows = await service.list('acc1');

    expect(prisma.client.hrDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc1', archived: false } }),
    );
    expect(rows).toEqual([
      { id: 'd1', name: 'Sotuv', archived: false, employeeCount: 3 },
      { id: 'd2', name: 'IT', archived: false, employeeCount: 0 },
    ]);
  });

  it('list with includeArchived drops the archived filter', async () => {
    prisma.client.hrDepartment.findMany.mockResolvedValue([] as never);
    prisma.client.employee.groupBy.mockResolvedValue([] as never);
    await service.list('acc1', true);
    expect(prisma.client.hrDepartment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc1' } }),
    );
  });

  it('create fails when an active name already exists', async () => {
    prisma.client.hrDepartment.findFirst.mockResolvedValue({ id: 'd1' } as never);
    await expect(service.create('acc1', { name: 'Sotuv' })).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrDepartment.create).not.toHaveBeenCalled();
  });

  it('create succeeds when name is free', async () => {
    prisma.client.hrDepartment.findFirst.mockResolvedValue(null);
    prisma.client.hrDepartment.create.mockResolvedValue({ id: 'd9', name: 'Marketing' } as never);
    await service.create('acc1', { name: 'Marketing' });
    expect(prisma.client.hrDepartment.create).toHaveBeenCalledWith({
      data: { accountId: 'acc1', name: 'Marketing' },
    });
  });

  it('remove blocks when active employees still carry the name', async () => {
    prisma.client.hrDepartment.findFirst.mockResolvedValue({ id: 'd1', name: 'Sotuv' } as never);
    prisma.client.employee.count.mockResolvedValue(2 as never);
    await expect(service.remove('acc1', 'd1')).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrDepartment.update).not.toHaveBeenCalled();
  });

  it('remove soft-deletes (archived=true) when no employee carries the name', async () => {
    prisma.client.hrDepartment.findFirst.mockResolvedValue({ id: 'd1', name: 'Sotuv' } as never);
    prisma.client.employee.count.mockResolvedValue(0 as never);
    prisma.client.hrDepartment.update.mockResolvedValue({ id: 'd1', archived: true } as never);
    const res = await service.remove('acc1', 'd1');
    expect(prisma.client.hrDepartment.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { archived: true },
    });
    expect(res).toEqual({ ok: true });
  });

  it('update throws NotFound for a row in another account', async () => {
    prisma.client.hrDepartment.findFirst.mockResolvedValue(null);
    await expect(service.update('acc1', 'other', { name: 'X' })).rejects.toThrow(NotFoundException);
  });
});
