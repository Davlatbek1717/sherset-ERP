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

describe('kun YORLIG`I — mahalliy sana (4M.3 da tuzatilgan off-by-one)', () => {
  function harness() {
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrKpiService(prisma as any, makeSalary() as any);
    return { svc, upsert: prisma.client.hrKpiDailyLog.upsert };
  }

  const labelOf = (upsert: ReturnType<typeof vi.fn>) =>
    (upsert.mock.calls[0]?.[0] as { create: { date: Date } }).create.date
      .toISOString()
      .slice(0, 10);

  it('yorliq MAHALLIY kunni nomlaydi, UTC kunini emas', async () => {
    // 2026-08-04 10:00 Tashkent = 05:00 UTC. Mahalliy yarim tun esa
    // 2026-08-03T19:00Z — uning UTC kalendar maydonini o'qish «3-avgust»
    // berardi, ya'ni 4-avgustni qamragan qator 3-avgust deb yozilardi.
    const { svc, upsert } = harness();
    await svc.snapshotDay('acc-1', new Date('2026-08-04T05:00:00Z'));
    expect(labelOf(upsert)).toBe('2026-08-04');
  });

  it('cron vaqti (23:30 mahalliy) ham O`SHA kunni nomlaydi', async () => {
    // 2026-08-04 23:30 Tashkent = 18:30 UTC — bug aynan shu yerda ko'rinardi.
    const { svc, upsert } = harness();
    await svc.snapshotDay('acc-1', new Date('2026-08-04T18:30:00Z'));
    expect(labelOf(upsert)).toBe('2026-08-04');
  });

  it('yarim tundan keyin (00:30 mahalliy) YANGI kunni nomlaydi', async () => {
    // 2026-08-05 00:30 Tashkent = 2026-08-04T19:30Z.
    const { svc, upsert } = harness();
    await svc.snapshotDay('acc-1', new Date('2026-08-04T19:30:00Z'));
    expect(labelOf(upsert)).toBe('2026-08-05');
  });

  it('yorliq va SO`ROV CHEGARASI bir xil kunni bildiradi', async () => {
    // Bug'ning mohiyati shu nomuvofiqlikda edi: chegara to'g'ri (mahalliy
    // 4-avgust 00:00 → 03-08T19:00Z), yorliq esa o'sha instantning UTC
    // kunidan olinib «3-avgust» bo'lib qolardi.
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrKpiService(prisma as any, makeSalary() as any);

    await svc.snapshotDay('acc-1', new Date('2026-08-04T18:30:00Z'));

    const label = (
      prisma.client.hrKpiDailyLog.upsert.mock.calls[0]?.[0] as { create: { date: Date } }
    ).create.date;
    const bounds = (
      prisma.client.demand.groupBy.mock.calls[0]?.[0] as {
        where: { postedAt: { gte: Date; lt: Date } };
      }
    ).where.postedAt;

    expect(label.toISOString()).toBe('2026-08-04T00:00:00.000Z');
    // Chegara = mahalliy 4-avgust 00:00 (UTC+5 → 3-avgust 19:00Z) va +24 soat.
    expect(bounds.gte.toISOString()).toBe('2026-08-03T19:00:00.000Z');
    expect(bounds.lt.toISOString()).toBe('2026-08-04T19:00:00.000Z');
  });
});

/**
 * HR-7/8 — kunlik maqsad ulushi oy chegarasida NOTO'G'RI oydan olinardi.
 *
 * `daysInMonthOf(dayStart)` argument sifatida `startOfLocalDay(day)` ni olardi:
 * u mahalliy yarim tunni bildiruvchi UTC instant, ya'ni Toshkentda (+05)
 * OLDINGI kunning 19:00 i. Uning UTC kalendar maydonlarini o'qish oyning
 * 1-kunida O'TGAN oyni beradi ⇒ 1-mart uchun kunlik maqsad 31 emas, 28 ga
 * bo'linardi (fevral). Bu — `localDateOnly` izohidagi bir xil yorliq/instant
 * chalkashligi, faqat kun emas, OY darajasida.
 */
describe('HrKpiService.snapshotDay — kunlik maqsad oyi (HR-7/8)', () => {
  function upsertTarget(prisma: ReturnType<typeof makePrisma>): bigint {
    return (
      prisma.client.hrKpiDailyLog.upsert.mock.calls[0]?.[0] as {
        create: { targetMinor: bigint };
      }
    ).create.targetMinor;
  }

  async function targetFor(dayIso: string, monthlyTarget: bigint): Promise<bigint> {
    const prisma = makePrisma();
    prisma.client.employee.findMany.mockResolvedValue([{ id: 'emp-1' }]);
    prisma.client.demand.groupBy.mockResolvedValue([]);
    prisma.client.hrKpiDailyLog.upsert.mockResolvedValue({});
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrKpiService(
      prisma as any,
      makeSalary({ monthlySalesTargetMinor: monthlyTarget }) as any,
    );
    await svc.snapshotDay('acc1', new Date(dayIso));
    return upsertTarget(prisma);
  }

  it("1-mart (mahalliy) MART kunlari soniga bo'linadi — fevralga EMAS", async () => {
    // 2026-03-01 03:00 Toshkent = 2026-02-28T22:00Z. Mart = 31 kun.
    const target = await targetFor('2026-02-28T22:00:00.000Z', 31_000_000_00n);
    expect(target).toBe(100_000_000n); // 31M / 31
    // Eski xatolik fevral (28) ni olib 110_714_285n berardi:
    expect(target).not.toBe(31_000_000_00n / 28n);
  });

  it('1-mart mahalliy yarim tunning O`ZIDA ham mart', async () => {
    // 2026-03-01 00:00 Toshkent = 2026-02-28T19:00Z.
    expect(await targetFor('2026-02-28T19:00:00.000Z', 31_000_000_00n)).toBe(100_000_000n);
  });

  it('1-fevral (kabisa yili 2028) — 29 kun', async () => {
    // 2028-02-01 02:00 Toshkent = 2028-01-31T21:00Z.
    expect(await targetFor('2028-01-31T21:00:00.000Z', 29_000_000_00n)).toBe(100_000_000n);
  });

  it('oy o`rtasida o`zgarish yo`q (regressiya qulfi)', async () => {
    expect(await targetFor('2026-03-15T12:00:00.000Z', 31_000_000_00n)).toBe(100_000_000n);
  });

  it('oyning OXIRGI kuni ham o`z oyida qoladi', async () => {
    // 2026-03-31 23:00 Toshkent = 2026-03-31T18:00Z → mart (31).
    expect(await targetFor('2026-03-31T18:00:00.000Z', 31_000_000_00n)).toBe(100_000_000n);
  });
});
