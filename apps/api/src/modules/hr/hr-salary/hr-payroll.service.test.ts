import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrPayrollService } from './hr-payroll.service.js';

function makePrisma() {
  return {
    client: {
      employee: { findFirst: vi.fn(), findMany: vi.fn() },
      hrKpiDailyLog: { aggregate: vi.fn() },
      hrKpiMonthlyScore: { upsert: vi.fn(), findMany: vi.fn() },
    },
  };
}

function makeSalary(
  overrides: Partial<{
    monthlySalesTargetMinor: bigint;
    monthlyKpiBudgetMinor: bigint;
    commissionPercent: number;
  }> = {},
) {
  return {
    getResolved: vi.fn().mockResolvedValue({
      fixWeight: 0.7,
      kpiWeight: 0.2,
      bonusWeight: 0.1,
      monthlySalesTargetMinor: overrides.monthlySalesTargetMinor ?? 20_000_000_00n,
      monthlyKpiBudgetMinor: overrides.monthlyKpiBudgetMinor ?? 2_000_000_00n,
      commissionPercent: overrides.commissionPercent ?? 1.5,
      kpiTiers: [
        { min: 50, payout: 20 },
        { min: 75, payout: 50 },
        { min: 100, payout: 100 },
        { min: 120, payout: 130 },
      ],
    }),
  };
}

function makeBonusFine(bonus = 0n, fine = 0n) {
  return {
    aggregateRaw: vi.fn().mockResolvedValue({ bonusMinor: bonus, fineMinor: fine }),
  };
}

describe('HrPayrollService.computeMonthly', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let salary: ReturnType<typeof makeSalary>;
  let bonusFine: ReturnType<typeof makeBonusFine>;
  let svc: HrPayrollService;

  beforeEach(() => {
    prisma = makePrisma();
    salary = makeSalary();
    bonusFine = makeBonusFine();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrPayrollService(prisma as any, salary as any, bonusFine as any);
  });

  it('full formula: 100% achievement → KPI 100% + commission + base, no bonus/fine', async () => {
    // base salary 5M so'm, sales == target 20M → 100% achievement
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      salaryConfig: { baseSalaryMinor: '500000000' }, // 5M so'm = 500_000_000 tiyin
    });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({
      _sum: { personalSalesMinor: 20_000_000_00n },
    });
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((args: unknown) =>
      Promise.resolve((args as { create: unknown }).create),
    );

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const upsertArgs = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
      create: {
        totalSalesMinor: bigint;
        kpiEarnedMinor: bigint;
        commissionMinor: bigint;
        fixComponentMinor: bigint;
        finalSalaryMinor: bigint;
        tierPayoutPercent: { toString(): string };
        achievementPercent: { toString(): string };
      };
    };
    const c = upsertArgs.create;
    expect(c.totalSalesMinor).toBe(20_000_000_00n);
    expect(c.achievementPercent.toString()).toBe('100');
    expect(c.tierPayoutPercent.toString()).toBe('100');
    // KPI earned = 2M budget × 100% = 2M so'm
    expect(c.kpiEarnedMinor).toBe(2_000_000_00n);
    // commission = 20M × 1.5% = 300k so'm = 30_000_000 tiyin
    expect(c.commissionMinor).toBe(30_000_000n);
    expect(c.fixComponentMinor).toBe(500_000_000n);
    // final = 500_000_000 (fix) + 200_000_000 (kpi) + 0 − 0 + 30_000_000 = 730_000_000
    expect(c.finalSalaryMinor).toBe(730_000_000n);
  });

  it('50% achievement → tier 20% payout', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({
      _sum: { personalSalesMinor: 10_000_000_00n }, // half of 20M target
    });
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((args: unknown) =>
      Promise.resolve((args as { create: unknown }).create),
    );

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const c = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
      create: { tierPayoutPercent: { toString(): string }; kpiEarnedMinor: bigint };
    };
    expect(c.create.tierPayoutPercent.toString()).toBe('20');
    // 2M budget × 20% = 400k so'm = 40_000_000 tiyin
    expect(c.create.kpiEarnedMinor).toBe(40_000_000n);
  });

  it('bonus added, fine subtracted into final', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({
      _sum: { personalSalesMinor: 0n }, // no sales → 0 kpi, 0 commission
    });
    bonusFine.aggregateRaw.mockResolvedValue({
      bonusMinor: 300_000_00n,
      fineMinor: 100_000_00n,
    });
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((args: unknown) =>
      Promise.resolve((args as { create: unknown }).create),
    );

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const c = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
      create: { bonusSumMinor: bigint; fineSumMinor: bigint; finalSalaryMinor: bigint };
    };
    expect(c.create.bonusSumMinor).toBe(300_000_00n);
    expect(c.create.fineSumMinor).toBe(100_000_00n);
    // final = 0 + 0 + 30_000_000 − 10_000_000 + 0 = 20_000_000
    expect(c.create.finalSalaryMinor).toBe(20_000_000n);
  });

  it('zero sales → 0% achievement, 0% tier, 0 kpi, 0 commission', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({ _sum: { personalSalesMinor: null } });
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((args: unknown) =>
      Promise.resolve((args as { create: unknown }).create),
    );

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const c = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
      create: {
        totalSalesMinor: bigint;
        tierPayoutPercent: { toString(): string };
        kpiEarnedMinor: bigint;
        commissionMinor: bigint;
      };
    };
    expect(c.create.totalSalesMinor).toBe(0n);
    expect(c.create.tierPayoutPercent.toString()).toBe('0');
    expect(c.create.kpiEarnedMinor).toBe(0n);
    expect(c.create.commissionMinor).toBe(0n);
  });

  it('bonus/fine aggregate queried over the month window', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({ _sum: { personalSalesMinor: 0n } });
    prisma.client.hrKpiMonthlyScore.upsert.mockResolvedValue({});

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const args = bonusFine.aggregateRaw.mock.calls[0];
    expect(args?.[0]).toBe('acc1');
    expect(args?.[1]).toBe('emp-1');
    expect((args?.[2] as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    // endInclusive = endExclusive - 1ms
    expect((args?.[3] as Date).toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('throws when employee not in account', async () => {
    prisma.client.employee.findFirst.mockResolvedValue(null);
    await expect(svc.computeMonthly('acc1', 'ghost', '2026-05')).rejects.toThrow(/not found/);
  });

  it('upsert keyed by (accountId, employeeId, yearMonth) — idempotent recompute', async () => {
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({ _sum: { personalSalesMinor: 0n } });
    prisma.client.hrKpiMonthlyScore.upsert.mockResolvedValue({});

    await svc.computeMonthly('acc1', 'emp-1', '2026-05');

    const args = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
      where: {
        accountId_employeeId_yearMonth: {
          accountId: string;
          employeeId: string;
          yearMonth: string;
        };
      };
    };
    expect(args.where.accountId_employeeId_yearMonth).toEqual({
      accountId: 'acc1',
      employeeId: 'emp-1',
      yearMonth: '2026-05',
    });
  });
});

describe('HrPayrollService.computeMonthlyAll', () => {
  it('computes whole roster, isolates per-employee failure', async () => {
    const prisma = makePrisma();
    const salary = makeSalary();
    const bonusFine = makeBonusFine();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrPayrollService(prisma as any, salary as any, bonusFine as any);

    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }]);
    // computeMonthly internals: findFirst for each emp; make emp-2 fail
    prisma.client.employee.findFirst
      .mockResolvedValueOnce({ id: 'emp-1', salaryConfig: null })
      .mockResolvedValueOnce(null); // emp-2 → throws inside computeMonthly
    prisma.client.hrKpiDailyLog.aggregate.mockResolvedValue({ _sum: { personalSalesMinor: 0n } });
    prisma.client.hrKpiMonthlyScore.upsert.mockResolvedValue({});

    const result = await svc.computeMonthlyAll('acc1', '2026-05');
    expect(result.written).toBe(1); // only emp-1 succeeded
  });
});
