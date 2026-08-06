import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrPayrollService } from './hr-payroll.service.js';

function makePrisma() {
  return {
    client: {
      employee: { findFirst: vi.fn(), findMany: vi.fn() },
      // 4M.3: oylik manbai `HrKpiDailyLog` dan QABUL omboriga ko'chdi.
      employeeDailyKpi: { findMany: vi.fn() },
      // §3.4: eskirgan kunlar tuzatmasi oylikka alohida qator bo`lib kiradi.
      // Standart — TUZATMASIZ oy: mavjud testlar formulaning asosiy qismini
      // tekshiradi, tuzatma esa o`z testida beriladi.
      employeeKpiCorrection: { findMany: vi.fn().mockResolvedValue([]) },
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

/**
 * Qabul omboridan keladigan kunlar. Sukut bo'yicha HAMMASI qabul qilingan —
 * eski testlar «sotuv shuncha edi» degan taxminni saqlab qolsin.
 */
function acceptedDay(salesMinor: bigint, state = 'accepted') {
  return { state, metrics: [{ autoValue: salesMinor, adjustValue: null }] };
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
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(20_000_000_00n)]);
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
    // half of 20M target
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(10_000_000_00n)]);
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
    // no sales → 0 kpi, 0 commission
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(0n)]);
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
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([]); // kun umuman yo'q
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
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(0n)]);
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
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(0n)]);
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
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([acceptedDay(0n)]);
    prisma.client.hrKpiMonthlyScore.upsert.mockResolvedValue({});

    const result = await svc.computeMonthlyAll('acc1', '2026-05');
    expect(result.written).toBe(1); // only emp-1 succeeded
  });
});

describe('4M.3 — QABUL → OYLIK bloklash (M-Q8)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrPayrollService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.client.employee.findFirst.mockResolvedValue({ id: 'emp-1', salaryConfig: null });
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((args: unknown) =>
      Promise.resolve((args as { create: unknown }).create),
    );
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrPayrollService(prisma as any, makeSalary() as any, makeBonusFine() as any);
  });

  const created = () =>
    (
      prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0] as {
        create: {
          totalSalesMinor: bigint;
          acceptedDays: number;
          pendingDays: number;
          blockedSalesMinor: bigint;
        };
      }
    ).create;

  it('qabul QILINMAGAN kunning sotuvi oylikka kirmaydi', async () => {
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([
      acceptedDay(5_000_000_00n),
      acceptedDay(15_000_000_00n, 'pending'),
    ]);
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    const c = created();
    // 20M ning faqat 5M i qabul qilingan.
    expect(c.totalSalesMinor).toBe(5_000_000_00n);
    expect(c.blockedSalesMinor).toBe(15_000_000_00n);
    expect(c.acceptedDays).toBe(1);
    expect(c.pendingDays).toBe(1);
  });

  it('bloklangan summa YASHIRILMAYDI — ustunga yoziladi', async () => {
    // «Nega oylik kam» degan savolga javob shu ustunda; aks holda blok
    // sabab-noma'lum kamayish bo'lib ko'rinardi.
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([
      acceptedDay(1_000n, 'rejected'),
      acceptedDay(2_000n, 'escalated'),
    ]);
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    expect(created().blockedSalesMinor).toBe(3_000n);
    expect(created().totalSalesMinor).toBe(0n);
  });

  it('majburiy yopilgan kun TO`LANADI (xodim oyliksiz qolmaydi)', async () => {
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([
      acceptedDay(7_000_000_00n, 'force_accepted'),
    ]);
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    expect(created().totalSalesMinor).toBe(7_000_000_00n);
    expect(created().acceptedDays).toBe(1);
  });

  it('menejer tuzatmasi to`lanadigan raqam bo`ladi (M-Q3)', async () => {
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([
      { state: 'accepted', metrics: [{ autoValue: 1_000n, adjustValue: 9_000n }] },
    ]);
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    expect(created().totalSalesMinor).toBe(9_000n);
  });

  it('sotuv ko`rsatkichi bo`yicha FILTRLANADI (boshqa metrikalar qo`shilmaydi)', async () => {
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    const where = prisma.client.employeeDailyKpi.findMany.mock.calls[0]?.[0] as {
      select: { metrics: { where: { metricKey: string } } };
    };
    // Kassa tushumi yoki kechikish daqiqasi oylik sotuviga qo'shilib ketmasin.
    expect(where.select.metrics.where.metricKey).toBe('sales_revenue');
  });

  it('oy chegarasi bo`yicha so`raladi (qo`shni oy kunlari kirmaydi)', async () => {
    await svc.computeMonthly('acc1', 'emp-1', '2026-05');
    const args = prisma.client.employeeDailyKpi.findMany.mock.calls[0]?.[0] as {
      where: { date: { gte: Date; lt: Date } };
    };
    expect(args.where.date.gte.toISOString().slice(0, 10)).toBe('2026-05-01');
    expect(args.where.date.lt.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});

describe('§3.4 — eskirgan kunlar tuzatmasi oylikka kiradi', () => {
  it('sof tuzatma yakuniy summaga qo`shiladi', async () => {
    const prisma = makePrisma();
    const salary = makeSalary();
    const bonusFine = makeBonusFine();
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      salaryConfig: { baseSalaryMinor: '0' },
    });
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([]);
    // Iyulda ortiqcha to'langan 60 000 avgustda ushlanadi.
    prisma.client.employeeKpiCorrection.findMany.mockResolvedValue([
      { diffMinor: -60_000n, direction: 'decrease' },
    ]);
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((a: unknown) => a);

    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrPayrollService(prisma as any, salary as any, bonusFine as any);
    await svc.computeMonthly('acc1', 'emp-1', '2026-08');

    const arg = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0];
    expect(arg.create.correctionDecreaseMinor).toBe(60_000n);
    expect(arg.create.correctionIncreaseMinor).toBe(0n);
    // Yakuniy summa AYNAN shuncha kamayadi.
    expect(arg.create.finalSalaryMinor).toBe(-60_000n);
  });

  it('tuzatma DAVR bo`yicha o`qiladi (kun sanasi bo`yicha emas)', async () => {
    const prisma = makePrisma();
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      salaryConfig: {},
    });
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([]);
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((a: unknown) => a);

    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrPayrollService(prisma as any, makeSalary() as any, makeBonusFine() as any);
    await svc.computeMonthly('acc1', 'emp-1', '2026-08');

    const where = prisma.client.employeeKpiCorrection.findMany.mock.calls[0]?.[0]?.where;
    expect(where.period).toBe('2026-08');
    expect(where.employeeId).toBe('emp-1');
  });

  it('tuzatmasiz oyda summa o`zgarmaydi', async () => {
    const prisma = makePrisma();
    prisma.client.employee.findFirst.mockResolvedValue({
      id: 'emp-1',
      salaryConfig: { baseSalaryMinor: '100000' },
    });
    prisma.client.employeeDailyKpi.findMany.mockResolvedValue([]);
    prisma.client.hrKpiMonthlyScore.upsert.mockImplementation((a: unknown) => a);

    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrPayrollService(prisma as any, makeSalary() as any, makeBonusFine() as any);
    await svc.computeMonthly('acc1', 'emp-1', '2026-08');

    const arg = prisma.client.hrKpiMonthlyScore.upsert.mock.calls[0]?.[0];
    expect(arg.create.correctionIncreaseMinor).toBe(0n);
    expect(arg.create.correctionDecreaseMinor).toBe(0n);
    expect(arg.create.finalSalaryMinor).toBe(100_000n);
  });
});
