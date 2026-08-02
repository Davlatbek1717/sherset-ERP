import { describe, expect, it, vi } from 'vitest';
import { EmployeeDailyKpiService } from './employee-daily-kpi.service.js';

/**
 * Kunlik KPI hisoblash servisi — ULANISH testlari.
 *
 * Aynan uchta narsa qulflanadi, chunki ular buzilsa raqam YOLG'ON bo'ladi:
 *   1. tan narx yig'ilmagan qator foydaga qo'shilmaydi va kun CHALA deb
 *      belgilanadi (NULL ≠ 0 — 1.2 gacha bo'lgan «100% marja» xatosi);
 *   2. kassir o'qi `CashierSession.cashierId`, `RetailSale.ownerId` EMAS
 *      (qaytarishda u aktyorga yoziladi — analitika TZ X2);
 *   3. qayta hisoblash menejer tuzatmasini va kun holatini O'CHIRMAYDI.
 */

const ACCOUNT = 'acc-1';
const EMP = 'emp-1';
const DAY = new Date('2026-07-15T10:00:00Z');

interface Harness {
  positions?: unknown[];
  sessions?: unknown[];
  events?: unknown[];
  demands?: unknown[];
  attendance?: unknown[];
}

function makeService(h: Harness = {}) {
  const dailyUpsert = vi.fn().mockResolvedValue({ id: 'day-1' });
  const metricUpsert = vi.fn().mockResolvedValue({});
  const tx = {
    employeeDailyKpi: { upsert: dailyUpsert },
    employeeDailyKpiMetric: { upsert: metricUpsert },
  };
  const client = {
    employee: { findMany: vi.fn().mockResolvedValue([{ id: EMP, positionId: null }]) },
    cashierSession: { findMany: vi.fn().mockResolvedValue(h.sessions ?? []) },
    cashierAuditEvent: { findMany: vi.fn().mockResolvedValue(h.events ?? []) },
    retailSalePosition: { findMany: vi.fn().mockResolvedValue(h.positions ?? []) },
    demand: { findMany: vi.fn().mockResolvedValue(h.demands ?? []) },
    hrAttendance: { findMany: vi.fn().mockResolvedValue(h.attendance ?? []) },
    task: { groupBy: vi.fn().mockResolvedValue([]) },
    restockTaskLine: { groupBy: vi.fn().mockResolvedValue([]) },
    kpiProfile: { findMany: vi.fn().mockResolvedValue([]) },
    account: { findMany: vi.fn().mockResolvedValue([{ id: ACCOUNT }]) },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const svc = new EmployeeDailyKpiService({ client } as never);
  return { svc, dailyUpsert, metricUpsert, client };
}

/** Yozilgan ko'rsatkichni kalit bo'yicha topadi. */
function written(metricUpsert: ReturnType<typeof vi.fn>, key: string) {
  const call = metricUpsert.mock.calls.find((c) => c[0]?.create?.metricKey === key);
  return call?.[0]?.create as { autoValue: bigint | null; complete: boolean } | undefined;
}

describe('kassa foydasi — NULL ≠ 0', () => {
  const session = { session: { cashierId: EMP } };

  it('tan narx bor qatorlardan foyda hisoblanadi', async () => {
    const { svc, metricUpsert } = makeService({
      positions: [{ sumMinor: 300_000n, costMinor: 100_000n, quantity: '2', retailSale: session }],
    });
    await svc.computeDay(ACCOUNT, DAY);
    // 300 000 − (100 000 × 2) = 100 000
    expect(written(metricUpsert, 'cash_gross_profit')).toMatchObject({
      autoValue: 100_000n,
      complete: true,
    });
  });

  it('tan narxi NULL qator foydaga QO`SHILMAYDI va kun chala bo`ladi', async () => {
    const { svc, metricUpsert, dailyUpsert } = makeService({
      positions: [
        { sumMinor: 300_000n, costMinor: 100_000n, quantity: '1', retailSale: session },
        { sumMinor: 500_000n, costMinor: null, quantity: '1', retailSale: session },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);

    const profit = written(metricUpsert, 'cash_gross_profit');
    // Faqat birinchi qator: 300 000 − 100 000 = 200 000.
    // Ikkinchisi 500 000 «sof foyda» bo'lib qo'shilmaydi — bu aynan 1.2 gacha
    // bo'lgan xato edi.
    expect(profit?.autoValue).toBe(200_000n);
    expect(profit?.complete).toBe(false);
    expect(dailyUpsert.mock.calls[0][0].create.dataComplete).toBe(false);
  });
});

describe('kassir o`qi', () => {
  it('smena kassiri bo`yicha yig`iladi (RetailSale.ownerId emas)', async () => {
    const other = 'emp-boshqa';
    const { svc, metricUpsert } = makeService({
      positions: [
        // `ownerId` bu yerda umuman o'qilmaydi — sessiyaning kassiri muhim.
        {
          sumMinor: 100_000n,
          costMinor: 40_000n,
          quantity: '1',
          retailSale: { session: { cashierId: other } },
        },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    // Bizning xodimimizga hech narsa yozilmaydi — foyda boshqa kassirniki.
    expect(written(metricUpsert, 'cash_gross_profit')).toMatchObject({
      autoValue: null,
      complete: false,
    });
  });
});

describe('kassa hodisalari', () => {
  it('chegirma dona narxidan MIQDORGA ko`paytiriladi', async () => {
    const { svc, metricUpsert } = makeService({
      events: [
        {
          employeeId: EMP,
          type: 'PRICE_CHANGED',
          payload: { diffMinor: '-50000', quantity: '3' },
        },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'discount_given')?.autoValue).toBe(150_000n);
  });

  it('narx OSHIRILGAN bo`lsa chegirma hisoblanmaydi', async () => {
    const { svc, metricUpsert } = makeService({
      events: [
        { employeeId: EMP, type: 'PRICE_CHANGED', payload: { diffMinor: '50000', quantity: '2' } },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'discount_given')?.autoValue).toBe(0n);
  });

  it('zarar summasi va soni ajratib yoziladi', async () => {
    const { svc, metricUpsert } = makeService({
      events: [
        { employeeId: EMP, type: 'SOLD_BELOW_COST', payload: { lossMinor: '240000' } },
        { employeeId: EMP, type: 'SOLD_BELOW_COST', payload: { lossMinor: '60000' } },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'below_cost_count')?.autoValue).toBe(2n);
    expect(written(metricUpsert, 'below_cost_loss')?.autoValue).toBe(300_000n);
  });
});

describe('kassa farqi', () => {
  it('modul olinadi — kamomad ham, ortiqcha ham muammo', async () => {
    const { svc, metricUpsert } = makeService({
      sessions: [
        { cashierId: EMP, salesSumMinor: 0n, salesCount: 0, discrepancyMinor: -5_000n },
        { cashierId: EMP, salesSumMinor: 0n, salesCount: 0, discrepancyMinor: 3_000n },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'till_variance_abs')?.autoValue).toBe(8_000n);
  });
});

describe('davomat', () => {
  it('ishlangan vaqt kelish/ketishdan hisoblanadi', async () => {
    const { svc, metricUpsert } = makeService({
      attendance: [
        {
          employeeId: EMP,
          checkInTime: new Date('2026-07-15T04:00:00Z'),
          checkOutTime: new Date('2026-07-15T12:00:00Z'),
          lateMinutes: 12,
        },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'worked_minutes')?.autoValue).toBe(480n);
    expect(written(metricUpsert, 'late_minutes')?.autoValue).toBe(12n);
  });

  it('ketish qayd etilmagan bo`lsa vaqt CHALA deb belgilanadi', async () => {
    // Taxminiy raqam yozilsa, u soatga normallashtirish orqali butun KPI'ga
    // tarqalardi — shuning uchun bayroq qo'yiladi.
    const { svc, metricUpsert } = makeService({
      attendance: [
        {
          employeeId: EMP,
          checkInTime: new Date('2026-07-15T04:00:00Z'),
          checkOutTime: null,
          lateMinutes: 0,
        },
      ],
    });
    await svc.computeDay(ACCOUNT, DAY);
    expect(written(metricUpsert, 'worked_minutes')?.complete).toBe(false);
  });
});

describe('idempotentlik va menejer tuzatmasi', () => {
  it('qayta hisoblash kun HOLATINI o`zgartirmaydi', async () => {
    const { svc, dailyUpsert } = makeService({});
    await svc.computeDay(ACCOUNT, DAY);
    // `update` da `state` umuman yo'q — qabul qilingan kun «hisoblandi» ga
    // qaytib ketmasligi kerak (4M.2 qabul oqimi shunga tayanadi).
    expect(dailyUpsert.mock.calls[0][0].update).not.toHaveProperty('state');
  });

  it('qayta hisoblash tuzatma va sababni O`CHIRMAYDI', async () => {
    const { svc, metricUpsert } = makeService({});
    await svc.computeDay(ACCOUNT, DAY);
    const update = metricUpsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('adjustValue');
    expect(update).not.toHaveProperty('reasonCode');
    expect(Object.keys(update).sort()).toEqual(['autoValue', 'complete']);
  });

  it('faoliyatsiz xodimga ham kun yoziladi (menejer hammasini ko`radi)', async () => {
    const { svc, dailyUpsert } = makeService({});
    const res = await svc.computeDay(ACCOUNT, DAY);
    expect(res.written).toBe(1);
    expect(dailyUpsert).toHaveBeenCalledTimes(1);
  });

  it('faoliyatsiz kun CHALA deb belgilanmaydi', async () => {
    // Hech narsa qilmagan xodimda ko'rsatkichlar «o'lchanmagan» bo'ladi —
    // bu ma'lumot kamchiligi emas, shunchaki faoliyat yo'q.
    const { svc, dailyUpsert } = makeService({});
    await svc.computeDay(ACCOUNT, DAY);
    expect(dailyUpsert.mock.calls[0][0].create.dataComplete).toBe(true);
  });
});

describe('kun yorlig`i — mahalliy sana', () => {
  it('cron yarim tundan oldin ishlaganda kun BIR KUN ORQAGA surilmaydi', async () => {
    // 23:30 Toshkent = 18:30 UTC. Kun boshi 1-avgust 19:00 UTC bo'ladi, ya'ni
    // uning UTC kalendar sanasi — 1-avgust. Yorliq esa 2-avgust bo'lishi kerak,
    // chunki ma'lumot aynan shu mahalliy kunniki. Mavjud `hr-kpi.service.ts`
    // shu joyda bir kunga adashadi.
    const { svc, dailyUpsert } = makeService({});
    await svc.computeDay(ACCOUNT, new Date('2026-08-02T18:30:00Z'));
    const date = dailyUpsert.mock.calls[0][0].create.date as Date;
    expect(date.toISOString().slice(0, 10)).toBe('2026-08-02');
  });

  it('yorliq va so`rov chegarasi bir xil kunni bildiradi', async () => {
    // Yorliq bir kunni, so'rov boshqa kunni ko'rsatsa — raqam boshqa kunning
    // ma'lumoti bilan to'ladi va buni hech kim sezmaydi.
    const { svc, dailyUpsert, client } = makeService({});
    await svc.computeDay(ACCOUNT, new Date('2026-08-02T18:30:00Z'));
    const label = (dailyUpsert.mock.calls[0][0].create.date as Date).toISOString().slice(0, 10);
    const gte = client.retailSalePosition.findMany.mock.calls[0][0].where.retailSale.postedAt
      .gte as Date;
    // Chegara mahalliy yarim tun = UTC 19:00, ya'ni yorliqdan bir kun oldin.
    expect(new Date(gte.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)).toBe(label);
  });
});
