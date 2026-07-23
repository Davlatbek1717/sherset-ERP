import { describe, expect, it, vi } from 'vitest';
import { ProfitabilityService } from './profitability.service.js';

/**
 * Unit coverage for the «Прибыльность» money math — the profit + profitability
 * formulas VERIFIED to the kopeck against the live moysklad footer (2026-07-05):
 *   profit           = (salesSum − salesCost) − (returnSum − returnCost)
 *   Рентабельность товара = profit / (salesCost − returnCost) × 100
 *   Рентабельность продаж = profit / (salesSum − returnSum) × 100
 *
 * The service fires several distinct raw queries; the mock routes each by its
 * SQL skeleton (demand vs return vs retail vs chart), and the ORM label lookups
 * are stubbed. Multi-currency consolidation reuses the shared rate context.
 */

const E8 = 100_000_000n;

type Raw = {
  gid: string | null;
  currency: string;
  documents: bigint;
  qty: string;
  sum: bigint;
  cost: bigint;
};

function makeService(opts: {
  sales?: Raw[];
  returns?: Raw[];
  currencies?: Array<{
    code: string;
    default: boolean;
    rateValue: bigint;
    multiplicity: number;
    indirect: boolean;
  }>;
}) {
  const sales = opts.sales ?? [];
  const returns = opts.returns ?? [];
  const currencies = opts.currencies ?? [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
  ];
  const client = {
    currency: { findMany: vi.fn(async () => currencies) },
    product: {
      findMany: vi.fn(async () => [
        { id: 'p1', name: 'P1', code: '01928', article: null, uom: 'шт' },
      ]),
    },
    variant: { findMany: vi.fn(async () => []) },
    counterparty: { findMany: vi.fn(async () => []) },
    employee: { findMany: vi.fn(async () => []) },
    salesChannel: { findMany: vi.fn(async () => []) },
    demand: { count: vi.fn(async () => 0) },
    salesReturn: { count: vi.fn(async () => 0) },
    // Route each raw query by its SQL skeleton.
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      // Route by tokens present in the OUTER template literal (nested Prisma.sql
      // values like date_trunc are NOT part of `strings`). Chart queries select
      // `AS bucket`; the entity-aggregate queries select `AS gid`.
      const sql = Array.from(strings).join(' ');
      const isChart = sql.includes('AS bucket');
      if (sql.includes('retail_sale_positions')) return [];
      if (sql.includes('sales_return_positions')) return isChart ? [] : returns;
      if (sql.includes('demand_positions')) return isChart ? [] : sales;
      return [];
    }),
  };
  return new ProfitabilityService({ client } as never);
}

const BASE = { groupBy: 'product', dateFrom: '2026-06-01', dateTo: '2026-06-30' } as const;

describe('ProfitabilityService — profit & profitability math', () => {
  it('nets returns out of profit and computes both profitability %', async () => {
    // Mirrors live row 01928: sales 355 267 / cost 62 066, returns 10 000 / cost 1 852,50.
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 11n,
          qty: '38',
          sum: 35_526_700n,
          cost: 6_206_600n,
        },
      ],
      returns: [
        { gid: 'p1', currency: 'UZS', documents: 1n, qty: '1', sum: 1_000_000n, cost: 185_250n },
      ],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.profitMinor).toBe('28505350'); // (35 526 700−6 206 600)−(1 000 000−185 250)
    expect(row?.profitGoodsPct).toBe('473.40'); // 28 505 350 / (6 206 600−185 250)
    expect(row?.profitSalesPct).toBe('82.56'); // 28 505 350 / (35 526 700−1 000 000)
    // totals mirror the single row
    expect(r.totals.profitMinor).toBe('28505350');
    expect(r.totals.profitSalesPct).toBe('82.56');
    expect(r.currency).toBe('UZS');
  });

  it('empty profitability % when denominator is zero', async () => {
    const svc = makeService({
      sales: [{ gid: 'p1', currency: 'UZS', documents: 1n, qty: '1', sum: 0n, cost: 0n }],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.profitGoodsPct).toBe('');
    expect(row?.profitSalesPct).toBe('');
  });

  it('consolidates multi-currency revenue into the account base', async () => {
    const svc = makeService({
      sales: [
        { gid: 'p1', currency: 'UZS', documents: 1n, qty: '1', sum: 20_000n, cost: 6_000n },
        { gid: 'p1', currency: 'USD', documents: 1n, qty: '1', sum: 500n, cost: 40_000n },
      ],
      currencies: [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
      ],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    // revenue = 20 000 + 500×12 000 = 6 020 000 ; cost = 6 000 + 40 000 = 46 000
    expect(row?.salesSumMinor).toBe('6020000');
    expect(row?.salesSumCostMinor).toBe('46000');
    expect(row?.profitMinor).toBe('5974000');
    expect(r.mixedCurrency).toBe(true);
  });

  it('returns a chart with continuous daily buckets over the window', async () => {
    const svc = makeService({
      sales: [{ gid: 'p1', currency: 'UZS', documents: 1n, qty: '1', sum: 10_000n, cost: 4_000n }],
    });
    const r = await svc.report('acc', { ...BASE, granularity: 'day' });
    expect(r.chart.granularity).toBe('day');
    // June 1..30 inclusive → 30 daily buckets.
    expect(r.chart.buckets.length).toBe(30);
    expect(r.chart.compareBuckets).toBeNull();
  });
});
