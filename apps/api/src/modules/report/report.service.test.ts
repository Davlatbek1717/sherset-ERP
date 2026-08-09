import { describe, expect, it, vi } from 'vitest';
import { ReportService } from './report.service.js';

/**
 * Unit coverage for the sales-report multi-currency consolidation
 * (commit c6994c2c). Revenue/VAT/returns are document-currency totals →
 * base; COGS (demand.cost_sum_minor, already base after §Tier-2 step A) is
 * summed DIRECT. Covers the three distinct mechanisms: $queryRaw totals,
 * $queryRaw product fold, and Prisma groupBy FK fold.
 *
 * Rate fixture: base UZS (1e8), USD @ 12 000 ⇒ USD minor → base ×12000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface Stubs {
  demandTotals?: Array<{
    currency: string;
    cnt: bigint;
    sum_minor: bigint | null;
    vat_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
  returnTotals?: Array<{ currency: string; cnt: bigint; sum_minor: bigint | null }>;
  productRows?: Array<{
    product_id: string | null;
    currency: string;
    qty: string;
    price_sum: bigint | null;
    cnt: bigint;
  }>;
  demandGroupBy?: unknown[];
  returnGroupBy?: unknown[];
  counterparties?: Array<{ id: string; name: string }>;
  products?: Array<{ id: string; name: string; code: string | null }>;
}

function makeService(s: Stubs) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM demand_positions')) return s.productRows ?? [];
      if (sql.includes('FROM sales_returns')) return s.returnTotals ?? [];
      if (sql.includes('FROM demands')) return s.demandTotals ?? [];
      return [];
    }),
    demand: { groupBy: vi.fn(async () => s.demandGroupBy ?? []) },
    salesReturn: { groupBy: vi.fn(async () => s.returnGroupBy ?? []) },
    counterparty: { findMany: vi.fn(async () => s.counterparties ?? []) },
    product: { findMany: vi.fn(async () => s.products ?? []) },
  };
  return new ReportService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

describe('ReportService — multi-currency sales report', () => {
  it('totals: revenue/VAT→base, COGS summed direct, returns netted', async () => {
    const svc = makeService({
      demandTotals: [
        { currency: 'UZS', cnt: 1n, sum_minor: 1_000_000n, vat_minor: 0n, cost_minor: 200_000n },
        // USD sum → base 6_000_000 ; cost_sum_minor ALREADY base
        { currency: 'USD', cnt: 1n, sum_minor: 500n, vat_minor: 0n, cost_minor: 6_000_000n },
      ],
      returnTotals: [{ currency: 'UZS', cnt: 1n, sum_minor: 100_000n }],
    });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'none' });
    expect(r.totals.salesCount).toBe(2);
    // sales = 1_000_000 + 6_000_000 = 7_000_000
    expect(r.totals.sumMinor).toBe('7000000');
    // cost = 200_000 + 6_000_000 (NOT ×12000 again) = 6_200_000
    expect(r.totals.costSumMinor).toBe('6200000');
    // net = 7_000_000 − 100_000 (returns) = 6_900_000
    expect(r.totals.netSumMinor).toBe('6900000');
    // profit = net − cost = 6_900_000 − 6_200_000 = 700_000
    expect(r.totals.profitMinor).toBe('700000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('groupBy=product: per-product price_sum folded to base + ranked', async () => {
    const svc = makeService({
      demandTotals: [],
      productRows: [
        { product_id: 'p1', currency: 'UZS', qty: '2', price_sum: 1_000_000n, cnt: 1n },
        { product_id: 'p1', currency: 'USD', qty: '1', price_sum: 500n, cnt: 1n }, // → 6_000_000
      ],
      products: [{ id: 'p1', name: 'P1', code: null }],
    });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'product' });
    const p1 = r.groups.find((g) => g.key === 'p1');
    // 1_000_000 + 500*12000 = 7_000_000
    expect(p1?.sumMinor).toBe('7000000');
    expect(p1?.salesCount).toBe(2);
    expect(r.mixedCurrency).toBe(true);
  });

  it('groupBy=counterparty: FK fold consolidates revenue, COGS direct, ranked', async () => {
    const svc = makeService({
      demandTotals: [],
      demandGroupBy: [
        {
          agentId: 'cp-a',
          currency: 'UZS',
          _count: { _all: 1 },
          _sum: { sumMinor: 1_000_000n, vatSumMinor: 0n, costSumMinor: 200_000n },
        },
        {
          agentId: 'cp-a',
          currency: 'USD',
          _count: { _all: 1 },
          _sum: { sumMinor: 500n, vatSumMinor: 0n, costSumMinor: 6_000_000n }, // sum→base, cost already base
        },
      ],
      counterparties: [{ id: 'cp-a', name: 'A' }],
    });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'counterparty' });
    const cpA = r.groups.find((g) => g.key === 'cp-a');
    // sales = 1_000_000 + 6_000_000 = 7_000_000 ; cost = 200_000 + 6_000_000 = 6_200_000
    expect(cpA?.sumMinor).toBe('7000000');
    expect(cpA?.costSumMinor).toBe('6200000');
    expect(cpA?.profitMinor).toBe('800000'); // 7_000_000 − 6_200_000
    expect(cpA?.label).toBe('A');
    expect(cpA?.ref?.id).toBe('cp-a');
    expect(r.mixedCurrency).toBe(true);
  });

  it('single-currency tenant: totals are the identity (no drift)', async () => {
    const svc = makeService({
      demandTotals: [
        { currency: 'UZS', cnt: 2n, sum_minor: 500_000n, vat_minor: 0n, cost_minor: 120_000n },
      ],
    });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'none' });
    expect(r.totals.sumMinor).toBe('500000');
    expect(r.totals.costSumMinor).toBe('120000');
    expect(r.mixedCurrency).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Faza Q8 / M-11 — tarixiy kurs (hujjatning o'z `rate_value`'si).
//
// Uchala mexanizm ham hujjat kursini o'qishi kerak: $queryRaw totals,
// Prisma groupBy FK-fold va $queryRaw product-fold. Identity (1e8) =
// «kurs yo'q» ⇒ joriy kontekst kursiga qaytiladi.
// ---------------------------------------------------------------------------
interface HistStubs {
  /** `rate_value` — hujjatning muzlatilgan kursi (×10^8), ixtiyoriy. */
  demandTotals?: Array<{
    currency: string;
    rate_value?: bigint;
    cnt: bigint;
    sum_minor: bigint | null;
    vat_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
  returnTotals?: Array<{
    currency: string;
    rate_value?: bigint;
    cnt: bigint;
    sum_minor: bigint | null;
  }>;
  productRows?: Array<{
    product_id: string | null;
    currency: string;
    rate_value?: bigint;
    qty: string;
    price_sum: bigint | null;
    cnt: bigint;
  }>;
  demandGroupBy?: unknown[];
  returnGroupBy?: unknown[];
  counterparties?: Array<{ id: string; name: string }>;
  products?: Array<{ id: string; name: string; code: string | null }>;
  usdRate: bigint;
}

function makeServiceAtRate(s: HistStubs) {
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        {
          code: 'USD',
          default: false,
          rateValue: s.usdRate * E8,
          multiplicity: 1,
          indirect: false,
        },
      ]),
    },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM demand_positions')) return s.productRows ?? [];
      if (sql.includes('FROM sales_returns')) return s.returnTotals ?? [];
      if (sql.includes('FROM demands')) return s.demandTotals ?? [];
      return [];
    }),
    demand: { groupBy: vi.fn(async () => s.demandGroupBy ?? []) },
    salesReturn: { groupBy: vi.fn(async () => s.returnGroupBy ?? []) },
    counterparty: { findMany: vi.fn(async () => s.counterparties ?? []) },
    product: { findMany: vi.fn(async () => s.products ?? []) },
  };
  return new ReportService({ client } as never);
}

// $100.00 = 10 000 sent, hujjat 11 000 kursda yozilgan.
const usdTotals = (rateValue?: bigint) => [
  {
    currency: 'USD',
    rate_value: rateValue,
    cnt: 1n,
    sum_minor: 10_000n,
    vat_minor: 0n,
    cost_minor: 0n,
  },
];

describe('ReportService — tarixiy kurs (M-11)', () => {
  it('totals: hujjat o‘z kursida baholanadi (joriy kurs EMAS)', async () => {
    const svc = makeServiceAtRate({ demandTotals: usdTotals(11_000n * E8), usdRate: 12_000n });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'none' });
    expect(r.totals.sumMinor).toBe('110000000');
  });

  it('totals: joriy kurs 12 000 → 15 000 bo‘lsa ham o‘tgan davr O‘ZGARMAYDI', async () => {
    const before = await makeServiceAtRate({
      demandTotals: usdTotals(11_000n * E8),
      usdRate: 12_000n,
    }).salesReport('acc', { ...RANGE, groupBy: 'none' });
    const after = await makeServiceAtRate({
      demandTotals: usdTotals(11_000n * E8),
      usdRate: 15_000n,
    }).salesReport('acc', { ...RANGE, groupBy: 'none' });
    expect(after.totals.sumMinor).toBe(before.totals.sumMinor);
    expect(after.totals.profitMinor).toBe(before.totals.profitMinor);
  });

  it('totals: identity-qo‘riqchi — default 1e8 kurs joriy kontekstga tushadi', async () => {
    const svc = makeServiceAtRate({ demandTotals: usdTotals(E8), usdRate: 12_000n });
    const r = await svc.salesReport('acc', { ...RANGE, groupBy: 'none' });
    expect(r.totals.sumMinor).toBe('120000000');
  });

  it('groupBy=counterparty: FK-fold hujjat kursini o‘qiydi', async () => {
    const groups = (rateValue: bigint) => [
      {
        agentId: 'cp-a',
        currency: 'USD',
        rateValue,
        _count: { _all: 1 },
        _sum: { sumMinor: 10_000n, vatSumMinor: 0n, costSumMinor: 0n },
      },
    ];
    const at = (usdRate: bigint, rateValue: bigint) =>
      makeServiceAtRate({
        demandGroupBy: groups(rateValue),
        counterparties: [{ id: 'cp-a', name: 'A' }],
        usdRate,
      }).salesReport('acc', { ...RANGE, groupBy: 'counterparty' });
    const hist = await at(12_000n, 11_000n * E8);
    expect(hist.groups.find((g) => g.key === 'cp-a')?.sumMinor).toBe('110000000');
    const moved = await at(15_000n, 11_000n * E8);
    expect(moved.groups.find((g) => g.key === 'cp-a')?.sumMinor).toBe('110000000');
    // identity-qo'riqchi
    const identity = await at(12_000n, E8);
    expect(identity.groups.find((g) => g.key === 'cp-a')?.sumMinor).toBe('120000000');
  });

  it('groupBy=product: product-fold hujjat kursini o‘qiydi', async () => {
    const at = (usdRate: bigint, rateValue: bigint) =>
      makeServiceAtRate({
        productRows: [
          {
            product_id: 'p1',
            currency: 'USD',
            rate_value: rateValue,
            qty: '1',
            price_sum: 10_000n,
            cnt: 1n,
          },
        ],
        products: [{ id: 'p1', name: 'P1', code: null }],
        usdRate,
      }).salesReport('acc', { ...RANGE, groupBy: 'product' });
    const hist = await at(12_000n, 11_000n * E8);
    expect(hist.groups.find((g) => g.key === 'p1')?.sumMinor).toBe('110000000');
    const moved = await at(15_000n, 11_000n * E8);
    expect(moved.groups.find((g) => g.key === 'p1')?.sumMinor).toBe('110000000');
    const identity = await at(12_000n, E8);
    expect(identity.groups.find((g) => g.key === 'p1')?.sumMinor).toBe('120000000');
  });
});
