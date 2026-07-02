import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrBonusFineService } from './hr-bonus-fine.service.js';

function makePrisma() {
  return {
    client: {
      hrBonusFineLog: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      employee: { findFirst: vi.fn() },
      $transaction: vi.fn(),
    },
  };
}

describe('HrBonusFineService.list', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineService(prisma as any);
    prisma.client.$transaction.mockResolvedValue([[], 0]);
  });

  it('scopes by accountId, orders desc', async () => {
    await svc.list('acc1', { page: 1, limit: 50 });
    const args = prisma.client.hrBonusFineLog.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: { createdAt: string };
    };
    expect(args.where).toEqual({ accountId: 'acc1' });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('applies kind + source + employee + date filters', async () => {
    const dateFrom = new Date('2026-05-01');
    const dateTo = new Date('2026-05-31');
    await svc.list('acc1', {
      page: 1,
      limit: 50,
      kind: 'fine',
      source: 'auto_expire_fine',
      employeeId: 'emp-1',
      dateFrom,
      dateTo,
    });
    const args = prisma.client.hrBonusFineLog.findMany.mock.calls[0]?.[0] as {
      where: { kind?: string; source?: string; employeeId?: string; createdAt?: unknown };
    };
    expect(args.where.kind).toBe('fine');
    expect(args.where.source).toBe('auto_expire_fine');
    expect(args.where.employeeId).toBe('emp-1');
    expect(args.where.createdAt).toEqual({ gte: dateFrom, lte: dateTo });
  });
});

describe('HrBonusFineService.createManual', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineService(prisma as any);
  });

  it('creates a manual bonus with source=manual + createdById=admin + name snapshot', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', name: 'Ali Valiyev' });
    prisma.client.hrBonusFineLog.create.mockResolvedValue({ id: 'bf-1' });

    await svc.createManual('acc1', 'admin-1', {
      employeeId: 'emp-1',
      kind: 'bonus',
      amountMinor: '500000',
      reason: 'Yaxshi ish',
    });

    const args = prisma.client.hrBonusFineLog.create.mock.calls[0]?.[0] as {
      data: {
        source: string;
        amountMinor: bigint;
        createdById: string;
        kind: string;
        reason: string;
        employeeName: string;
      };
    };
    expect(args.data.source).toBe('manual');
    expect(args.data.amountMinor).toBe(500_000n);
    expect(args.data.createdById).toBe('admin-1');
    expect(args.data.kind).toBe('bonus');
    expect(args.data.reason).toBe('Yaxshi ish');
    expect(args.data.employeeName).toBe('Ali Valiyev'); // §13.17 snapshot
  });

  it('rejects amount <= 0', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1' });
    await expect(
      svc.createManual('acc1', 'admin-1', {
        employeeId: 'emp-1',
        kind: 'fine',
        amountMinor: '0',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when employee not in account', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(
      svc.createManual('acc1', 'admin-1', {
        employeeId: 'ghost',
        kind: 'bonus',
        amountMinor: '1000',
      }),
    ).rejects.toThrow(/Xodim topilmadi/);
    expect(prisma.client.hrBonusFineLog.create).not.toHaveBeenCalled();
  });
});

describe('HrBonusFineService.remove', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineService(prisma as any);
  });

  it('deletes a manual row', async () => {
    prisma.client.hrBonusFineLog.findFirst.mockResolvedValue({ id: 'bf-1', source: 'manual' });
    prisma.client.hrBonusFineLog.delete.mockResolvedValue({});
    const result = await svc.remove('acc1', 'bf-1');
    expect(result).toEqual({ ok: true });
    expect(prisma.client.hrBonusFineLog.delete).toHaveBeenCalled();
  });

  it('refuses to delete an auto_* row (audit trail integrity)', async () => {
    prisma.client.hrBonusFineLog.findFirst.mockResolvedValue({
      id: 'bf-2',
      source: 'auto_task_reward',
    });
    await expect(svc.remove('acc1', 'bf-2')).rejects.toThrow(/auto yozuvlar audit/);
    expect(prisma.client.hrBonusFineLog.delete).not.toHaveBeenCalled();
  });

  it('throws when row not found', async () => {
    prisma.client.hrBonusFineLog.findFirst.mockResolvedValue(null);
    await expect(svc.remove('acc1', 'missing')).rejects.toThrow(/topilmadi/);
  });
});

describe('HrBonusFineService.aggregate', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrBonusFineService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrBonusFineService(prisma as any);
  });

  it('sums bonus, fine, net + groups by source (BigInt-safe strings)', async () => {
    prisma.client.hrBonusFineLog.findMany.mockResolvedValue([
      { kind: 'bonus', amountMinor: 500_000n, source: 'manual' },
      { kind: 'bonus', amountMinor: 1_000_000n, source: 'auto_task_reward' },
      { kind: 'fine', amountMinor: 300_000n, source: 'auto_task_fine' },
      { kind: 'fine', amountMinor: 200_000n, source: 'auto_expire_fine' },
    ]);

    const result = await svc.aggregate('acc1', {
      employeeId: 'emp-1',
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-31'),
    });

    expect(result.bonusMinor).toBe('1500000');
    expect(result.fineMinor).toBe('500000');
    expect(result.netMinor).toBe('1000000');
    expect(result.bySource.manual).toBe('500000');
    expect(result.bySource.auto_task_reward).toBe('1000000');
    expect(result.count).toBe(4);
  });

  it('empty period → all zeros', async () => {
    prisma.client.hrBonusFineLog.findMany.mockResolvedValue([]);
    const result = await svc.aggregate('acc1', {
      employeeId: 'emp-1',
      dateFrom: new Date('2026-05-01'),
      dateTo: new Date('2026-05-31'),
    });
    expect(result).toEqual({
      bonusMinor: '0',
      fineMinor: '0',
      netMinor: '0',
      bySource: {},
      count: 0,
    });
  });
});

describe('HrBonusFineService.aggregateRaw', () => {
  it('returns raw BigInt bonus + fine for the salary engine', async () => {
    const prisma = makePrisma();
    prisma.client.hrBonusFineLog.findMany.mockResolvedValue([
      { kind: 'bonus', amountMinor: 1_000n },
      { kind: 'fine', amountMinor: 400n },
    ]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrBonusFineService(prisma as any);
    const r = await svc.aggregateRaw('acc1', 'emp-1', new Date(), new Date());
    expect(r.bonusMinor).toBe(1_000n);
    expect(r.fineMinor).toBe(400n);
  });
});
