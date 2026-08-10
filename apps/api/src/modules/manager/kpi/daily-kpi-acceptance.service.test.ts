import { describe, expect, it, vi } from 'vitest';
import { materializeComment } from '../comments/comment-templates.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
import { BUILT_IN_CATALOG } from './kpi-metrics.js';

/**
 * Qabul servisi — bazasiz ULANISH testlari.
 *
 * To'liq oqim jonli bazada haydab tekshirilgan; bu yerda faqat **mock'siz
 * chiqarib bo'lmaydigan** holatlar qulflanadi:
 *   1. optimistik da'vo tegmasa 409 (parallel menejer);
 *   2. da'vo va jurnal BITTA tranzaksiyada;
 *   3. tuzatma `autoValue` ustuniga umuman TEGMAYDI.
 */

const ACC = 'acc-1';
const ID = 'day-1';
const MANAGER = { accountId: ACC, actor: 'manager' as const, actorId: 'mgr-1' };

function makeService(opts: {
  state?: string;
  claimCount?: number;
  employeeId?: string;
  metric?: { id: string; autoValue: bigint | null; adjustValue: bigint | null } | null;
  metrics?: Array<{
    metricKey: string;
    autoValue: bigint | null;
    adjustValue: bigint | null;
    complete: boolean;
    /** KPI-03 kun muhri; berilmasa — muhrlanmagan (eski) qator. */
    targetValue?: bigint | null;
    targetSource?: string | null;
  }>;
  profileVersion?: {
    metrics: Array<{ weight: number; target: bigint | null; metricDef: { key: string } }>;
  } | null;
}) {
  const dayUpdateMany = vi.fn().mockResolvedValue({ count: opts.claimCount ?? 1 });
  const eventCreate = vi.fn().mockResolvedValue({});
  const metricUpdate = vi.fn().mockResolvedValue({});
  const tx = {
    employeeDailyKpi: { updateMany: dayUpdateMany },
    employeeDailyKpiEvent: { create: eventCreate },
    employeeDailyKpiMetric: { update: metricUpdate },
    // MK01: qabul/bekor bonus-jarima kanaliga tegadi. Bu yerda qoida yo'q
    // (opt-in) — ya'ni pul yozilmaydi; kanalning O'ZI `kpi-accrual-wiring`
    // testida qulflangan.
    hrBonusFineLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const client = {
    employeeDailyKpi: {
      // `metrics` + `profileVersion` — qabulda MUZLATILADIGAN kompozit ball
      // shulardan hisoblanadi (`computeScore`), shuning uchun mock'da ham bor.
      findFirst: vi.fn().mockResolvedValue({
        id: ID,
        state: opts.state ?? 'pending',
        employeeId: opts.employeeId ?? 'emp-1',
        metrics: opts.metrics ?? [
          { metricKey: 'cash_revenue', autoValue: 800n, adjustValue: null, complete: true },
        ],
        // `?? ` EMAS: test ataylab `null` uzatishi mumkin («profil yo'q» holati),
        // va `null ?? default` sukutni qaytarib, o'sha holatni yo'q qilardi.
        profileVersion:
          opts.profileVersion === undefined
            ? { metrics: [{ weight: 100, target: 1000n, metricDef: { key: 'cash_revenue' } }] }
            : opts.profileVersion,
      }),
    },
    employeeDailyKpiMetric: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.metric === undefined
            ? { id: 'm-1', autoValue: 500n, adjustValue: null }
            : opts.metric,
        ),
    },
    // Bonus/jarima qoidalari (MK01) — bu testlarda sozlanmagan.
    hrBonusFineRule: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  // Katalog stub'i: built-in ro'yxat + hisobning o'z ko'rsatkichlari.
  // Testlar built-in bilan ishlaydi, shuning uchun sof katalog yetarli.
  const catalog = {
    resolve: vi.fn().mockResolvedValue(BUILT_IN_CATALOG),
    list: vi.fn().mockResolvedValue([...BUILT_IN_CATALOG.values()]),
    ensureDefs: vi
      .fn()
      .mockResolvedValue(new Map([...BUILT_IN_CATALOG.keys()].map((k) => [k, `def-${k}`]))),
  };
  // MK20 — shablon servisi dublyori (bu yerda shablonsiz yo'l sinaladi;
  // sof funksiya bilan, xulq bir xil qolsin).
  const commentTemplates = {
    resolveComment: vi.fn(async (_acc: string, input: { comment?: string | null }) =>
      materializeComment({ comment: input.comment }),
    ),
  };
  const svc = new DailyKpiAcceptanceService(
    { client } as never,
    catalog as never,
    commentTemplates as never,
  );
  return { svc, dayUpdateMany, eventCreate, metricUpdate, client };
}

describe('optimistik da`vo', () => {
  it('da`vo holat SHARTI bilan qo`yiladi', async () => {
    const { svc, dayUpdateMany } = makeService({ state: 'pending' });
    await svc.transition(MANAGER, ID, 'accept');
    // Shartsiz `update` ishlatilsa, ikki menejer bir vaqtda bosganda ikkalasi
    // ham «muvaffaqiyat» ko'rardi va jurnalda ikki qabul turardi.
    expect(dayUpdateMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      accountId: ACC,
      state: 'pending',
    });
  });

  it('da`vo TEGMASA 409 va jurnalga hech narsa yozilmaydi', async () => {
    const { svc, eventCreate } = makeService({ state: 'pending', claimCount: 0 });
    await expect(svc.transition(MANAGER, ID, 'accept')).rejects.toThrow(/o`zgarib ketdi/);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('da`vo va jurnal BITTA tranzaksiyada', async () => {
    // Jurnalsiz o'tish audit izini teshadi — tranzaksiyadan tashqarida
    // yozilsa, jurnal yozuvi yiqilganda holat baribir o'zgargan bo'lardi.
    const { svc, client } = makeService({ state: 'pending' });
    await svc.transition(MANAGER, ID, 'accept');
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('qabul izi', () => {
  it('qabul qilinganda kim va qachon yoziladi', async () => {
    const { svc, dayUpdateMany } = makeService({ state: 'pending' });
    await svc.transition(MANAGER, ID, 'accept');
    const data = dayUpdateMany.mock.calls[0][0].data;
    expect(data.state).toBe('accepted');
    expect(data.acceptedById).toBe('mgr-1');
    expect(data.acceptedAt).toBeInstanceOf(Date);
  });

  it('navbatga qaytganda qabul izi TOZALANADI', async () => {
    // Aks holda «kim qabul qilgan» savoliga eski javob qolardi.
    const { svc, dayUpdateMany } = makeService({ state: 'accepted' });
    await svc.transition(MANAGER, ID, 'reopen', { reasonCode: 'correction' });
    const data = dayUpdateMany.mock.calls[0][0].data;
    expect(data.state).toBe('pending');
    expect(data.acceptedById).toBeNull();
    expect(data.acceptedAt).toBeNull();
  });

  it('har o`tishda eskalatsiya soati yangilanadi', async () => {
    const { svc, dayUpdateMany } = makeService({ state: 'pending' });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.stateChangedAt).toBeInstanceOf(Date);
  });
});

describe('tuzatma', () => {
  it('`autoValue` ustuniga UMUMAN tegmaydi', async () => {
    const { svc, metricUpdate } = makeService({ state: 'pending' });
    await svc.adjust(MANAGER, ID, {
      metricKey: 'discount_given',
      adjustValue: 123n,
      reasonCode: 'data_error',
    });
    const data = metricUpdate.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['adjustValue', 'reasonCode']);
  });

  it('jurnalga eski/yangi qiymat yoziladi', async () => {
    const { svc, eventCreate } = makeService({ state: 'pending' });
    await svc.adjust(MANAGER, ID, {
      metricKey: 'discount_given',
      adjustValue: 123n,
      reasonCode: 'data_error',
    });
    expect(eventCreate.mock.calls[0][0].data.detail).toMatchObject({
      metricKey: 'discount_given',
      was: null,
      now: '123',
      autoValue: '500',
    });
  });

  it('tuzatma holatni o`zgartirmaydi (from === to)', async () => {
    const { svc, eventCreate } = makeService({ state: 'pending' });
    await svc.adjust(MANAGER, ID, {
      metricKey: 'discount_given',
      adjustValue: 1n,
      reasonCode: 'data_error',
    });
    const d = eventCreate.mock.calls[0][0].data;
    expect(d.fromState).toBe(d.toState);
  });

  it('noma`lum ko`rsatkich 404', async () => {
    const { svc } = makeService({ state: 'pending' });
    await expect(
      svc.adjust(MANAGER, ID, {
        metricKey: 'yoq_bunday_kalit',
        adjustValue: 1n,
        reasonCode: 'data_error',
      }),
    ).rejects.toThrow(/Noma/);
  });

  it('tuzatishda ham holat SHARTI qo`yiladi', async () => {
    // Parallel menejer kunni qabul qilib qo'ysa, tuzatma muzlagan kunga
    // tushib ketmasligi kerak.
    const { svc, dayUpdateMany } = makeService({ state: 'pending' });
    await svc.adjust(MANAGER, ID, {
      metricKey: 'discount_given',
      adjustValue: 1n,
      reasonCode: 'data_error',
    });
    expect(dayUpdateMany.mock.calls[0][0].where.state).toBe('pending');
  });
});

describe('egalik', () => {
  // ⚠️ Javob 403 EMAS, 404: «huquqingiz yo'q» begona kunning MAVJUDLIGINI
  // tasdiqlaydi va id terayotgan xodim kim qaysi kuni rad etilganini bilib
  // olardi (mavjudlik sizishi).

  it('xodim BOSHQANING kuniga tegmaydi', async () => {
    const { svc } = makeService({ state: 'rejected', employeeId: 'emp-boshqa' });
    await expect(
      svc.transition({ accountId: ACC, actor: 'employee', actorId: 'emp-1' }, ID, 'explain'),
    ).rejects.toThrow(/Kun topilmadi/);
  });

  it('xodim O`Z kuniga tushuntirish bera oladi', async () => {
    const { svc, dayUpdateMany } = makeService({ state: 'rejected', employeeId: 'emp-1' });
    await svc.transition({ accountId: ACC, actor: 'employee', actorId: 'emp-1' }, ID, 'explain', {
      comment: 'kassa buzildi',
    });
    expect(dayUpdateMany.mock.calls[0][0].data.state).toBe('pending');
  });
});

describe('kompozit ball — qabulda MUZLATILADI (birlashtirishda qo`shildi)', () => {
  it('qabul qilinganda ball va qamrov ustunga yoziladi', async () => {
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [{ metricKey: 'cash_revenue', autoValue: 800n, adjustValue: null, complete: true }],
      profileVersion: {
        metrics: [{ weight: 100, target: 1000n, metricDef: { key: 'cash_revenue' } }],
      },
    });
    await svc.transition(MANAGER, ID, 'accept');
    const data = dayUpdateMany.mock.calls[0][0].data;
    // 800 ÷ 1000 = 80%
    expect(data.scorePercent).toBe(80);
    expect(data.scoreCoverage).toBe(1);
    expect(data.acceptedById).toBe('mgr-1');
  });

  it('navbatga qaytganda muzlatilgan ball TOZALANADI', async () => {
    // Kun qayta ko'rikda — eski «qabul paytidagi» balli endi hech narsani
    // anglatmaydi va ekranda eskisini ko'rsatib turish yolg'on bo'lardi.
    const { svc, dayUpdateMany } = makeService({ state: 'accepted' });
    await svc.transition(MANAGER, ID, 'reopen', { reasonCode: 'correction' });
    const data = dayUpdateMany.mock.calls[0][0].data;
    expect(data.scorePercent).toBeNull();
    expect(data.scoreCoverage).toBeNull();
    expect(data.acceptedById).toBeNull();
  });

  it('ballanmaydigan kun (profil yo`q) NULL ball bilan qabul qilinadi', async () => {
    // «Ball yo'q» — 0% EMAS. Profilsiz xodimni 0 ball bilan yozib qo'yish
    // uni eng yomon xodimga aylantirib qo'yardi (NULL ≠ 0).
    const { svc, dayUpdateMany } = makeService({ state: 'pending', profileVersion: null });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBeNull();
  });
});

describe('idempotentlik — takror bosish (birlashtirishda qo`shildi)', () => {
  it('qabul qilingan kunni QAYTA qabul qilish 409 bermaydi va jurnalga yozmaydi', async () => {
    const { svc, dayUpdateMany, eventCreate } = makeService({ state: 'accepted' });
    const res = await svc.transition(MANAGER, ID, 'accept');
    // 4M.3 da bonus aynan shu yerdan ikki marta yozilmaydi.
    expect(res).toMatchObject({ to: 'accepted', changed: false });
    expect(dayUpdateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('takror rad etishda ham sabab MAJBURIYligi saqlanadi', async () => {
    // Aks holda «takror» yo'li orqali sababsiz rad etib bo'lardi.
    const { svc } = makeService({ state: 'rejected' });
    await expect(svc.transition(MANAGER, ID, 'reject')).rejects.toThrow();
  });

  it('qayta ochish idempotent EMAS — har ochish yangi hodisa', async () => {
    const { svc, eventCreate } = makeService({ state: 'pending' });
    // `pending → pending` reopen yo'li yo'q: 409 bo'lishi kerak.
    await expect(
      svc.transition(MANAGER, ID, 'reopen', { reasonCode: 'correction' }),
    ).rejects.toThrow();
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

/**
 * KPI-03 — BALL MUHRLANGAN MAQSADDAN o'qiladi.
 *
 * Muhr yozilib, o'quvchi uni ko'rmasa butun faza vacuous bo'lardi: kun
 * `EmployeeKpiTarget` maqsadi bilan hisoblanib, ballda profil raqami turardi.
 * Profil sukuti (1000n, og'irlik 100) barcha testlarda bir xil — farqni
 * FAQAT muhr keltiradi.
 */
describe('KPI-03 — kun muhri profil maqsadidan USTUN', () => {
  const metric = (over: Record<string, unknown> = {}) => ({
    metricKey: 'cash_revenue',
    autoValue: 800n,
    adjustValue: null,
    complete: true,
    ...over,
  });

  it('muhrlangan maqsad bo`yicha ball hisoblanadi (profil raqami emas)', async () => {
    // Muhr 800 → 800/800 = 100%. Profil 1000 bo'lsa 80% chiqardi.
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [metric({ targetValue: 800n, targetSource: 'employee_target' })],
    });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBe(100);
  });

  it('MUHRLANMAGAN qator avvalgidek PROFIL maqsadiga tushadi (regress)', async () => {
    // Migratsiyadan oldin hisoblangan kunlar: 800/1000 = 80%.
    const { svc, dayUpdateMany } = makeService({ state: 'pending', metrics: [metric()] });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBe(80);
  });

  it('muhrlangan «maqsad YO`Q» profilga QAYTA TUSHMAYDI (ball yo`q, 0 emas)', async () => {
    // 🔴 Muhr `none` = «o'sha kuni bu ko'rsatkichga maqsad qo'yilmagan edi».
    // Profilga qaytilsa bugungi profil maqsadi o'tgan kunga qo'llanardi — ya'ni
    // aynan «tarixni qayta yozish». Ball NULL bo'ladi, 0 EMAS.
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [metric({ targetValue: null, targetSource: 'none' })],
    });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBeNull();
  });
});

/**
 * KPI-05 — BALL MUHRLANGAN OG'IRLIKDAN o'qiladi.
 *
 * Og'irlik endi `EmployeeKpiTarget` dan ham kelishi mumkin, u qatlam esa
 * versiyalanmaydi. O'quvchi muhrni ko'rmasa, menejerning bugungi og'irlik
 * tahriri o'tgan kunlarning ballini QAYTA YOZARDI (KPI-03 maqsad muhri bilan
 * bir xil sabab). Profil sukuti (og'irlik 100, maqsad 1000n) barcha
 * testlarda bir xil — farqni FAQAT muhr keltiradi.
 */
describe('KPI-05 — kun muhridagi og`irlik profil og`irligidan USTUN', () => {
  const metric = (over: Record<string, unknown> = {}) => ({
    metricKey: 'cash_revenue',
    autoValue: 800n,
    adjustValue: null,
    complete: true,
    ...over,
  });

  it('muhrlangan NOL og`irlik ballga kirmaydi (profil 100 ni yengadi)', async () => {
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [metric({ weightApplied: 0, weightSource: 'employee_target' })],
    });
    await svc.transition(MANAGER, ID, 'accept');
    // Profil og'irligi o'qilsa 80% chiqardi.
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBeNull();
  });

  it('🔴 muhrlangan «og`irlik YO`Q» profil og`irligiga QAYTMAYDI', async () => {
    // Menejer KPI'ni ataylab ballsiz qo'ygan kun. Profilga qaytilsa u kun
    // jimgina ballanardi — «og'irlik ixtiyoriy» va'dasi buzilardi.
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [metric({ weightApplied: null, weightSource: 'employee_target' })],
    });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBeNull();
  });

  it('MUHRLANMAGAN qator avvalgidek PROFIL og`irligiga tushadi (regress)', async () => {
    // Migratsiyadan oldin hisoblangan kunlar: og'irlik 100 → 800/1000 = 80%.
    const { svc, dayUpdateMany } = makeService({ state: 'pending', metrics: [metric()] });
    await svc.transition(MANAGER, ID, 'accept');
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBe(80);
  });

  it('muhrlangan og`irliklar NISBATI ballni belgilaydi (profilniki emas)', async () => {
    const { svc, dayUpdateMany } = makeService({
      state: 'pending',
      metrics: [
        metric({ weightApplied: 90, weightSource: 'employee_target' }), // 80%
        metric({
          metricKey: 'late_minutes',
          autoValue: 10n,
          weightApplied: 10,
          weightSource: 'employee_target',
        }), // 100%
      ],
      profileVersion: {
        metrics: [
          { weight: 50, target: 1000n, metricDef: { key: 'cash_revenue' } },
          { weight: 50, target: 10n, metricDef: { key: 'late_minutes' } },
        ],
      },
    });
    await svc.transition(MANAGER, ID, 'accept');
    // (90×80 + 10×100) ÷ 100 = 82. Profil 50/50 bo'lsa 90 chiqardi.
    expect(dayUpdateMany.mock.calls[0][0].data.scorePercent).toBe(82);
  });
});
