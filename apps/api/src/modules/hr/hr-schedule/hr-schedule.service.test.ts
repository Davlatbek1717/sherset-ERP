import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrScheduleService } from './hr-schedule.service.js';

function makePrisma() {
  const client = {
    hrSchedule: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    hrScheduleDay: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    employee: {
      count: vi.fn(),
    },
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(client);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return { client };
}

const flexInput = (over: Record<string, unknown> = {}) => ({
  name: 'Ofis',
  type: 'flexible' as const,
  startDate: '2026-07-24',
  cycleDays: 2,
  calcOvertime: false,
  extendedWorkMin: 240,
  days: [
    {
      dayIndex: 1,
      isWorkday: true,
      startTime: '09:00',
      endTime: '18:00',
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
  ...over,
});

const detailRow = () => ({
  id: 's1',
  name: 'Ofis',
  type: 'flexible',
  startDate: new Date('2026-07-24T00:00:00.000Z'),
  cycleDays: 2,
  calcOvertime: false,
  extendedWorkMin: 240,
  archived: false,
  _count: { employees: 0 },
  days: [],
});

describe('HrScheduleService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: HrScheduleService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new HrScheduleService(prisma as never);
  });

  it('list returns pagination shape with assignedCount + date-only startDate', async () => {
    prisma.client.hrSchedule.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'Ofis',
        type: 'flexible',
        startDate: new Date('2026-07-24T00:00:00.000Z'),
        cycleDays: 7,
        calcOvertime: false,
        extendedWorkMin: 240,
        archived: false,
        _count: { employees: 3 },
      },
    ] as never);
    prisma.client.hrSchedule.count.mockResolvedValue(1 as never);

    const res = await service.list('acc1', {
      archived: false,
      page: 1,
      limit: 10,
    } as never);

    expect(res.total).toBe(1);
    expect(res.rows[0]).toMatchObject({ id: 's1', startDate: '2026-07-24', assignedCount: 3 });
  });

  it('findOne throws NotFound for another account', async () => {
    prisma.client.hrSchedule.findFirst.mockResolvedValue(null);
    await expect(service.findOne('acc1', 'nope')).rejects.toThrow(NotFoundException);
  });

  it('create (flexible) persists day rows in the transaction', async () => {
    prisma.client.hrSchedule.create.mockResolvedValue({ id: 's1' } as never);
    prisma.client.hrSchedule.findFirst.mockResolvedValue(detailRow() as never);

    await service.create('acc1', flexInput() as never);

    expect(prisma.client.hrSchedule.create).toHaveBeenCalled();
    expect(prisma.client.hrScheduleDay.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          accountId: 'acc1',
          scheduleId: 's1',
          dayIndex: 1,
          isWorkday: true,
        }),
        expect.objectContaining({
          accountId: 'acc1',
          scheduleId: 's1',
          dayIndex: 2,
          isWorkday: false,
          startTime: null,
        }),
      ],
    });
  });

  it('create (free) normalises to cycleDays=1 and writes no day rows', async () => {
    prisma.client.hrSchedule.create.mockResolvedValue({ id: 's2' } as never);
    prisma.client.hrSchedule.findFirst.mockResolvedValue(detailRow() as never);

    await service.create('acc1', flexInput({ type: 'free' }) as never);

    expect(prisma.client.hrSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleDays: 1, type: 'free' }) }),
    );
    expect(prisma.client.hrScheduleDay.createMany).not.toHaveBeenCalled();
  });

  it('update replaces day rows (deleteMany then createMany)', async () => {
    prisma.client.hrSchedule.findFirst.mockResolvedValue(detailRow() as never);
    prisma.client.hrSchedule.update.mockResolvedValue({ id: 's1' } as never);

    await service.update('acc1', 's1', flexInput() as never);

    expect(prisma.client.hrScheduleDay.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'acc1', scheduleId: 's1' },
    });
    expect(prisma.client.hrScheduleDay.createMany).toHaveBeenCalled();
  });

  it('remove blocks when employees are assigned', async () => {
    prisma.client.hrSchedule.findFirst.mockResolvedValue({ id: 's1' } as never);
    prisma.client.employee.count.mockResolvedValue(2 as never);
    await expect(service.remove('acc1', 's1')).rejects.toThrow(BadRequestException);
    expect(prisma.client.hrSchedule.update).not.toHaveBeenCalled();
  });

  it('remove soft-deletes when unassigned', async () => {
    prisma.client.hrSchedule.findFirst.mockResolvedValue({ id: 's1' } as never);
    prisma.client.employee.count.mockResolvedValue(0 as never);
    prisma.client.hrSchedule.update.mockResolvedValue({ id: 's1', archived: true } as never);
    const res = await service.remove('acc1', 's1');
    expect(prisma.client.hrSchedule.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { archived: true },
    });
    expect(res).toEqual({ ok: true });
  });
});
