import { describe, expect, it, vi } from 'vitest';
import { DataQualityService } from './data-quality.service.js';

/**
 * MK09 — ma'lumot sifati paneli, ULANISH testlari (menejer KPI TZ §2.4/§0.2).
 *
 * Sof qoida `report/metrics/data-quality.ts` da qulflangan. Bu yerda faqat
 * mock'siz chiqarib bo'lmaydigan shartnomalar:
 *   1. 🔴 NULL tan narxli chek «yig'ilmagan» deb sanaladi, 0 deb EMAS;
 *   2. 100% to'liq ma'lumotda umumiy bayroq «to'liq»;
 *   3. paneldagi foiz jonli sanoq bilan MOS (ekran o'z formulasini yozmaydi);
 *   4. o'lchov bo'lmagan davrda foiz `null`, `0%` emas;
 *   5. sana chegaralari: DATE-ustun yorlig'i ≠ timestamptz instanti.
 */

const ACC = 'acc-1';

/** Katalog: ikki built-in + bitta hisobning o'z ko'rsatkichi. */
const CATALOG = new Map([
  [
    'cash_revenue',
    {
      key: 'cash_revenue',
      labelUz: 'Kassa tushumi',
      labelRu: 'Выручка кассы',
      unit: 'money',
      direction: 'higher_better',
      source: 'cashier',
      perHour: true,
    },
  ],
  [
    'cash_gross_profit',
    {
      key: 'cash_gross_profit',
      labelUz: 'Kassa yalpi foydasi',
      labelRu: 'Валовая прибыль кассы',
      unit: 'money',
      direction: 'higher_better',
      source: 'cashier',
      perHour: true,
    },
  ],
  [
    'custom_ustoz',
    {
      key: 'custom_ustoz',
      labelUz: 'Ustoz bahosi',
      labelRu: 'Оценка наставника',
      unit: 'count',
      direction: 'higher_better',
      source: 'manual',
      perHour: false,
    },
  ],
]);

interface Scenario {
  /** `[metricKey, complete, jami, o'lchangan]` */
  metricGroups?: Array<[string, boolean, number, number]>;
  /** `[state, soni]` */
  stateGroups?: Array<[string, number]>;
  receipts?: number;
  receiptsMissingCost?: number;
  daysWithoutProfile?: number;
}

function makeService(s: Scenario) {
  const metricGroupBy = vi.fn().mockResolvedValue(
    (s.metricGroups ?? []).map(([metricKey, complete, total, measured]) => ({
      metricKey,
      complete,
      _count: { _all: total, autoValue: measured },
    })),
  );
  const dayGroupBy = vi.fn().mockResolvedValue(
    (s.stateGroups ?? []).map(([state, count]) => ({
      state,
      _count: { _all: count },
    })),
  );
  const dayCount = vi.fn().mockResolvedValue(s.daysWithoutProfile ?? 0);
  const saleCount = vi
    .fn()
    .mockResolvedValueOnce(s.receipts ?? 0)
    .mockResolvedValueOnce(s.receiptsMissingCost ?? 0);

  const client = {
    employeeDailyKpiMetric: { groupBy: metricGroupBy },
    employeeDailyKpi: { groupBy: dayGroupBy, count: dayCount },
    retailSale: { count: saleCount },
  };
  const catalog = { resolve: vi.fn().mockResolvedValue(CATALOG) };
  const service = new DataQualityService({ client } as never, catalog as never);
  return { service, metricGroupBy, dayGroupBy, saleCount };
}

const RANGE = { from: '2026-07-01', to: '2026-07-31' };

describe('MK09 — 🔴 NULL tan narx «yig`ilmagan», 0 EMAS', () => {
  it('tan narxi yo`q cheklar ulushi ko`rsatiladi va blok «qisman» bo`ladi', async () => {
    const { service } = makeService({ receipts: 40, receiptsMissingCost: 7 });
    const panel = await service.panel(ACC, RANGE);

    expect(panel.cost.receipts).toBe(40);
    expect(panel.cost.receiptsMissingCost).toBe(7);
    // 7/40 — nolga aylantirilmagan, aynan o'lchangan ulush.
    expect(panel.cost.missingPercent).toBe(17.5);
    expect(panel.cost.level).toBe('partial');
  });

  it('hech bir chekda tan narx yo`q bo`lsa — blok «yig`ilmagan», «to`liq» EMAS', async () => {
    const { service } = makeService({ receipts: 12, receiptsMissingCost: 12 });
    const panel = await service.panel(ACC, RANGE);
    expect(panel.cost.missingPercent).toBe(100);
    expect(panel.cost.level).toBe('uncollected');
  });

  it('barcha qatorlari NULL bo`lgan ko`rsatkich «manbasi yo`q» ro`yxatiga tushadi', async () => {
    const { service } = makeService({
      // `custom_ustoz` — 30 qator ochilgan, hammasi o'lchanmagan (manual).
      metricGroups: [
        ['cash_revenue', true, 30, 30],
        ['custom_ustoz', false, 30, 0],
      ],
    });
    const panel = await service.panel(ACC, RANGE);

    const ustoz = panel.metrics.find((m) => m.key === 'custom_ustoz');
    expect(ustoz?.level).toBe('uncollected');
    expect(ustoz?.measured).toBe(0);
    // Qator soni 30 bo'lsa ham, o'lchov nol — «0 ball» deb ko'rsatilmaydi.
    expect(ustoz?.coveragePercent).toBe(0);
    expect(panel.unsourced.map((m) => m.key)).toContain('custom_ustoz');
    expect(panel.unsourced.map((m) => m.key)).not.toContain('cash_revenue');
  });

  it('katalogda bor-u umuman qatori yo`q ko`rsatkich ham «manbasi yo`q»', async () => {
    const { service } = makeService({ metricGroups: [['cash_revenue', true, 30, 30]] });
    const panel = await service.panel(ACC, RANGE);

    const profit = panel.metrics.find((m) => m.key === 'cash_gross_profit');
    expect(profit?.total).toBe(0);
    expect(profit?.level).toBe('uncollected');
    // Mahraj yo'q ⇒ qamrov foizi NULL, «0%» emas.
    expect(profit?.coveragePercent).toBeNull();
    expect(panel.unsourced.map((m) => m.key)).toContain('cash_gross_profit');
  });

  it('katalogdan tashqari (arxivlangan) ko`rsatkich yashirilmaydi', async () => {
    const { service } = makeService({ metricGroups: [['custom_eski', true, 10, 10]] });
    const panel = await service.panel(ACC, RANGE);
    const old = panel.metrics.find((m) => m.key === 'custom_eski');
    expect(old).toBeDefined();
    expect(old?.level).toBe('complete');
  });
});

describe('MK09 — 100% to`liq ma`lumotda bayroq «to`liq»', () => {
  it('barcha ko`rsatkich to`liq, chek tan narxi bor, kunlar qabul qilingan', async () => {
    const { service } = makeService({
      metricGroups: [
        ['cash_revenue', true, 30, 30],
        ['cash_gross_profit', true, 30, 30],
        ['custom_ustoz', true, 30, 30],
      ],
      stateGroups: [
        ['accepted', 25],
        ['force_accepted', 5],
      ],
      receipts: 40,
      receiptsMissingCost: 0,
    });
    const panel = await service.panel(ACC, RANGE);

    expect(panel.overall).toBe('complete');
    expect(panel.cost.level).toBe('complete');
    expect(panel.cost.missingPercent).toBe(0);
    expect(panel.acceptance.unaccepted).toBe(0);
    expect(panel.acceptance.unacceptedPercent).toBe(0);
    expect(panel.unsourced).toEqual([]);
  });

  it('bitta chala ko`rsatkich butun panelni «qisman» qiladi', async () => {
    const { service } = makeService({
      metricGroups: [
        ['cash_revenue', true, 30, 30],
        // Bir qismi chala: tan narx muzlatilmagan qatorlar.
        ['cash_gross_profit', false, 4, 4],
        ['cash_gross_profit', true, 26, 26],
        ['custom_ustoz', true, 30, 30],
      ],
      receipts: 40,
      receiptsMissingCost: 0,
    });
    const panel = await service.panel(ACC, RANGE);

    const profit = panel.metrics.find((m) => m.key === 'cash_gross_profit');
    expect(profit?.total).toBe(30);
    expect(profit?.measured).toBe(30);
    expect(profit?.partial).toBe(4);
    expect(profit?.level).toBe('partial');
    expect(panel.overall).toBe('partial');
  });
});

describe('MK09 — qabul qilinmagan kunlar ulushi jonli sanoq bilan MOS', () => {
  it('qabul qilingan = `accepted` + `force_accepted`, qolgani qabul qilinmagan', async () => {
    const { service } = makeService({
      stateGroups: [
        ['accepted', 12],
        ['force_accepted', 3],
        ['pending', 4],
        ['rejected', 1],
        ['stale', 2],
        ['escalated', 1],
        ['computed', 17],
      ],
    });
    const panel = await service.panel(ACC, RANGE);

    const total = 12 + 3 + 4 + 1 + 2 + 1 + 17;
    expect(panel.acceptance.days).toBe(total);
    expect(panel.acceptance.accepted).toBe(15);
    expect(panel.acceptance.unaccepted).toBe(total - 15);
    // Ekran o'z formulasini yozmasin: foiz shu yerda hisoblanadi va sanoqlar
    // bilan mos bo'lishi kerak.
    // 25 / 40 = 62.5% — qo'lda sanab tekshirilgan.
    expect(panel.acceptance.unacceptedPercent).toBe(62.5);
    expect(panel.acceptance.byState).toEqual(
      expect.arrayContaining([{ state: 'pending', count: 4 }]),
    );
  });

  it('holatlar ro`yxati kamayib qolmaydi — jami byState yig`indisiga teng', async () => {
    const { service } = makeService({
      stateGroups: [
        ['accepted', 2],
        ['pending', 3],
      ],
    });
    const panel = await service.panel(ACC, RANGE);
    const sum = panel.acceptance.byState.reduce((a, s) => a + s.count, 0);
    expect(sum).toBe(panel.acceptance.days);
  });
});

describe('MK09 — o`lchov bo`lmagan davr: foiz NULL, 0% EMAS', () => {
  it('bo`sh davrda hamma ulush null va umumiy bayroq «yig`ilmagan»', async () => {
    const { service } = makeService({});
    const panel = await service.panel(ACC, RANGE);

    expect(panel.cost.receipts).toBe(0);
    expect(panel.cost.missingPercent).toBeNull();
    expect(panel.acceptance.days).toBe(0);
    expect(panel.acceptance.unacceptedPercent).toBeNull();
    expect(panel.overall).toBe('uncollected');
  });
});

describe('MK09 — sana chegarasi: DATE yorlig`i ≠ instant', () => {
  it('KPI kunlari DATE yorlig`i bilan, cheklar Toshkent instanti bilan so`raladi', async () => {
    const { service, metricGroupBy, dayGroupBy, saleCount } = makeService({});
    await service.panel(ACC, RANGE);

    // DATE ustuni (`@db.Date`) — yorliq: UTC yarim tun.
    const dayWhere = dayGroupBy.mock.calls[0][0].where;
    expect(dayWhere.date.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(dayWhere.date.lte.toISOString()).toBe('2026-07-31T00:00:00.000Z');

    const metricWhere = metricGroupBy.mock.calls[0][0].where;
    expect(metricWhere.dailyKpi.date.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');

    // `postedAt` — timestamptz: Toshkent (+05) yarim tunidan keyingi kun
    // yarim tunigacha. Yorliqni instant sifatida ishlatish 5 soatlik
    // chekni qo'shni kunga qo'shib yuborardi.
    const saleWhere = saleCount.mock.calls[0][0].where;
    expect(saleWhere.postedAt.gte.toISOString()).toBe('2026-06-30T19:00:00.000Z');
    expect(saleWhere.postedAt.lt.toISOString()).toBe('2026-07-31T19:00:00.000Z');
  });

  it('davr berilmasa — oxirgi 30 kun (bugun bilan tugaydi)', async () => {
    const { service, dayGroupBy } = makeService({});
    const panel = await service.panel(ACC, {});

    const where = dayGroupBy.mock.calls[0][0].where;
    const days = (where.date.lte.getTime() - where.date.gte.getTime()) / 86_400_000 + 1;
    expect(days).toBe(30);
    expect(panel.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(panel.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
