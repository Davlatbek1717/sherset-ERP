import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';
import { KPI_METRICS } from './kpi-metrics.js';

/**
 * Hisobning O'Z ko'rsatkichlari (2026-08-05, egasining shikoyatidan).
 *
 * SHIKOYAT: «xodimlarga KPI qo'sha olmayapman, faqat tayyorlarini qo'sha
 * olyapman». Sabab: katalog `kpi-metrics.ts` da qattiq yozilgan edi va
 * `saveEmployeeConfig` undan tashqaridagi kalitni RAD ETARDI.
 *
 * Bu yerda qulflanadigan shartnomalar:
 *   1. o'z ko'rsatkichi yaratiladi va katalogda built-in'lar bilan BIRGA turadi;
 *   2. kaliti `custom_` bilan boshlanadi — built-in ro'yxat kengaysa ham
 *      to'qnashmaydi;
 *   3. tizim ko'rsatkichini tahrirlab/arxivlab bo'lmaydi;
 *   4. arxivlash O'CHIRISH emas (o'tgan kunlarning raqamlari saqlanadi);
 *   5. manba doim `manual` — «kassadan olinadi» deb belgilab bo'lmaydi.
 */

const ACC = 'acc-1';

function makeService(opts: { custom?: Array<Record<string, unknown>>; taken?: string[] } = {}) {
  const create = vi
    .fn()
    .mockImplementation((args: { data: { key: string } }) => Promise.resolve({ ...args.data }));
  const update = vi.fn().mockResolvedValue({});
  const client = {
    kpiMetricDef: {
      findMany: vi.fn().mockImplementation((args: { where?: { key?: unknown } }) => {
        // `uniqueKey` band kalitlarni `startsWith` bilan so'raydi.
        if (args?.where?.key) {
          return Promise.resolve((opts.taken ?? []).map((key) => ({ key })));
        }
        return Promise.resolve(opts.custom ?? []);
      }),
      findFirst: vi.fn().mockResolvedValue(opts.custom?.length ? { id: 'def-1' } : null),
      create,
      update,
    },
  };
  const svc = new KpiMetricCatalogService({ client } as never);
  return { svc, client, create, update };
}

const CUSTOM_ROW = {
  key: 'custom_mijoz_shikoyati',
  labelUz: 'Mijoz shikoyati',
  labelRu: 'Жалобы',
  unit: 'count',
  direction: 'lower_better',
  source: 'manual',
  perHour: false,
};

const INPUT = {
  labelUz: 'Mijoz shikoyati',
  labelRu: 'Жалобы',
  unit: 'count' as const,
  direction: 'lower_better' as const,
  perHour: false,
};

describe('yaratish', () => {
  it('kalit `custom_` prefiksi bilan nomdan yasaladi', async () => {
    const { svc, create } = makeService();
    await svc.create(ACC, INPUT);
    expect(create.mock.calls[0][0].data.key).toBe('custom_mijoz_shikoyati');
  });

  it('kirill nom ham xavfsiz kalitga aylanadi', async () => {
    const { svc, create } = makeService();
    await svc.create(ACC, { ...INPUT, labelUz: 'Жалобы клиентов' });
    expect(create.mock.calls[0][0].data.key).toMatch(/^custom_[a-z0-9_]+$/);
  });

  it('kalit band bo`lsa raqam qo`shiladi', async () => {
    const { svc, create } = makeService({ taken: ['custom_mijoz_shikoyati'] });
    await svc.create(ACC, INPUT);
    expect(create.mock.calls[0][0].data.key).toBe('custom_mijoz_shikoyati_2');
  });

  it('manba DOIM `manual` — tanlov sifatida berilmaydi', async () => {
    // Tizim bu ko'rsatkichni hisoblay olmaydi; «kassadan olinadi» deb
    // belgilash yolg'on va'da bo'lardi.
    const { svc, create } = makeService();
    await svc.create(ACC, INPUT);
    expect(create.mock.calls[0][0].data.source).toBe('manual');
  });

  it('RU nomi bo`sh bo`lsa UZ nomi ishlatiladi (xom kalit ko`rinmasin)', async () => {
    const { svc, create } = makeService();
    await svc.create(ACC, { ...INPUT, labelRu: '' });
    expect(create.mock.calls[0][0].data.labelRu).toBe('Mijoz shikoyati');
  });
});

describe('katalog', () => {
  it('built-in + o`z ko`rsatkichlari BIRGA qaytadi', async () => {
    const { svc } = makeService({ custom: [CUSTOM_ROW] });
    const list = await svc.list(ACC);
    expect(list).toHaveLength(KPI_METRICS.length + 1);
    expect(list.filter((m) => m.custom)).toHaveLength(1);
    expect(list.find((m) => m.key === 'custom_mijoz_shikoyati')?.labelUz).toBe('Mijoz shikoyati');
  });

  it('built-in`lar `custom: false` bilan belgilanadi', async () => {
    const { svc } = makeService();
    const list = await svc.list(ACC);
    expect(list.every((m) => m.custom === false)).toBe(true);
  });

  it('`resolve` xaritasida ikkala tur ham bor (ball shundan o`qiydi)', async () => {
    const { svc } = makeService({ custom: [CUSTOM_ROW] });
    const catalog = await svc.resolve(ACC);
    expect(catalog.get('late_minutes')?.direction).toBe('lower_better');
    expect(catalog.get('custom_mijoz_shikoyati')?.source).toBe('manual');
    expect(catalog.size).toBe(KPI_METRICS.length + 1);
  });

  it('arxivlangan ko`rsatkich katalogga kirmaydi', async () => {
    const { svc, client } = makeService({ custom: [CUSTOM_ROW] });
    await svc.list(ACC);
    const where = client.kpiMetricDef.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ source: 'manual', archived: false });
  });
});

describe('tizim ko`rsatkichi himoyalangan', () => {
  it('built-in`ni tahrirlab bo`lmaydi', async () => {
    const { svc } = makeService();
    await expect(svc.update(ACC, 'late_minutes', INPUT)).rejects.toThrow(BadRequestException);
  });

  it('built-in`ni arxivlab bo`lmaydi', async () => {
    const { svc } = makeService();
    await expect(svc.archive(ACC, 'cash_revenue')).rejects.toThrow(BadRequestException);
  });

  it('mavjud bo`lmagan o`z ko`rsatkichi — 404', async () => {
    const { svc } = makeService();
    await expect(svc.archive(ACC, 'custom_yoq')).rejects.toThrow(NotFoundException);
  });
});

describe('arxivlash — o`chirish EMAS', () => {
  it('faqat `archived` bayrog`i qo`yiladi', async () => {
    // O'chirish `KpiProfileMetric.metricDefId` FK'siga urilardi va o'tgan
    // kunlarning raqamlari ma'nosini yo'qotardi.
    const { svc, update } = makeService({ custom: [CUSTOM_ROW] });
    await svc.archive(ACC, 'custom_mijoz_shikoyati');
    expect(update.mock.calls[0][0].data).toEqual({ archived: true });
  });

  it('tahrirlashda KALIT o`zgarmaydi (tarix uzilmasin)', async () => {
    const { svc, update } = makeService({ custom: [CUSTOM_ROW] });
    await svc.update(ACC, 'custom_mijoz_shikoyati', { ...INPUT, labelUz: 'Yangi nom' });
    expect(Object.keys(update.mock.calls[0][0].data)).not.toContain('key');
    expect(update.mock.calls[0][0].data.labelUz).toBe('Yangi nom');
  });
});
