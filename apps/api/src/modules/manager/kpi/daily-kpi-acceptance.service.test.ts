import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';

/**
 * Kunlik KPI qabul servisi — ULANISH testlari (FSM qoidalari alohida
 * `daily-kpi.fsm.test.ts` da; bu yerda DB bilan bog'liq shartnomalar).
 *
 * Qulflanadigan narsalar (buzilsa PUL noto'g'ri to'lanadi):
 *   1. **idempotentlik** — takror qabul jurnalga IKKINCHI qator yozmaydi;
 *   2. **muzlatish** — qabul lahzasidagi ball ustunga yoziladi va qabul
 *      qilingan kunga tuzatma kiritib bo'lmaydi;
 *   3. **`autoValue` tegilmaydi** — tuzatma faqat `adjustValue` ga;
 *   4. **navbat tartibi** — og'ishli kunlar birinchi;
 *   5. **begona kun 404** — mavjudlik sizib chiqmaydi.
 */

const ACCOUNT = 'acc-1';
const DAY_ID = 'day-1';
const EMP = 'emp-1';

interface Harness {
  state?: string;
  employeeId?: string;
  metrics?: Array<{
    metricKey: string;
    autoValue: bigint | null;
    adjustValue?: bigint | null;
    complete?: boolean;
  }>;
  profileMetrics?: Array<{ key: string; weight: number; target: bigint | null }>;
  /** `adjustMetric` uchun: kunda topiladigan ko'rsatkich qatori. */
  metricRow?: { id: string; adjustValue: bigint | null } | null;
}

function makeService(h: Harness = {}) {
  const row = {
    id: DAY_ID,
    state: h.state ?? 'pending',
    employeeId: h.employeeId ?? EMP,
    date: new Date('2026-08-01T00:00:00Z'),
    dataComplete: true,
    workedMinutes: 480,
    queuedAt: new Date('2026-08-02T00:00:00Z'),
    acceptedAt: null,
    acceptedById: null,
    staleAt: null,
    scorePercent: null,
    scoreCoverage: null,
    computedAt: new Date('2026-08-02T00:40:00Z'),
    employee: { id: h.employeeId ?? EMP, name: 'Ali' },
    metrics: (h.metrics ?? []).map((m) => ({
      metricKey: m.metricKey,
      autoValue: m.autoValue,
      adjustValue: m.adjustValue ?? null,
      reasonCode: null,
      complete: m.complete ?? true,
    })),
    profileVersion: h.profileMetrics
      ? {
          id: 'ver-1',
          version: 1,
          effectiveFrom: new Date('2026-07-01T00:00:00Z'),
          metrics: h.profileMetrics.map((pm) => ({
            weight: pm.weight,
            target: pm.target,
            metricDef: { key: pm.key },
          })),
        }
      : null,
    events: [],
  };

  const dayUpdate = vi.fn().mockResolvedValue({});
  const eventCreate = vi.fn().mockResolvedValue({});
  const metricUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    employeeDailyKpi: { update: dayUpdate },
    employeeDailyKpiEvent: { create: eventCreate },
    employeeDailyKpiMetric: { update: metricUpdate },
  };

  const client = {
    employeeDailyKpi: {
      findFirst: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([row]),
    },
    employeeDailyKpiMetric: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          h.metricRow === undefined ? { id: 'met-1', adjustValue: null } : h.metricRow,
        ),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const svc = new DailyKpiAcceptanceService({ client } as never);
  return { svc, client, dayUpdate, eventCreate, metricUpdate, row };
}

describe('transition — jurnal va holat bir tranzaksiyada', () => {
  it('qabul qilishda holat, kim/qachon va MUZLATILGAN ball yoziladi', async () => {
    const { svc, dayUpdate } = makeService({
      state: 'pending',
      metrics: [{ metricKey: 'cash_revenue', autoValue: 800_000n }],
      profileMetrics: [{ key: 'cash_revenue', weight: 100, target: 1_000_000n }],
    });
    const res = await svc.transition(ACCOUNT, DAY_ID, 'accept', {
      actor: 'manager',
      actorId: 'user-1',
    });

    expect(res).toMatchObject({ state: 'accepted', changed: true });
    const data = dayUpdate.mock.calls[0][0].data;
    expect(data.state).toBe('accepted');
    expect(data.acceptedById).toBe('user-1');
    expect(data.acceptedAt).toBeInstanceOf(Date);
    // 800 000 ÷ 1 000 000 = 80%
    expect(data.scorePercent).toBe(80);
    expect(data.scoreCoverage).toBe(1);
  });

  it('har o`tish hodisa jurnaliga tushadi', async () => {
    const { svc, eventCreate } = makeService({ state: 'pending' });
    await svc.transition(ACCOUNT, DAY_ID, 'reject', {
      actor: 'manager',
      actorId: 'user-1',
      reasonCode: 'data_error',
      note: 'Kassa farqi tushunarsiz',
    });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      action: 'reject',
      fromState: 'pending',
      toState: 'rejected',
      actorType: 'manager',
      actorId: 'user-1',
      reasonCode: 'data_error',
      note: 'Kassa farqi tushunarsiz',
    });
  });

  it('navbat holatiga o`tganda `queuedAt` yangilanadi (eskalatsiya soati)', async () => {
    const { svc, dayUpdate } = makeService({ state: 'pending' });
    await svc.transition(ACCOUNT, DAY_ID, 'reject', {
      actor: 'manager',
      actorId: 'u',
      reasonCode: 'other',
    });
    expect(dayUpdate.mock.calls[0][0].data.queuedAt).toBeInstanceOf(Date);
  });

  it('IDEMPOTENT: qabul qilingan kunni qayta qabul qilish jurnalga yozmaydi', async () => {
    const { svc, dayUpdate, eventCreate } = makeService({ state: 'accepted' });
    const res = await svc.transition(ACCOUNT, DAY_ID, 'accept', {
      actor: 'manager',
      actorId: 'u',
    });
    // Bu — bonus ikki marta yozilmasligining birinchi qulfi (TZ §10.2).
    expect(res).toMatchObject({ state: 'accepted', changed: false });
    expect(dayUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('noma`lum sabab kodi rad etiladi (yopiq ro`yxat)', async () => {
    const { svc } = makeService({ state: 'pending' });
    await expect(
      svc.transition(ACCOUNT, DAY_ID, 'reject', {
        actor: 'manager',
        actorId: 'u',
        reasonCode: 'menga-yoqmadi',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('mavjud bo`lmagan kun — 404', async () => {
    const { svc, client } = makeService();
    client.employeeDailyKpi.findFirst.mockResolvedValue(null);
    await expect(
      svc.transition(ACCOUNT, DAY_ID, 'accept', { actor: 'manager', actorId: 'u' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('BEGONA kunga tushuntirish — 403 emas, 404 (mavjudlik sizmasin)', async () => {
    const { svc } = makeService({ state: 'rejected', employeeId: 'emp-boshqa' });
    await expect(
      svc.transition(ACCOUNT, DAY_ID, 'explain', {
        actor: 'employee',
        actorId: EMP,
        expectEmployeeId: EMP,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('o`z kuniga tushuntirish o`tadi', async () => {
    const { svc } = makeService({ state: 'rejected', employeeId: EMP });
    const res = await svc.transition(ACCOUNT, DAY_ID, 'explain', {
      actor: 'employee',
      actorId: EMP,
      expectEmployeeId: EMP,
      note: 'Kassa apparati ishlamadi',
    });
    expect(res.state).toBe('pending');
  });
});

describe('adjustMetric — tuzatma', () => {
  it('faqat `adjustValue` ga yozadi, `autoValue` ga TEGMAYDI', async () => {
    const { svc, metricUpdate } = makeService({ state: 'pending' });
    await svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
      value: '750000',
      reasonCode: 'data_error',
      actor: 'manager',
      actorId: 'u',
    });
    const data = metricUpdate.mock.calls[0][0].data;
    expect(data).toEqual({ adjustValue: 750_000n, reasonCode: 'data_error' });
    expect(data).not.toHaveProperty('autoValue');
  });

  it('tuzatma jurnalga eski→yangi bilan tushadi', async () => {
    const { svc, eventCreate } = makeService({
      state: 'pending',
      metricRow: { id: 'met-1', adjustValue: 100n },
    });
    await svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
      value: '750000',
      reasonCode: 'data_error',
      actor: 'manager',
      actorId: 'u',
    });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      action: 'adjust',
      fromState: 'pending',
      toState: 'pending',
      payload: { metricKey: 'cash_revenue', from: '100', to: '750000' },
    });
  });

  it('MUZLATISH: qabul qilingan kunga tuzatma kiritilmaydi', async () => {
    const { svc } = makeService({ state: 'accepted' });
    await expect(
      svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
        value: '1',
        reasonCode: 'data_error',
        actor: 'manager',
        actorId: 'u',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('xodim o`z raqamini tuzata olmaydi', async () => {
    const { svc } = makeService({ state: 'pending' });
    await expect(
      svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
        value: '1',
        reasonCode: 'data_error',
        actor: 'employee',
        actorId: EMP,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('katalogda yo`q ko`rsatkich rad etiladi', async () => {
    const { svc } = makeService({ state: 'pending' });
    await expect(
      svc.adjustMetric(ACCOUNT, DAY_ID, 'yolgon', {
        value: '1',
        reasonCode: 'data_error',
        actor: 'manager',
        actorId: 'u',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('pul MATNDAN BigInt`ga o`tadi — katta summa yaxlitlanmaydi', async () => {
    const { svc, metricUpdate } = makeService({ state: 'pending' });
    const huge = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    await svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
      value: huge,
      reasonCode: 'data_error',
      actor: 'manager',
      actorId: 'u',
    });
    expect(metricUpdate.mock.calls[0][0].data.adjustValue).toBe(BigInt(huge));
  });

  it('butun bo`lmagan qiymat rad etiladi', async () => {
    const { svc } = makeService({ state: 'pending' });
    await expect(
      svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
        value: '12.5',
        reasonCode: 'data_error',
        actor: 'manager',
        actorId: 'u',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('null qiymat tuzatmani OLIB TASHLAYDI (sabab ham tozalanadi)', async () => {
    const { svc, metricUpdate } = makeService({ state: 'pending' });
    await svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
      value: null,
      reasonCode: 'data_error',
      actor: 'manager',
      actorId: 'u',
    });
    expect(metricUpdate.mock.calls[0][0].data).toEqual({ adjustValue: null, reasonCode: null });
  });

  it('kunda bo`lmagan ko`rsatkich — 404', async () => {
    const { svc } = makeService({ state: 'pending', metricRow: null });
    await expect(
      svc.adjustMetric(ACCOUNT, DAY_ID, 'cash_revenue', {
        value: '1',
        reasonCode: 'data_error',
        actor: 'manager',
        actorId: 'u',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('navbat — og`ishli kunlar birinchi', () => {
  it('eskalatsiya → eskirgan → rad etilgan → kutayotgan tartibida', async () => {
    const { svc, client } = makeService();
    const base = {
      date: new Date('2026-08-01T00:00:00Z'),
      dataComplete: true,
      workedMinutes: 480,
      queuedAt: new Date('2026-08-02T00:00:00Z'),
      scorePercent: null,
      scoreCoverage: null,
      metrics: [],
      profileVersion: null,
    };
    client.employeeDailyKpi.findMany.mockResolvedValue([
      { ...base, id: 'a', state: 'pending', employee: { id: '1', name: 'A' } },
      { ...base, id: 'b', state: 'escalated', employee: { id: '2', name: 'B' } },
      { ...base, id: 'c', state: 'rejected', employee: { id: '3', name: 'C' } },
      { ...base, id: 'd', state: 'stale', employee: { id: '4', name: 'D' } },
    ]);
    const res = await svc.queue(ACCOUNT, {});
    expect(res.items.map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('bir holat ichida eng PAST ball yuqorida', async () => {
    const { svc, client } = makeService();
    const mk = (id: string, revenue: bigint) => ({
      id,
      state: 'pending',
      date: new Date('2026-08-01T00:00:00Z'),
      dataComplete: true,
      workedMinutes: 480,
      queuedAt: null,
      scorePercent: null,
      scoreCoverage: null,
      employee: { id, name: id },
      metrics: [
        { metricKey: 'cash_revenue', autoValue: revenue, adjustValue: null, complete: true },
      ],
      profileVersion: {
        id: 'v',
        version: 1,
        metrics: [{ weight: 100, target: 1_000_000n, metricDef: { key: 'cash_revenue' } }],
      },
    });
    client.employeeDailyKpi.findMany.mockResolvedValue([
      mk('yuqori', 900_000n),
      mk('past', 200_000n),
    ]);
    const res = await svc.queue(ACCOUNT, {});
    expect(res.items[0]?.id).toBe('past');
  });

  it('BALLSIZ kun (profil yo`q) eng yuqorida — u ham menejer ishi', async () => {
    const { svc, client } = makeService();
    const mk = (id: string, profile: unknown) => ({
      id,
      state: 'pending',
      date: new Date('2026-08-01T00:00:00Z'),
      dataComplete: true,
      workedMinutes: 480,
      queuedAt: null,
      scorePercent: null,
      scoreCoverage: null,
      employee: { id, name: id },
      metrics: [{ metricKey: 'cash_revenue', autoValue: 100n, adjustValue: null, complete: true }],
      profileVersion: profile,
    });
    client.employeeDailyKpi.findMany.mockResolvedValue([
      mk('ballli', {
        id: 'v',
        version: 1,
        metrics: [{ weight: 100, target: 1_000_000n, metricDef: { key: 'cash_revenue' } }],
      }),
      mk('profilsiz', null),
    ]);
    const res = await svc.queue(ACCOUNT, {});
    expect(res.items[0]?.id).toBe('profilsiz');
    expect(res.items[0]?.hasProfile).toBe(false);
  });

  it('QABUL QILINGAN kun uchun MUZLATILGAN ball ko`rsatiladi, qayta hisoblangani emas', async () => {
    const { svc, client } = makeService();
    client.employeeDailyKpi.findMany.mockResolvedValue([
      {
        id: 'x',
        state: 'accepted',
        date: new Date('2026-08-01T00:00:00Z'),
        dataComplete: true,
        workedMinutes: 480,
        queuedAt: null,
        // Qabul paytida 42% edi; og'irlik keyin o'zgargan bo'lsa ham shu ko'rinadi.
        scorePercent: 42,
        scoreCoverage: 1,
        employee: { id: '1', name: 'A' },
        metrics: [
          { metricKey: 'cash_revenue', autoValue: 1_000_000n, adjustValue: null, complete: true },
        ],
        profileVersion: {
          id: 'v',
          version: 2,
          metrics: [{ weight: 100, target: 1_000_000n, metricDef: { key: 'cash_revenue' } }],
        },
      },
    ]);
    const res = await svc.queue(ACCOUNT, { states: ['accepted'] });
    expect(res.items[0]?.score).toBe(42); // jonli hisob 100 bo'lardi
    expect(res.items[0]?.scoreFrozen).toBe(42);
  });
});

describe('tizim o`tishlari', () => {
  it('submitClosedDays faqat O`TGAN kunlarni navbatga qo`yadi', async () => {
    const { svc, client } = makeService({ state: 'computed' });
    client.employeeDailyKpi.findMany.mockResolvedValue([{ id: DAY_ID }]);
    const res = await svc.submitClosedDays(ACCOUNT, new Date('2026-08-04T10:00:00Z'));
    expect(res.submitted).toBe(1);
    const where = client.employeeDailyKpi.findMany.mock.calls[0][0].where;
    expect(where.state).toBe('computed');
    // Bugungi kun chegaradan TASHQARIDA (u hali o'zgaryapti).
    expect(where.date.lt).toBeInstanceOf(Date);
  });

  it('escalateOverdue faqat navbatda TURIB QOLGANLARNI ko`taradi', async () => {
    const { svc, client } = makeService({ state: 'pending' });
    client.employeeDailyKpi.findMany.mockResolvedValue([{ id: DAY_ID }]);
    const res = await svc.escalateOverdue(ACCOUNT, new Date('2026-08-10T00:00:00Z'), 3);
    expect(res.escalated).toBe(1);
    const where = client.employeeDailyKpi.findMany.mock.calls[0][0].where;
    expect(where.state.in).toEqual(['pending', 'rejected']);
    expect(where.queuedAt.lte).toEqual(new Date('2026-08-07T00:00:00Z'));
  });
});
