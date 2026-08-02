import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  /** Lines with no captured cost — see the «tan narx yig'ilmagan» suite below. */
  costMissing?: bigint;
};

function makeService(opts: {
  sales?: Raw[];
  returns?: Raw[];
  retail?: Raw[];
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
  const retail = opts.retail ?? [];
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
      if (sql.includes('retail_sale_positions')) return isChart ? [] : retail;
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

  it('carries retail cost into profit (regression: retail was hardcoded to 0 cost)', async () => {
    // POS receipt: sold for 100 000, frozen cost 60 000 → profit 40 000.
    // Before To'lqin 1.2 the SQL selected `0::bigint AS cost`, so this receipt
    // reported profit 100 000 at «100% margin» and owners priced against it.
    const svc = makeService({
      retail: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 10_000_000n,
          cost: 6_000_000n,
          costMissing: 0n,
        },
      ],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.salesSumCostMinor).toBe('6000000');
    expect(row?.profitMinor).toBe('4000000');
    expect(row?.profitSalesPct).toBe('40.00');
    expect(row?.costIncomplete).toBe(false);
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

/**
 * «Tan narx yig'ilmagan» — the NULL ≠ 0 contract (To'lqin 1.2).
 *
 * `cost_minor` is nullable on every position table and NULL means "never
 * captured", not "free". The bug was never the arithmetic (a NULL line and a
 * zero-cost line both add 0 to the SUM) — it was the SILENCE: the report
 * presented an under-counted cost as fact, so an uncosted line read as pure
 * profit at 100% margin. These tests lock in the marker that breaks the silence.
 */
describe("ProfitabilityService — «tan narx yig'ilmagan» marker", () => {
  it('flags a row whose lines have no captured cost, and does NOT invent a cost', async () => {
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '2',
          sum: 10_000_000n,
          cost: 0n,
          costMissing: 2n,
        },
      ],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.costIncomplete).toBe(true);
    expect(row?.costMissingLines).toBe(2);
    // The cost stays 0 — we do NOT back-fill a made-up figure. The profit is
    // therefore an UPPER bound, which is exactly what the flag announces.
    expect(row?.salesSumCostMinor).toBe('0');
    expect(row?.profitMinor).toBe('10000000');
  });

  it('a fully-costed row is NOT flagged (no false alarm)', async () => {
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 10_000_000n,
          cost: 4_000_000n,
          costMissing: 0n,
        },
      ],
    });
    const r = await svc.report('acc', BASE);
    expect(r.rows.find((x) => x.id === 'p1')?.costIncomplete).toBe(false);
    expect(r.totals.costIncomplete).toBe(false);
  });

  it('partially-costed row: real cost is kept AND the gap is still flagged', async () => {
    // The dangerous middle case — a plausible-looking cost that is short.
    // Silently rounding this to "complete" is how the 100%-margin lie survives.
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 2n,
          qty: '2',
          sum: 20_000_000n,
          cost: 6_000_000n,
          costMissing: 1n,
        },
      ],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.salesSumCostMinor).toBe('6000000');
    expect(row?.costIncomplete).toBe(true);
    expect(row?.costMissingLines).toBe(1);
  });

  it('counts missing lines from returns and retail too, and sums them into totals', async () => {
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 10_000_000n,
          cost: 4_000_000n,
          costMissing: 3n,
        },
      ],
      returns: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 1_000_000n,
          cost: 0n,
          costMissing: 5n,
        },
      ],
      retail: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 2_000_000n,
          cost: 0n,
          costMissing: 7n,
        },
      ],
    });
    const r = await svc.report('acc', BASE);
    expect(r.rows.find((x) => x.id === 'p1')?.costMissingLines).toBe(15);
    expect(r.totals.costMissingLines).toBe(15);
    expect(r.totals.costIncomplete).toBe(true);
  });

  it('totals count EVERY group, not just the paginated page', async () => {
    const svc = makeService({
      sales: [
        {
          gid: 'p1',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 10n,
          cost: 0n,
          costMissing: 4n,
        },
        {
          gid: 'p2',
          currency: 'UZS',
          documents: 1n,
          qty: '1',
          sum: 10n,
          cost: 0n,
          costMissing: 6n,
        },
      ],
    });
    const r = await svc.report('acc', { ...BASE, limit: 1 });
    expect(r.rows.length).toBe(1);
    expect(r.count).toBe(2);
    expect(r.totals.costMissingLines).toBe(10);
  });

  it('a source that reports no costMissing at all degrades to 0, never NaN', async () => {
    // Defensive: `Number(undefined)` is NaN and NaN would poison the totals and
    // silently disable the flag (NaN > 0 === false) — the exact failure mode
    // this whole change exists to prevent.
    const svc = makeService({
      sales: [{ gid: 'p1', currency: 'UZS', documents: 1n, qty: '1', sum: 10n, cost: 5n }],
    });
    const r = await svc.report('acc', BASE);
    const row = r.rows.find((x) => x.id === 'p1');
    expect(row?.costMissingLines).toBe(0);
    expect(Number.isNaN(row?.costMissingLines)).toBe(false);
    expect(row?.costIncomplete).toBe(false);
  });
});

/**
 * SQL source-scan guard.
 *
 * The service mock above routes queries by their SQL text and returns fixtures,
 * so it proves the aggregation plumbing but CANNOT prove the SQL itself. These
 * assertions read the source and lock the two shapes that carried the bug —
 * a hardcoded zero cost, and COALESCE-ing a NULL cost to zero. Both are exactly
 * the edits a future refactor would make "to simplify", re-introducing the
 * 100%-margin lie without failing a single behavioural test.
 */
describe('ProfitabilityService — SQL shape guard', () => {
  const SRC = readFileSync(
    fileURLToPath(new URL('./profitability.service.ts', import.meta.url)),
    'utf8',
  );
  // Comments explain the old bug by name; strip them so prose never satisfies
  // (or trips) a guard that is meant to inspect executable SQL only.
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('no query selects a hardcoded zero cost', () => {
    expect(CODE).not.toMatch(/0::bigint\s+AS\s+cost/i);
  });

  it('no query coalesces a NULL cost_minor to zero (NULL means "not captured")', () => {
    expect(CODE).not.toMatch(/COALESCE\(\s*\w+\.cost_minor\s*,\s*0\s*\)/i);
  });

  it('every cost aggregate ships a companion missing-line count', () => {
    const costSums = CODE.match(/SUM\(\([^)]*cost_minor[^;]*?AS cost/g) ?? [];
    const missingCounts = CODE.match(/COUNT\(\*\) FILTER \(WHERE \w+\.cost_minor IS NULL\)/g) ?? [];
    // 3 aggregates (demand / return / retail) + 2 chart series (demand / return).
    expect(costSums.length).toBe(5);
    expect(missingCounts.length).toBe(5);
  });
});
