import { describe, expect, it, vi } from 'vitest';
import { EmployeeKpiTargetService } from './employee-kpi-target.service.js';
import { BUILT_IN_CATALOG, type KpiMetricDef } from './kpi-metrics.js';

/**
 * EmployeeKpiTargetService — «biriktirilgan KPI» CRUD (KPI-02).
 *
 * Qulflanadigan shartnomalar (buzilsa JIMGINA noto'g'ri ishlaydi):
 *   1. **so'm → tiyin** servisda bo'ladi, FE'da emas. Metrika birligi
 *      (`money|count|…`) va chegara birligi ikki xil lug'at — aralashsa pul
 *      100× noto'g'ri saqlanadi ([[manager-kpi-unit-vocabularies]]).
 *   2. `unit` va `currency` KLIENTDAN OLINMAYDI — katalogdan. Aks holda
 *      `money` qatoriga `currency: null` yozib, DB CHECK'iga urilardi (yoki
 *      «5 dona UZS da» kabi qator paydo bo'lardi).
 *   3. `weight` **IXTIYORIY va NULL** — 0 EMAS. NULL = ballash yo'lidan
 *      tashqarida; 0 = «ballandi va nolga arziydi». Bu farq butun
 *      «og'irlik ixtiyoriy» qarorining yagona manbai.
 *   4. Har mutatsiya **append-only event** yozadi va payload HAVOLA emas,
 *      o'sha ondagi qiymatlar MATNI ([[journal-copies-text-not-reference]]) —
 *      qator o'chgach ham «nima edi» ma'lum qoladi ([[bulk-update-wrote-no-audit]]).
 *   5. `/done` faqat dvigatel HISOBLAY OLMAYDIGAN metrikada. O'lchanadiganda
 *      fakt dvigateldan keladi — ikki manba = ikki haqiqat.
 *   6. Fakt `null` bo'lsa `null` qoladi — 0 ga aylantirilmaydi
 *      ([[data-quality-flag-layer]]: o'lchanmagan ≠ nol).
 */

const ACCOUNT = 'acc-1';
const EMP = 'emp-1';
const ACTOR = 'emp-actor';

/** Built-in, dvigatel hisoblaydigan, PUL metrikasi. */
const MONEY_KEY = 'cash_revenue';
/** Built-in, dvigatel hisoblaydigan, SANOQ metrikasi. */
const COUNT_KEY = 'receipt_count';
/** Hisobning O'Z (qo'lda) ko'rsatkichi — dvigatel hisoblay olmaydi. */
const MANUAL_KEY = 'custom_mijoz_shikoyati';

const MANUAL_DEF: KpiMetricDef = {
  key: MANUAL_KEY,
  labelUz: 'Mijoz shikoyati',
  labelRu: 'Жалобы клиентов',
  unit: 'count',
  direction: 'lower_better',
  source: 'manual',
  perHour: false,
};

function catalogWithManual() {
  const merged = new Map(BUILT_IN_CATALOG);
  merged.set(MANUAL_KEY, MANUAL_DEF);
  return merged;
}

interface RowOverrides {
  id?: string;
  metricKey?: string;
  unit?: string;
  period?: string;
  targetValue?: bigint | null;
  weight?: unknown;
  currency?: string | null;
  manualDoneAt?: Date | null;
  active?: boolean;
}

function row(o: RowOverrides = {}) {
  return {
    id: o.id ?? 'tgt-1',
    accountId: ACCOUNT,
    employeeId: EMP,
    metricKey: o.metricKey ?? MONEY_KEY,
    unit: o.unit ?? 'money',
    targetValue: o.targetValue === undefined ? 500_000n : o.targetValue,
    period: o.period ?? 'daily',
    weight: o.weight === undefined ? null : o.weight,
    currency: o.currency === undefined ? 'UZS' : o.currency,
    manualDoneAt: o.manualDoneAt ?? null,
    active: o.active ?? true,
    createdById: ACTOR,
    createdAt: new Date('2026-08-10T00:00:00Z'),
    updatedAt: new Date('2026-08-10T00:00:00Z'),
  };
}

function makeService(
  opts: {
    existing?: ReturnType<typeof row> | null;
    targets?: ReturnType<typeof row>[];
    daily?: unknown;
    accountCurrency?: string;
    employeeExists?: boolean;
  } = {},
) {
  const targetCreate = vi.fn().mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    ...row(),
    ...a.data,
  }));
  const targetUpdate = vi.fn().mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    ...(opts.existing ?? row()),
    ...a.data,
  }));
  const targetDelete = vi.fn().mockResolvedValue({});
  const eventCreate = vi.fn().mockResolvedValue({ id: 'ev-1' });

  const tx = {
    employeeKpiTarget: {
      create: targetCreate,
      update: targetUpdate,
      delete: targetDelete,
      findFirst: vi.fn().mockResolvedValue(opts.existing === undefined ? row() : opts.existing),
    },
    employeeKpiTargetEvent: { create: eventCreate },
  };

  const client = {
    employee: {
      findFirst: vi
        .fn()
        .mockResolvedValue(opts.employeeExists === false ? null : { id: EMP, name: 'Ali' }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue({ currency: opts.accountCurrency ?? 'UZS' }),
    },
    employeeKpiTarget: {
      findMany: vi.fn().mockResolvedValue(opts.targets ?? []),
      findFirst: vi.fn().mockResolvedValue(opts.existing === undefined ? row() : opts.existing),
    },
    // Fakt bitta yo'ldan o'qiladi (`list` ham, `listAll` ham) — ikki nusxa
    // bo'lsa biri jimgina bir shoxni yo'qotardi ([[copy-paste-loses-a-branch]]).
    employeeDailyKpi: {
      findMany: vi
        .fn()
        .mockResolvedValue(opts.daily ? [{ employeeId: EMP, ...(opts.daily as object) }] : []),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const catalog = { resolve: vi.fn().mockResolvedValue(catalogWithManual()) };
  const svc = new EmployeeKpiTargetService({ client } as never, catalog as never);
  return { svc, client, tx, targetCreate, targetUpdate, targetDelete, eventCreate, catalog };
}

/** Oxirgi yozilgan event payloadi. */
function lastEvent(eventCreate: ReturnType<typeof vi.fn>) {
  const calls = eventCreate.mock.calls;
  return calls[calls.length - 1]?.[0]?.data as Record<string, unknown>;
}

describe('create — biriktirilgan KPI qo`shish', () => {
  it('noma`lum `metricKey` ni RAD etadi (katalog tekshiruvi)', async () => {
    const { svc } = makeService();
    await expect(
      svc.create(ACCOUNT, ACTOR, EMP, { metricKey: 'yolgon_kalit', period: 'daily' }),
    ).rejects.toThrow(/Noma.?lum ko.?rsatkich/);
  });

  it('xodim topilmasa RAD etadi', async () => {
    const { svc } = makeService({ employeeExists: false });
    await expect(
      svc.create(ACCOUNT, ACTOR, EMP, { metricKey: MONEY_KEY, period: 'daily' }),
    ).rejects.toThrow(/topilmadi/);
  });

  it('🔴 PUL metrikasi: maqsad SO`MDA keladi, TIYINDA saqlanadi (100×)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: MONEY_KEY,
      period: 'daily',
      targetValue: '5000',
    });
    const data = targetCreate.mock.calls[0]?.[0].data;
    expect(data.targetValue).toBe(500_000n);
    expect(typeof data.targetValue).toBe('bigint');
  });

  it('🔴 pul maqsadida tiyin kasri ham yo`qolmaydi (1234.56 so`m → 123456)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: MONEY_KEY,
      period: 'daily',
      targetValue: '1234.56',
    });
    expect(targetCreate.mock.calls[0]?.[0].data.targetValue).toBe(123_456n);
  });

  it('SANOQ metrikasiga KASRLI maqsad rad etiladi (yashirin yaxlitlash yo`q)', async () => {
    const { svc } = makeService();
    await expect(
      svc.create(ACCOUNT, ACTOR, EMP, {
        metricKey: COUNT_KEY,
        period: 'daily',
        targetValue: '40.5',
      }),
    ).rejects.toThrow(/butun son/i);
  });

  it('SANOQ metrikasi 100× QILINMAYDI (birlik lug`ati aralashmaydi)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: COUNT_KEY,
      period: 'daily',
      targetValue: '40',
    });
    expect(targetCreate.mock.calls[0]?.[0].data.targetValue).toBe(40n);
  });

  it('`unit` katalogdan olinadi — klientdan EMAS', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: COUNT_KEY,
      period: 'daily',
      // Klient «money» deb yuborsa ham katalog g'olib (aks holda DB CHECK).
      unit: 'money',
      targetValue: '7',
    } as never);
    expect(targetCreate.mock.calls[0]?.[0].data.unit).toBe('count');
  });

  it('pul qatoriga valyuta HISOBDAN qo`yiladi, sanoqda NULL (DB CHECK shartnomasi)', async () => {
    const money = makeService();
    await money.svc.create(ACCOUNT, ACTOR, EMP, { metricKey: MONEY_KEY, period: 'daily' });
    expect(money.targetCreate.mock.calls[0]?.[0].data.currency).toBe('UZS');

    const count = makeService();
    await count.svc.create(ACCOUNT, ACTOR, EMP, { metricKey: COUNT_KEY, period: 'daily' });
    expect(count.targetCreate.mock.calls[0]?.[0].data.currency).toBeNull();
  });

  it('🔴 og`irlik berilmasa NULL — 0 EMAS («ballash yo`lidan tashqarida»)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, { metricKey: COUNT_KEY, period: 'daily' });
    expect(targetCreate.mock.calls[0]?.[0].data.weight).toBeNull();
  });

  it('og`irlik berilsa aynan yoziladi (formal ballash yo`li buzilmagan)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: COUNT_KEY,
      period: 'daily',
      weight: 40,
    });
    expect(targetCreate.mock.calls[0]?.[0].data.weight).toBe(40);
  });

  it('maqsad berilmasa `targetValue` NULL (raqamsiz «todo»)', async () => {
    const { svc, targetCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, { metricKey: COUNT_KEY, period: 'weekly' });
    expect(targetCreate.mock.calls[0]?.[0].data.targetValue).toBeNull();
  });

  it('`created` eventi yoziladi — payload QIYMATLAR MATNI', async () => {
    const { svc, eventCreate } = makeService();
    await svc.create(ACCOUNT, ACTOR, EMP, {
      metricKey: MONEY_KEY,
      period: 'daily',
      targetValue: '5000',
      weight: 30,
    });
    const ev = lastEvent(eventCreate);
    expect(ev.action).toBe('created');
    expect(ev.employeeId).toBe(EMP);
    expect(ev.actorId).toBe(ACTOR);
    const payload = ev.payloadJson as Record<string, unknown>;
    expect(payload.metricKey).toBe(MONEY_KEY);
    // Matn: BigInt JSON'ga sig'maydi, string bo'lib ketishi shart.
    expect(payload.targetValue).toBe('500000');
    expect(payload.weight).toBe(30);
    expect(payload.period).toBe('daily');
  });

  it('takroriy (xodim, metrika, davr) tushunarli xato beradi', async () => {
    const { svc, targetCreate } = makeService();
    targetCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(
      svc.create(ACCOUNT, ACTOR, EMP, { metricKey: MONEY_KEY, period: 'daily' }),
    ).rejects.toThrow(/allaqachon|mavjud/i);
  });
});

describe('update — tahrir', () => {
  it('cross-tenant: begona hisob qatorini topmaydi (404)', async () => {
    const { svc } = makeService({ existing: null });
    await expect(svc.update(ACCOUNT, ACTOR, 'tgt-x', { weight: 10 })).rejects.toThrow(/topilmadi/);
  });

  it('maqsadni so`mdan tiyinga o`giradi (birlik SAQLANGAN qatordan)', async () => {
    const { svc, targetUpdate } = makeService({ existing: row({ unit: 'money' }) });
    await svc.update(ACCOUNT, ACTOR, 'tgt-1', { targetValue: '250' });
    expect(targetUpdate.mock.calls[0]?.[0].data.targetValue).toBe(25_000n);
  });

  it('og`irlikni NULL ga qaytarish mumkin (ballashdan chiqarish)', async () => {
    const { svc, targetUpdate } = makeService({ existing: row({ weight: 40 }) });
    await svc.update(ACCOUNT, ACTOR, 'tgt-1', { weight: null });
    expect(targetUpdate.mock.calls[0]?.[0].data.weight).toBeNull();
  });

  it('berilmagan maydon TEGILMAYDI (qisman patch)', async () => {
    const { svc, targetUpdate } = makeService({ existing: row({ weight: 40 }) });
    await svc.update(ACCOUNT, ACTOR, 'tgt-1', { active: false });
    const data = targetUpdate.mock.calls[0]?.[0].data;
    expect(data.active).toBe(false);
    expect(data).not.toHaveProperty('weight');
    expect(data).not.toHaveProperty('targetValue');
  });

  it('`updated` eventi oldingi VA yangi qiymatlar matnini saqlaydi', async () => {
    const { svc, eventCreate } = makeService({ existing: row({ targetValue: 100n }) });
    await svc.update(ACCOUNT, ACTOR, 'tgt-1', { targetValue: '3' });
    const ev = lastEvent(eventCreate);
    expect(ev.action).toBe('updated');
    const payload = ev.payloadJson as Record<string, unknown>;
    expect((payload.before as Record<string, unknown>).targetValue).toBe('100');
    expect((payload.after as Record<string, unknown>).targetValue).toBe('300');
  });

  it('`period` o`zgarsa ham `unit` klientdan olinmaydi', async () => {
    const { svc, targetUpdate } = makeService({ existing: row({ unit: 'count' }) });
    await svc.update(ACCOUNT, ACTOR, 'tgt-1', { period: 'monthly', unit: 'money' } as never);
    const data = targetUpdate.mock.calls[0]?.[0].data;
    expect(data.period).toBe('monthly');
    expect(data).not.toHaveProperty('unit');
  });
});

describe('remove — o`chirish (qator ketadi, event QOLADI)', () => {
  it('cross-tenant: begona qatorni o`chirmaydi', async () => {
    const { svc, targetDelete } = makeService({ existing: null });
    await expect(svc.remove(ACCOUNT, ACTOR, 'tgt-x')).rejects.toThrow(/topilmadi/);
    expect(targetDelete).not.toHaveBeenCalled();
  });

  it('qatorni o`chiradi va `deleted` eventini QOLDIRADI', async () => {
    const { svc, targetDelete, eventCreate } = makeService({
      existing: row({ targetValue: 700n, metricKey: COUNT_KEY, unit: 'count', currency: null }),
    });
    await svc.remove(ACCOUNT, ACTOR, 'tgt-1');
    expect(targetDelete).toHaveBeenCalledWith({ where: { id: 'tgt-1' } });

    const ev = lastEvent(eventCreate);
    expect(ev.action).toBe('deleted');
    // 🔴 Havola NULL — qator o'chgani uchun; javob faqat payload matnida.
    expect(ev.targetId).toBeNull();
    expect(ev.employeeId).toBe(EMP);
    const payload = ev.payloadJson as Record<string, unknown>;
    expect(payload.metricKey).toBe(COUNT_KEY);
    expect(payload.targetValue).toBe('700');
  });

  it('event o`chirishdan OLDIN yoziladi (tranzaksiya ichida yo`qolmaydi)', async () => {
    const order: string[] = [];
    const { svc, targetDelete, eventCreate } = makeService();
    eventCreate.mockImplementation(async () => {
      order.push('event');
      return { id: 'ev' };
    });
    targetDelete.mockImplementation(async () => {
      order.push('delete');
      return {};
    });
    await svc.remove(ACCOUNT, ACTOR, 'tgt-1');
    expect(order).toEqual(['event', 'delete']);
  });
});

describe('setDone — qo`lda metrikaning «bajarildi» belgisi', () => {
  it('🔴 O`LCHANADIGAN metrikada RAD etiladi (fakt dvigateldan)', async () => {
    const { svc } = makeService({ existing: row({ metricKey: MONEY_KEY }) });
    await expect(svc.setDone(ACCOUNT, ACTOR, 'tgt-1', true)).rejects.toThrow(
      /hisoblaydi|o.?lchanadi/i,
    );
  });

  it('qo`lda metrikada `manualDoneAt` qo`yiladi + `marked_done` eventi', async () => {
    const { svc, targetUpdate, eventCreate } = makeService({
      existing: row({ metricKey: MANUAL_KEY, unit: 'count', currency: null }),
    });
    await svc.setDone(ACCOUNT, ACTOR, 'tgt-1', true);
    expect(targetUpdate.mock.calls[0]?.[0].data.manualDoneAt).toBeInstanceOf(Date);
    expect(lastEvent(eventCreate).action).toBe('marked_done');
  });

  it('bekor qilinsa `manualDoneAt` NULL + `reopened` eventi', async () => {
    const { svc, targetUpdate, eventCreate } = makeService({
      existing: row({
        metricKey: MANUAL_KEY,
        unit: 'count',
        currency: null,
        manualDoneAt: new Date('2026-08-09T10:00:00Z'),
      }),
    });
    await svc.setDone(ACCOUNT, ACTOR, 'tgt-1', false);
    expect(targetUpdate.mock.calls[0]?.[0].data.manualDoneAt).toBeNull();
    expect(lastEvent(eventCreate).action).toBe('reopened');
  });

  it('cross-tenant: begona qatorni belgilamaydi', async () => {
    const { svc } = makeService({ existing: null });
    await expect(svc.setDone(ACCOUNT, ACTOR, 'tgt-x', true)).rejects.toThrow(/topilmadi/);
  });
});

describe('list — xodimning biriktirilgan KPI`lari + oxirgi fakt', () => {
  it('metrika yorlig`i va birligini katalogdan qo`shadi', async () => {
    const { svc } = makeService({ targets: [row({ metricKey: MONEY_KEY })] });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.metricKey).toBe(MONEY_KEY);
    expect(r?.labelRu).toBe('Выручка кассы');
    expect(r?.unit).toBe('money');
    expect(r?.measurable).toBe(true);
  });

  it('qo`lda metrika `measurable: false` — ekran «bajarildi» tugmasini shundan biladi', async () => {
    const { svc } = makeService({
      targets: [row({ metricKey: MANUAL_KEY, unit: 'count', currency: null })],
    });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.measurable).toBe(false);
  });

  it('🔴 fakt O`LCHANMAGAN bo`lsa NULL qoladi — 0 ga aylanmaydi', async () => {
    const { svc } = makeService({
      targets: [row({ metricKey: COUNT_KEY, unit: 'count', currency: null })],
      daily: {
        date: new Date('2026-08-09T00:00:00Z'),
        metrics: [{ metricKey: COUNT_KEY, autoValue: null, adjustValue: null, complete: false }],
      },
    });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.lastFactMinor).toBeNull();
    expect(r?.lastFactComplete).toBe(false);
  });

  it('fakt 0 bo`lsa "0" qaytadi (NULL bilan bir xil emas)', async () => {
    const { svc } = makeService({
      targets: [row({ metricKey: COUNT_KEY, unit: 'count', currency: null })],
      daily: {
        date: new Date('2026-08-09T00:00:00Z'),
        metrics: [{ metricKey: COUNT_KEY, autoValue: 0n, adjustValue: null, complete: true }],
      },
    });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.lastFactMinor).toBe('0');
  });

  it('menejer tuzatmasi (`adjustValue`) avto-qiymatdan USTUN', async () => {
    const { svc } = makeService({
      targets: [row({ metricKey: COUNT_KEY, unit: 'count', currency: null })],
      daily: {
        date: new Date('2026-08-09T00:00:00Z'),
        metrics: [{ metricKey: COUNT_KEY, autoValue: 5n, adjustValue: 9n, complete: true }],
      },
    });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.lastFactMinor).toBe('9');
  });

  it('kunlik qator umuman bo`lmasa fakt NULL (bo`sh ro`yxat emas)', async () => {
    const { svc } = makeService({ targets: [row()], daily: null });
    const [r] = await svc.list(ACCOUNT, EMP);
    expect(r?.lastFactMinor).toBeNull();
    expect(r?.lastFactComplete).toBeNull();
  });

  it('so`rov hisob VA xodim bo`yicha cheklangan (cross-tenant)', async () => {
    const { svc, client } = makeService({ targets: [] });
    await svc.list(ACCOUNT, EMP);
    expect(client.employeeKpiTarget.findMany.mock.calls[0]?.[0].where).toMatchObject({
      accountId: ACCOUNT,
      employeeId: EMP,
    });
  });

  it('og`irliksiz qator ro`yxatda QOLADI (kuzatiladi, ballanmaydi)', async () => {
    const { svc } = makeService({ targets: [row({ weight: null })] });
    const rows = await svc.list(ACCOUNT, EMP);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.weight).toBeNull();
  });
});

describe('listAll — menejer «barcha xodimlar KPI`lari» ekrani', () => {
  it('xodim filtri berilmasa butun hisob bo`yicha, lekin accountId majburiy', async () => {
    const { svc, client } = makeService({ targets: [] });
    await svc.listAll(ACCOUNT, {});
    const where = client.employeeKpiTarget.findMany.mock.calls[0]?.[0].where;
    expect(where).toMatchObject({ accountId: ACCOUNT });
    expect(where).not.toHaveProperty('employeeId');
  });

  it('davr filtri so`rovga tushadi', async () => {
    const { svc, client } = makeService({ targets: [] });
    await svc.listAll(ACCOUNT, { period: 'weekly' });
    expect(client.employeeKpiTarget.findMany.mock.calls[0]?.[0].where).toMatchObject({
      period: 'weekly',
    });
  });

  it('xodim filtri so`rovga tushadi', async () => {
    const { svc, client } = makeService({ targets: [] });
    await svc.listAll(ACCOUNT, { employeeId: EMP });
    expect(client.employeeKpiTarget.findMany.mock.calls[0]?.[0].where).toMatchObject({
      employeeId: EMP,
    });
  });
});
