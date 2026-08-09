import { describe, expect, it, vi } from 'vitest';
import { WarehouseOpsService } from './warehouse-ops.service.js';

/**
 * Faza Q8 / M-11 — «Ombor operatsiyalari» pul ustunlari (kirim = Supply,
 * chiqim = Demand) tarixiy kursda.
 *
 * Ilgari `groupBy(['currency'])` natijasi Currency jadvalining BUGUNGI
 * kursida konsolidatsiya qilinardi ⇒ kurs har qimirlaganda yopilgan davr
 * qayta yozilardi. Endi guruh kaliti `['currency','rateValue']` va har
 * guruh hujjatning o'z kursida baholanadi.
 *
 * Identity-qo'riqchi: `rateValue` sxemada `@default(100000000)`, shuning
 * uchun baza bo'lmagan valyutada 1e8 = «kurs kiritilmagan» ⇒ joriy kontekst
 * kursiga qaytiladi (aks holda face-value bug'i boshqa eshikdan qaytardi).
 *
 * Kurs fikstura: baza UZS, USD @ berilgan kurs.
 */

const E8 = 100_000_000n;

interface MoneyGroup {
  currency: string;
  rateValue?: bigint;
  _count: { _all: number };
  _sum: { sumMinor: bigint | null };
}

function makeService(opts: {
  supplies?: MoneyGroup[];
  demands?: MoneyGroup[];
  usdRate?: bigint;
}) {
  const usdRate = opts.usdRate ?? 12_000n;
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'USD', default: false, rateValue: usdRate * E8, multiplicity: 1, indirect: false },
      ]),
    },
    supply: {
      groupBy: vi.fn(async () => opts.supplies ?? []),
      count: vi.fn(async () => 0),
    },
    demand: { groupBy: vi.fn(async () => opts.demands ?? []) },
    restockTask: { groupBy: vi.fn(async () => []) },
  };
  return new WarehouseOpsService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

// $100.00 = 10 000 sent.
const usdSupply = (rateValue?: bigint): MoneyGroup[] => [
  { currency: 'USD', rateValue, _count: { _all: 1 }, _sum: { sumMinor: 10_000n } },
];

describe('WarehouseOpsService — ko‘p valyutali konsolidatsiya', () => {
  it('kirim/chiqim summasi baza valyutasiga o‘tkaziladi', async () => {
    const svc = makeService({
      supplies: [
        { currency: 'UZS', _count: { _all: 1 }, _sum: { sumMinor: 1_000_000n } },
        { currency: 'USD', _count: { _all: 1 }, _sum: { sumMinor: 500n } }, // → 6 000 000
      ],
      demands: [{ currency: 'UZS', _count: { _all: 2 }, _sum: { sumMinor: 300_000n } }],
    });
    const r = await svc.report('acc', RANGE);
    expect(r.inbound.suppliesSumMinor).toBe('7000000');
    expect(r.inbound.suppliesCount).toBe(2);
    expect(r.outbound.demandsSumMinor).toBe('300000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });
});

describe('WarehouseOpsService — tarixiy kurs (M-11)', () => {
  it('hujjat o‘z kursida baholanadi (joriy kurs EMAS)', async () => {
    const svc = makeService({ supplies: usdSupply(11_000n * E8), usdRate: 12_000n });
    const r = await svc.report('acc', RANGE);
    // 10 000 × 11 000 = 110 000 000 (12 000 kursda 120 000 000 bo'lardi)
    expect(r.inbound.suppliesSumMinor).toBe('110000000');
  });

  it('joriy kurs 12 000 → 15 000 bo‘lsa ham o‘tgan davr O‘ZGARMAYDI', async () => {
    const before = await makeService({
      supplies: usdSupply(11_000n * E8),
      usdRate: 12_000n,
    }).report('acc', RANGE);
    const after = await makeService({
      supplies: usdSupply(11_000n * E8),
      usdRate: 15_000n,
    }).report('acc', RANGE);
    expect(after.inbound.suppliesSumMinor).toBe(before.inbound.suppliesSumMinor);
  });

  it('identity-qo‘riqchi: default 1e8 kurs joriy kontekstga tushadi', async () => {
    const svc = makeService({ supplies: usdSupply(E8), usdRate: 12_000n });
    const r = await svc.report('acc', RANGE);
    expect(r.inbound.suppliesSumMinor).toBe('120000000');
  });

  it('chiqim (Demand) tomoni ham hujjat kursini o‘qiydi', async () => {
    const svc = makeService({
      demands: [
        {
          currency: 'USD',
          rateValue: 11_000n * E8,
          _count: { _all: 1 },
          _sum: { sumMinor: 10_000n },
        },
      ],
      usdRate: 12_000n,
    });
    const r = await svc.report('acc', RANGE);
    expect(r.outbound.demandsSumMinor).toBe('110000000');
  });
});
