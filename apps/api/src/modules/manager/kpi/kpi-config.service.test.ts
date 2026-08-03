import { describe, expect, it, vi } from 'vitest';
import { KpiConfigService } from './kpi-config.service.js';
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
  const svc = new KpiConfigService({ client } as never);
  return { svc, tx, client, versionCreate, metricCreateMany };
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
