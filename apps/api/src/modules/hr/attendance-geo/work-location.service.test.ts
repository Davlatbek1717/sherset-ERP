import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HrWorkLocationService } from './work-location.service.js';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    client: {
      hrWorkLocation: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({ id: 'wl1', accountId: 'acc' }),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
        update: vi.fn().mockResolvedValue({ id: 'wl1', archived: true }),
        ...overrides,
      },
      employee: {
        count: vi.fn().mockResolvedValue(0),
      },
    },
  };
}

describe('HrWorkLocationService', () => {
  it('create applies radius default 150', async () => {
    const prisma = makePrisma();
    const svc = new HrWorkLocationService(prisma as never);
    await svc.create('acc', { name: 'Bosh ofis', lat: 41.3, lng: 69.2 });
    const arg = prisma.client.hrWorkLocation.create.mock.calls[0]?.[0] as {
      data: { accountId: string; radiusMeters: number };
    };
    expect(arg.data.accountId).toBe('acc');
    expect(arg.data.radiusMeters).toBe(150);
  });

  it('remove throws when employees are still assigned', async () => {
    const prisma = makePrisma();
    prisma.client.employee.count.mockResolvedValue(3);
    const svc = new HrWorkLocationService(prisma as never);
    await expect(svc.remove('acc', 'wl1')).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrWorkLocation.update).not.toHaveBeenCalled();
  });

  it('remove soft-archives when unassigned', async () => {
    const prisma = makePrisma();
    const svc = new HrWorkLocationService(prisma as never);
    const r = await svc.remove('acc', 'wl1');
    expect(r).toEqual({ ok: true });
    const arg = prisma.client.hrWorkLocation.update.mock.calls[0]?.[0] as {
      data: { archived: boolean };
    };
    expect(arg.data.archived).toBe(true);
  });

  it('list returns employeeCount from _count', async () => {
    const prisma = makePrisma();
    prisma.client.hrWorkLocation.findMany.mockResolvedValue([
      {
        id: 'wl1',
        name: 'A',
        lat: 1,
        lng: 2,
        radiusMeters: 150,
        archived: false,
        _count: { employees: 4 },
      },
    ]);
    const svc = new HrWorkLocationService(prisma as never);
    const rows = await svc.list('acc');
    expect(rows[0]?.employeeCount).toBe(4);
  });
});
