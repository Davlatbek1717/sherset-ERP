import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PLAN_STATUS } from './sales-plan-progress.js';
import { TARGET_SOURCE } from './sales-plan-target.js';
import { SALES_PLAN_TYPE } from './sales-plan-types.js';
import { SalesPlanService, elapsedDaysOf } from './sales-plan.service.js';

/**
 * MK37 servis darajasidagi qulflar.
 *
 * Sof qatlam (`sales-plan-fact` / `-target` / `-progress`) o'z testlariga ega;
 * bu yerda YIG'ISH tekshiriladi: qaysi jadval, qaysi oy chegarasi, qaysi
 * ko'rsatkich kalitlari va javob shakli. Shu uch narsa buzilsa sof testlar
 * YASHIL qolaveradi (MK12 servis testining aynan sababi).
 */

interface Captured {
  metricWhere?: Record<string, unknown>;
  planWhere?: Record<string, unknown>;
  upsert?: Record<string, unknown>;
}

interface StubData {
  employees?: Array<{ id: string; name: string }>;
  plans?: Array<Record<string, unknown>>;
  metrics?: Array<Record<string, unknown>>;
  salaryConfig?: { monthlySalesTarget: bigint } | null;
  currencies?: Array<Record<string, unknown>>;
}

function stub(data: StubData): { svc: SalesPlanService; captured: Captured } {
  const captured: Captured = {};
  const client = {
    currency: { findMany: async () => data.currencies ?? [] },
    employee: {
      findMany: async () => data.employees ?? [],
      findFirst: async () => data.employees?.[0] ?? null,
    },
    salesPlan: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        captured.planWhere = args.where;
        return data.plans ?? [];
      },
      upsert: async (args: Record<string, unknown>) => {
        captured.upsert = args;
        return { id: 'plan-new' };
      },
      findFirst: async () => ({ id: 'plan-1' }),
      delete: async () => ({ id: 'plan-1' }),
    },
    employeeDailyKpiMetric: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        captured.metricWhere = args.where;
        return data.metrics ?? [];
      },
    },
    hrSalaryConfig: { findUnique: async () => data.salaryConfig ?? null },
  };
  return {
    svc: new SalesPlanService({ client } as unknown as PrismaService),
    captured,
  };
}

const ANNA = { id: 'emp-1', name: 'Anna' };

function metric(over: Record<string, unknown>) {
  return {
    metricKey: 'sales_revenue',
    autoValue: 0n,
    adjustValue: null,
    complete: true,
    dailyKpi: { employeeId: ANNA.id },
    ...over,
  };
}

describe('SalesPlanService.report — manba so`rovlari', () => {
  it('oy chegarasi DATE-yorliq bo`yicha (UTC yarim tun), instant EMAS', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.report('acc', { yearMonth: '2026-08' });

    const daily = (captured.metricWhere?.dailyKpi ?? {}) as {
      date: { gte: Date; lt: Date };
    };
    // `EmployeeDailyKpi.date` — DATE ustuni, u yerda UTC yarim tun mahalliy
    // kunning NOMI. `monthInstantBounds` (Toshkent) bu yerda kunni bir kunga
    // surib yuborardi ([[month-bounds-label-vs-instant]]).
    expect(daily.date.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(daily.date.lt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('FAQAT reja turlariga tegishli ko`rsatkichlar so`raladi', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.report('acc', { yearMonth: '2026-08' });

    const keys = (captured.metricWhere?.metricKey as { in: string[] }).in;
    expect(keys.sort()).toEqual([
      'cash_gross_profit',
      'cash_revenue',
      'gross_profit',
      'sales_revenue',
    ]);
  });

  it('reja so`rovi shu OYGA cheklangan', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.report('acc', { yearMonth: '2026-08' });
    expect(captured.planWhere?.yearMonth).toBe('2026-08');
  });
});

describe('SalesPlanService.report — javob shakli', () => {
  it('🔴 reja qo`yilmagan xodim: `no_plan`, foiz NULL (0% EMAS)', async () => {
    const { svc } = stub({
      employees: [ANNA],
      metrics: [metric({ autoValue: 500_00n })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const revenue = r.rows[0]?.cells.find((c) => c.planType === SALES_PLAN_TYPE.revenue);

    expect(revenue?.status).toBe(PLAN_STATUS.noPlan);
    expect(revenue?.achievedPercent).toBeNull();
    expect(revenue?.targetSource).toBe(TARGET_SOURCE.none);
    // Fakt esa YO'QOLMAYDI — u o'lchangan va ko'rinadi.
    expect(revenue?.factValue).toBe('50000');
  });

  it('reja bor: fakt bilan solishtiriladi va manba kalitlari ko`rinadi', async () => {
    const { svc } = stub({
      employees: [ANNA],
      plans: [
        {
          id: 'p1',
          employeeId: ANNA.id,
          planType: 'revenue',
          targetValue: 1_000_00n,
          currency: 'UZS',
          note: null,
        },
      ],
      metrics: [
        metric({ autoValue: 300_00n }),
        metric({ metricKey: 'cash_revenue', autoValue: 200_00n }),
      ],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const revenue = r.rows[0]?.cells.find((c) => c.planType === SALES_PLAN_TYPE.revenue);

    expect(revenue?.targetValue).toBe('100000');
    expect(revenue?.factValue).toBe('50000');
    expect(revenue?.achievedPercent).toBe('50.00');
    expect(revenue?.planId).toBe('p1');
    expect(revenue?.contributingKeys.sort()).toEqual(['cash_revenue', 'sales_revenue']);
  });

  it('🔴 boshqa valyutadagi reja: foiz chizilmaydi, qiymat yashirilmaydi', async () => {
    const { svc } = stub({
      employees: [ANNA],
      plans: [
        {
          id: 'p1',
          employeeId: ANNA.id,
          planType: 'revenue',
          targetValue: 100n,
          currency: 'USD',
          note: null,
        },
      ],
      metrics: [metric({ autoValue: 50n })],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const revenue = r.rows[0]?.cells.find((c) => c.planType === SALES_PLAN_TYPE.revenue);

    expect(revenue?.comparable).toBe(false);
    expect(revenue?.targetValue).toBe('100');
    expect(revenue?.currency).toBe('USD');
    // Solishtirib bo'lmagani uchun bajarish NOMA'LUM — «0%» ham, «100%» ham emas.
    expect(revenue?.achievedPercent).toBeNull();
    expect(revenue?.status).toBe(PLAN_STATUS.noPlan);
  });

  it('manbasi yo`q turlar `factSource: none` bilan ochiq belgilanadi', async () => {
    const { svc } = stub({ employees: [ANNA], metrics: [metric({ autoValue: 1n })] });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const cell = r.rows[0]?.cells.find((c) => c.planType === SALES_PLAN_TYPE.customerCount);
    expect(cell?.factSource).toBe('none');
    expect(cell?.factValue).toBeNull();
  });

  it('eski hisob-maqsadi sukut reja sifatida ko`rinadi va MANBASI belgilanadi', async () => {
    const { svc } = stub({
      employees: [ANNA],
      metrics: [metric({ autoValue: 100n })],
      salaryConfig: { monthlySalesTarget: 1000n },
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const revenue = r.rows[0]?.cells.find((c) => c.planType === SALES_PLAN_TYPE.revenue);

    expect(revenue?.targetSource).toBe(TARGET_SOURCE.salaryConfig);
    expect(revenue?.targetValue).toBe('1000');
    expect(r.accountSalesTargetMinor).toBe('1000');
  });

  it('rejasi ham, fakti ham yo`q xodim ro`yxatga tushmaydi', async () => {
    const { svc } = stub({ employees: [ANNA, { id: 'emp-2', name: 'Bob' }] });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    expect(r.rows).toEqual([]);
  });

  it('`includeEmpty` bilan hamma xodim chiqadi (reja qo`shish ro`yxati)', async () => {
    const { svc } = stub({ employees: [ANNA, { id: 'emp-2', name: 'Bob' }] });
    const r = await svc.report('acc', { yearMonth: '2026-08', includeEmpty: true });
    expect(r.rows.map((x) => x.employeeId)).toEqual(['emp-1', 'emp-2']);
  });

  it('bir xodimning fakti boshqasiga O`TMAYDI', async () => {
    const { svc } = stub({
      employees: [ANNA, { id: 'emp-2', name: 'Bob' }],
      metrics: [
        metric({ autoValue: 10n }),
        metric({ autoValue: 20n, dailyKpi: { employeeId: 'emp-2' } }),
      ],
    });
    const r = await svc.report('acc', { yearMonth: '2026-08' });
    const factOf = (id: string) =>
      r.rows.find((x) => x.employeeId === id)?.cells.find((c) => c.planType === 'revenue')
        ?.factValue;
    expect(factOf('emp-1')).toBe('10');
    expect(factOf('emp-2')).toBe('20');
  });
});

describe('SalesPlanService.upsertPlan — valyuta shartnomasi', () => {
  it('pul rejasida valyuta berilmasa HISOB BAZASI qo`yiladi (bo`sh qolmaydi)', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.upsertPlan('acc', 'user-1', {
      employeeId: ANNA.id,
      yearMonth: '2026-08',
      planType: SALES_PLAN_TYPE.revenue,
      targetValue: 1000n,
    });
    const create = (captured.upsert?.create ?? {}) as { currency: string | null };
    expect(create.currency).toBe('UZS');
  });

  it('🔴 sanoq rejasida valyuta NULL bo`ladi (birlik lug`atlari aralashmasin)', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.upsertPlan('acc', 'user-1', {
      employeeId: ANNA.id,
      yearMonth: '2026-08',
      planType: SALES_PLAN_TYPE.customerCount,
      targetValue: 12n,
      currency: null,
    });
    const create = (captured.upsert?.create ?? {}) as { currency: string | null };
    expect(create.currency).toBeNull();
  });

  it('upsert kaliti xodim × oy × tur (bitta qator kafolati)', async () => {
    const { svc, captured } = stub({ employees: [ANNA] });
    await svc.upsertPlan('acc', 'user-1', {
      employeeId: ANNA.id,
      yearMonth: '2026-08',
      planType: SALES_PLAN_TYPE.profit,
      targetValue: 5n,
    });
    expect(captured.upsert?.where).toEqual({
      accountId_employeeId_yearMonth_planType: {
        accountId: 'acc',
        employeeId: ANNA.id,
        yearMonth: '2026-08',
        planType: 'profit',
      },
    });
  });

  it('begona xodimga reja qo`yib bo`lmaydi (tenant qo`riqchisi)', async () => {
    const { svc } = stub({ employees: [] });
    await expect(
      svc.upsertPlan('acc', 'user-1', {
        employeeId: '00000000-0000-0000-0000-000000000000',
        yearMonth: '2026-08',
        planType: SALES_PLAN_TYPE.revenue,
        targetValue: 1n,
      }),
    ).rejects.toThrow();
  });
});

describe('elapsedDaysOf — sur`at chegarasi', () => {
  const now = (iso: string) => new Date(iso);

  it('o`tgan oy: to`liq oy o`tgan', () => {
    expect(elapsedDaysOf('2026-07', 31, now('2026-08-05T00:00:00Z'))).toBe(31);
  });

  it('kelajakdagi oy: 0 kun (xodim «orqada» deb ayblanmaydi)', () => {
    expect(elapsedDaysOf('2026-09', 30, now('2026-08-05T00:00:00Z'))).toBe(0);
  });

  it('joriy oy: bugungi kun raqami (TOSHKENT yorlig`i bo`yicha)', () => {
    expect(elapsedDaysOf('2026-08', 31, now('2026-08-05T10:00:00Z'))).toBe(5);
  });

  it('🔴 UTC yarim tundan keyingi soatlar Toshkentda ERTANGI kun', () => {
    // 2026-08-05 20:00 UTC = 2026-08-06 01:00 Toshkent.
    expect(elapsedDaysOf('2026-08', 31, now('2026-08-05T20:00:00Z'))).toBe(6);
  });

  it('buzuq oy (0 kun): sur`at hisoblanmaydi', () => {
    expect(elapsedDaysOf('2026-13', 0, now('2026-08-05T00:00:00Z'))).toBe(0);
  });
});
