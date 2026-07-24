import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrPositionService } from './hr-position.service.js';

function makePrisma() {
  return {
    client: {
      hrPosition: {
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

describe('HrPositionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrPositionService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrPositionService(prisma as never);
  });

  it('list joins employeeCount by position name string', async () => {
    prisma.client.hrPosition.findMany.mockResolvedValue([
      { id: 'p1', name: 'Backend Dasturchi', archived: false },
    ] as never);
    prisma.client.employee.groupBy.mockResolvedValue([
      { position: 'Backend Dasturchi', _count: { _all: 4 } },
    ] as never);
    const rows = await service.list('acc1');
    expect(rows).toEqual([
      { id: 'p1', name: 'Backend Dasturchi', archived: false, employeeCount: 4 },
    ]);
  });

  it('findOne returns the row for the account', async () => {
    prisma.client.hrPosition.findFirst.mockResolvedValue({
      id: 'p1',
      name: 'Operator',
      archived: false,
    } as never);
    const res = await service.findOne('acc1', 'p1');
    expect(res).toEqual({ id: 'p1', name: 'Operator', archived: false });
  });

  it('findOne throws NotFound for a foreign/absent id', async () => {
    prisma.client.hrPosition.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('create fails on duplicate active name', async () => {
    prisma.client.hrPosition.findFirst.mockResolvedValue({ id: 'p1' } as never);
    await expect(service.create('acc1', { name: 'Operator' })).rejects.toThrow(BadRequestException);
  });

  it('remove blocks when active employees hold the position', async () => {
    prisma.client.hrPosition.findFirst.mockResolvedValue({ id: 'p1', name: 'Operator' } as never);
    prisma.client.employee.count.mockResolvedValue(1 as never);
    await expect(service.remove('acc1', 'p1')).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrPosition.update).not.toHaveBeenCalled();
  });

  it('remove soft-deletes when the position is unused', async () => {
    prisma.client.hrPosition.findFirst.mockResolvedValue({ id: 'p1', name: 'Operator' } as never);
    prisma.client.employee.count.mockResolvedValue(0 as never);
    prisma.client.hrPosition.update.mockResolvedValue({ id: 'p1', archived: true } as never);
    const res = await service.remove('acc1', 'p1');
    expect(prisma.client.hrPosition.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { archived: true },
    });
    expect(res).toEqual({ ok: true });
  });
});
