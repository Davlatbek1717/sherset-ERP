import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrKpiService } from './hr-kpi.service.js';

function makePrisma() {
  return {
    client: {
      employee: { findMany: vi.fn() },
      demand: { groupBy: vi.fn() },
      hrKpiDailyLog: { upsert: vi.fn(), findMany: vi.fn() },
      account: { findMany: vi.fn() },
    },
  };
}

function makeSalary(overrides: Partial<{ monthlySalesTargetMinor: bigint }> = {}) {
  return {
    getResolved: vi.fn().mockResolvedValue({
      fixWeight: 0.7,
      kpiWeight: 0.2,
      bonusWeight: 0.1,
      monthlySalesTargetMinor: overrides.monthlySalesTargetMinor ?? 30_000_000_00n,
      monthlyKpiBudgetMinor: 2_000_000_00n,
      commissionPercent: 1.5,
      kpiTiers: [{ min: 50, payout: 20 }],
    }),
  };
}

describe('HrKpiService.snapshotDay', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let salary: ReturnType<typeof makeSalary>;
  let svc: HrKpiService;

  beforeEach(() => {
    prisma = makePrisma();
    // 31-day month target 31M so'm → daily target = 1M so'm (100_000_000 tiyin)
    salary = makeSalary({ monthlySalesTargetMinor: 31_000_000_00n });
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrKpiService(prisma as any, salary as any);
  });

  it('upserts one row per employee with personal sales + achievement', async () => {
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }]);
    prisma.client.demand.groupBy.mockResolvedValue([
      { ownerId: 'emp-1', _sum: { sumMinor: 1_000_000_00n } }, // hit daily target exactly
    ]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    // March 2026 = 31 days → daily target = 31M/31 = 1M so'm = 100_000_000 tiyin
    const result = await svc.snapshotDay('acc1', new Date('2026-03-15T12:00:00Z'));

    expect(result.written).toBe(2);
    expect(prisma.client.hrKpiDailyLog.upsert).toHaveBeenCalledTimes(2);

    // emp-1: 1M sales vs 1M target → 100% achievement
    const emp1Call = prisma.client.hrKpiDailyLog.upsert.mock.calls.find(
      (c) => (c[0] as { create: { employeeId: string } }).create.employeeId === 'emp-1',
    )?.[0] as {
      create: { personalSalesMinor: bigint; achievementPercent: { toString(): string } };
    };
    expect(emp1Call.create.personalSalesMinor).toBe(1_000_000_00n);
    expect(emp1Call.create.achievementPercent.toString()).toBe('100');
  });

  it('employee with no sales → 0 personal sales + 0% achievement', async () => {
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-zero' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    await svc.snapshotDay('acc1', new Date('2026-03-15T12:00:00Z'));

    const call = prisma.client.hrKpiDailyLog.upsert.mock.calls[0]?.[0] as {
      create: { personalSalesMinor: bigint; achievementPercent: { toString(): string } };
    };
    expect(call.create.personalSalesMinor).toBe(0n);
    expect(call.create.achievementPercent.toString()).toBe('0');
  });

  it('groupBy filters posted demands owned within the local day window', async () => {
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    await svc.snapshotDay('acc1', new Date('2026-03-15T12:00:00Z'));

    const groupArgs = prisma.client.demand.groupBy.mock.calls[0]?.[0] as {
      where: { accountId: string; state: string; ownerId: unknown; postedAt: unknown };
      _sum: { sumMinor: boolean };
    };
    expect(groupArgs.where.accountId).toBe('acc1');
    expect(groupArgs.where.state).toBe('posted');
    expect(groupArgs.where.ownerId).toEqual({ not: null });
    expect(groupArgs._sum).toEqual({ sumMinor: true });
  });

  it('upsert keyed by (accountId, employeeId, date) for idempotent re-run', async () => {
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    await svc.snapshotDay('acc1', new Date('2026-03-15T12:00:00Z'));

    const call = prisma.client.hrKpiDailyLog.upsert.mock.calls[0]?.[0] as {
      where: { accountId_employeeId_date: { accountId: string; employeeId: string; date: Date } };
    };
    expect(call.where.accountId_employeeId_date.accountId).toBe('acc1');
    expect(call.where.accountId_employeeId_date.employeeId).toBe('emp-1');
    expect(call.where.accountId_employeeId_date.date).toBeInstanceOf(Date);
  });
});

describe('HrKpiService.snapshotAllAccountsToday', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let salary: ReturnType<typeof makeSalary>;
  let svc: HrKpiService;

  beforeEach(() => {
    prisma = makePrisma();
    salary = makeSalary();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrKpiService(prisma as any, salary as any);
  });

  it('sweeps all accounts, sums rows', async () => {
    prisma.client.account.findMany.mockResolvedValue([{ id: 'acc1' }, { id: 'acc2' }]);
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    const result = await svc.snapshotAllAccountsToday();
    expect(result.accounts).toBe(2);
    expect(result.rows).toBe(2); // 1 employee × 2 accounts
  });

  it('one account failure is isolated — sweep continues', async () => {
    prisma.client.account.findMany.mockResolvedValue([{ id: 'acc-bad' }, { id: 'acc-good' }]);
    prisma.client.employee.findMany
      .mockRejectedValueOnce(new Error('db blip')) // acc-bad
      .mockResolvedValueOnce([{ id: 'emp-1' }]); // acc-good
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});

    const result = await svc.snapshotAllAccountsToday();
    expect(result.accounts).toBe(1); // only acc-good succeeded
    expect(result.rows).toBe(1);
  });
});
