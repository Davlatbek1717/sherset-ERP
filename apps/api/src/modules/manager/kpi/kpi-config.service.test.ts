import { describe, expect, it, vi } from 'vitest';
import { KpiConfigService } from './kpi-config.service.js';
import { BUILT_IN_CATALOG } from './kpi-metrics.js';
import { KPI_METRICS } from './kpi-metrics.js';

/**
 * KpiConfigService — ULANISH testlari (har-xodim KPI config, 4M.2).
 *
 * Qulflanadigan contract'lar (buzilsa jimgina noto'g'ri ishlaydi):
 *   1. noma'lum ko'rsatkich kaliti RAD etiladi (katalog tekshiruvi);
 *   2. saqlash HAR SAFAR yangi VERSIYA yozadi (oxirgi + 1) — tarix muzlaydi;
 *   3. maqsad-raqam DB'ga BigInt bo'lib boradi (pul tiyinini yo'qotmaydi).
 */

const ACCOUNT = 'acc-1';
const EMP = 'emp-1';
const KEY = KPI_METRICS[0].key; // katalogdagi haqiqiy kalit

function makeService(opts: { lastVersion?: number; profileExists?: boolean } = {}) {
  const versionCreate = vi.fn().mockResolvedValue({ id: 'ver-new', effectiveFrom: new Date() });
  const metricCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const tx = {
    // Katalog allaqachon to'liq — ensureMetricDefs create chaqirmaydi.
    kpiMetricDef: {
      findMany: vi
        .fn()
        .mockResolvedValue(KPI_METRICS.map((m) => ({ id: `def-${m.key}`, key: m.key }))),
      create: vi.fn(),
    },
    kpiProfile: {
      findFirst: vi.fn().mockResolvedValue(opts.profileExists === false ? null : { id: 'prof-1' }),
      create: vi.fn().mockResolvedValue({ id: 'prof-new' }),
    },
    kpiProfileVersion: {
      findFirst: vi.fn().mockResolvedValue(opts.lastVersion ? { version: opts.lastVersion } : null),
      create: versionCreate,
    },
    kpiProfileMetric: { createMany: metricCreateMany },
  };
  const client = {
    employee: { findFirst: vi.fn().mockResolvedValue({ id: EMP, name: 'Ali' }) },
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
  const svc = new KpiConfigService({ client } as never, catalog as never);
  return { svc, tx, client, versionCreate, metricCreateMany, catalog };
}

describe('saveEmployeeConfig', () => {
  it('noma`lum ko`rsatkich kalitini RAD etadi', async () => {
    const { svc } = makeService();
    await expect(
      svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
        metrics: [{ metricKey: 'yolgon_kalit', weight: 50 }],
      }),
    ).rejects.toThrow(/Noma.?lum ko.?rsatkich/);
  });

  it('takroriy kalitni RAD etadi', async () => {
    const { svc } = makeService();
    await expect(
      svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
        metrics: [
          { metricKey: KEY, weight: 50 },
          { metricKey: KEY, weight: 30 },
        ],
      }),
    ).rejects.toThrow(/Takroriy/);
  });

  it('yangi VERSIYA yozadi (oxirgi + 1)', async () => {
    const { svc, versionCreate } = makeService({ lastVersion: 3 });
    await svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
      metrics: [{ metricKey: KEY, weight: 100 }],
    });
    expect(versionCreate.mock.calls[0][0].data.version).toBe(4);
  });

  it('birinchi saqlashda versiya 1 dan boshlanadi', async () => {
    const { svc, versionCreate } = makeService({ lastVersion: undefined });
    await svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
      metrics: [{ metricKey: KEY, weight: 100 }],
    });
    expect(versionCreate.mock.calls[0][0].data.version).toBe(1);
  });

  it('maqsad-raqam DB`ga BigInt bo`lib boradi', async () => {
    const { svc, metricCreateMany } = makeService({ lastVersion: 1 });
    await svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
      metrics: [{ metricKey: KEY, weight: 40, target: 5_000_000 }],
    });
    const row = metricCreateMany.mock.calls[0][0].data[0];
    expect(row.target).toBe(5_000_000n);
    expect(typeof row.target).toBe('bigint');
  });

  it('maqsad berilmasa target NULL', async () => {
    const { svc, metricCreateMany } = makeService({ lastVersion: 1 });
    await svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
      metrics: [{ metricKey: KEY, weight: 40 }],
    });
    expect(metricCreateMany.mock.calls[0][0].data[0].target).toBeNull();
  });

  it('xodim topilmasa RAD etadi', async () => {
    const { svc, client } = makeService();
    client.employee.findFirst.mockResolvedValue(null);
    await expect(svc.saveEmployeeConfig(ACCOUNT, 'user-1', 'yoq', { metrics: [] })).rejects.toThrow(
      /topilmadi/,
    );
  });
});

describe('🐞 REGRESSIYA — hisobning O`Z ko`rsatkichi xodimga berilishi', () => {
  // EGASINING SHIKOYATI (2026-08-05): «xodimlarga KPI qo'sha olmayapman,
  // faqat tayyorlarini qo'sha olyapman». Sabab: validatsiya faqat TS
  // katalogini ko'rardi va o'z ko'rsatkichini «Noma'lum» deb rad etardi.
  const CUSTOM = 'custom_mijoz_shikoyati';

  function withCustom() {
    const h = makeService();
    // Katalogda built-in'lar + bitta o'z ko'rsatkichi.
    const merged = new Map(BUILT_IN_CATALOG);
    merged.set(CUSTOM, {
      key: CUSTOM,
      labelUz: 'Mijoz shikoyati',
      labelRu: 'Жалобы',
      unit: 'count',
      direction: 'lower_better',
      source: 'manual',
      perHour: false,
    });
    h.catalog.resolve.mockResolvedValue(merged);
    h.catalog.ensureDefs.mockResolvedValue(new Map([...merged.keys()].map((k) => [k, `def-${k}`])));
    return h;
  }

  it('o`z ko`rsatkichi RAD ETILMAYDI', async () => {
    const { svc } = withCustom();
    await expect(
      svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
        metrics: [{ metricKey: CUSTOM, weight: 40, target: 0 }],
      }),
    ).resolves.toBeDefined();
  });

  it('u profil versiyasiga og`irligi bilan yoziladi', async () => {
    const { svc, metricCreateMany } = withCustom();
    await svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
      metrics: [{ metricKey: CUSTOM, weight: 40, target: 5 }],
    });
    const rows = metricCreateMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ metricDefId: `def-${CUSTOM}`, weight: 40, target: 5n });
  });

  it('katalogda YO`Q kalit hamon rad etiladi (tekshiruv yo`qolmagan)', async () => {
    const { svc } = withCustom();
    await expect(
      svc.saveEmployeeConfig(ACCOUNT, 'user-1', EMP, {
        metrics: [{ metricKey: 'custom_yolgon', weight: 10 }],
      }),
    ).rejects.toThrow(/Noma.?lum ko.?rsatkich/);
  });
});
