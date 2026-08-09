import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { UNKNOWN_CASHIER_ID } from './metrics/index.js';
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

// ---------------------------------------------------------------------------
// Faza Q8 / M-11 — tarixiy kurs (hujjatning o'z `rate_value`'si).
//
// «Прибыльность» daromadi ilgari Currency jadvalining BUGUNGI kursida
// konsolidatsiya qilinardi ⇒ kurs qimirlaganda yopilgan davrning foydasi
// qayta yozilardi. Endi agregat SQL (kalit, currency, rate_value) bo'yicha
// guruhlaydi. Identity (1e8) = «kurs yo'q» ⇒ joriy kontekst kursi.
// Chakana (retail) shoxi bundan tashqarida: uning SQL'i `'UZS'` ni qattiq
// yozadi (hamisha baza) ⇒ konvertatsiya umuman yo'q.
// ---------------------------------------------------------------------------
type HistRaw = Raw & { rate_value?: bigint };

function makeProfServiceAt(opts: { sales?: HistRaw[]; returns?: HistRaw[] }, usdRate: bigint) {
  const sales = opts.sales ?? [];
  const returns = opts.returns ?? [];
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'USD', default: false, rateValue: usdRate * E8, multiplicity: 1, indirect: false },
      ]),
    },
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
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
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

// $100.00 = 10 000 sent sotuv, tan narx allaqachon bazada.
const usdProfSale = (rateValue?: bigint): { sales: HistRaw[] } => ({
  sales: [
    {
      gid: 'p1',
      currency: 'USD',
      documents: 1n,
      qty: '1',
      sum: 10_000n,
      cost: 0n,
      rate_value: rateValue,
    },
  ],
});

describe('ProfitabilityService — tarixiy kurs (M-11)', () => {
  it('hujjat o‘z kursida baholanadi (joriy kurs EMAS)', async () => {
    const r = await makeProfServiceAt(usdProfSale(11_000n * E8), 12_000n).report('acc', BASE);
    expect(r.rows[0]?.salesSumMinor).toBe('110000000'); // 12 000 kursda 120 000 000 bo'lardi
    expect(r.totals.salesSumMinor).toBe('110000000');
  });

  it('joriy kurs 12 000 → 15 000 bo‘lsa ham o‘tgan davr O‘ZGARMAYDI', async () => {
    const before = await makeProfServiceAt(usdProfSale(11_000n * E8), 12_000n).report('acc', BASE);
    const after = await makeProfServiceAt(usdProfSale(11_000n * E8), 15_000n).report('acc', BASE);
    expect(after.totals.salesSumMinor).toBe(before.totals.salesSumMinor);
    expect(after.totals.profitMinor).toBe(before.totals.profitMinor);
  });

  it('qaytarish ham o‘z kursida baholanadi', async () => {
    const svc = makeProfServiceAt(
      {
        ...usdProfSale(11_000n * E8),
        returns: [
          {
            gid: 'p1',
            currency: 'USD',
            documents: 1n,
            qty: '1',
            sum: 1_000n,
            cost: 0n,
            rate_value: 10_000n * E8,
          },
        ],
      },
      12_000n,
    );
    const r = await svc.report('acc', BASE);
    expect(r.rows[0]?.returnSumMinor).toBe('10000000'); // 1 000 × 10 000
    // netto = 110 000 000 − 10 000 000
    expect(r.totals.profitMinor).toBe('100000000');
  });

  it('identity-qo‘riqchi: default 1e8 kurs joriy kontekstga tushadi', async () => {
    const r = await makeProfServiceAt(usdProfSale(E8), 12_000n).report('acc', BASE);
    expect(r.totals.salesSumMinor).toBe('120000000');
  });
});

/**
 * Kassir kesimi — analitika TZ §9 (X2), faza F010.
 *
 * Chekni KIM urgani (`cashier_sessions.cashier_id`) va hujjat KIMGA
 * biriktirilgani (`owner_id`) — ikki boshqa savol. Ilgari hisobotda faqat
 * ikkinchisi bor edi, shuning uchun «bu kassir qancha sotdi?» degan savolga
 * tizim javob bermasdi. Ikki kesim yonma-yon yashaydi: biri ikkinchisini
 * ALMASHTIRMAYDI (TZ X2 aynan shuni talab qiladi).
 */
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const CASHIER_ID = '22222222-2222-4222-8222-222222222222';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `Prisma.sql` qiymatlari tashqi template'ning `strings` massivida KO'RINMAYDI
 * (ular alohida uzatiladi). Router bazaga ketadigan skeletni ko'rishi uchun
 * ichma-ich fragmentlarni qayta yig'amiz — shunda «kassir tab'i qaysi ustun
 * bo'yicha guruhladi» degan savolga mock EMAS, haqiqiy SQL javob beradi.
 */
function sqlSkeleton(strings: readonly string[], values: readonly unknown[]): string {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    const v = values[i] as { strings?: string[]; values?: unknown[] } | undefined;
    if (v && Array.isArray(v.strings)) out += sqlSkeleton(v.strings, v.values ?? []);
  }
  return out;
}

function makeCashierService(opts: {
  /** Kassir kesimi so'ralganda (SQL `cashier_sessions` ga JOIN qilganda) qaytadi. */
  retailByCashier?: Raw[];
  /** Ega kesimi so'ralganda (`rs.owner_id`) qaytadi. */
  retailByOwner?: Raw[];
  demands?: Raw[];
  employees?: Array<{ id: string; name: string; fullName: string | null }>;
}) {
  const seenSql: string[] = [];
  const employeeFindMany = vi.fn(async (args: { where: { id: { in: string[] } } }) => {
    // `employees.id` — `uuid` ustuni: haqiqiy Prisma UUID bo'lmagan qiymatda
    // xato beradi. Mock ham shunday qiladi, aks holda sentinelning bazaga
    // sizib o'tishi testda ko'rinmay qolardi (jim 500).
    for (const id of args.where.id.in) {
      if (!UUID_RE.test(id)) throw new Error(`invalid uuid in employee lookup: ${id}`);
    }
    return (opts.employees ?? []).filter((e) => args.where.id.in.includes(e.id));
  });
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
      ]),
    },
    product: { findMany: vi.fn(async () => []) },
    variant: { findMany: vi.fn(async () => []) },
    counterparty: { findMany: vi.fn(async () => []) },
    employee: { findMany: employeeFindMany },
    salesChannel: { findMany: vi.fn(async () => []) },
    demand: { count: vi.fn(async () => 0) },
    salesReturn: { count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const outer = Array.from(strings).join(' ');
      const full = sqlSkeleton(Array.from(strings), values);
      seenSql.push(full);
      if (outer.includes('AS bucket')) return [];
      if (outer.includes('retail_sale_positions'))
        return full.includes('cashier_sessions')
          ? (opts.retailByCashier ?? [])
          : (opts.retailByOwner ?? []);
      if (outer.includes('sales_return_positions')) return [];
      if (outer.includes('demand_positions')) return opts.demands ?? [];
      return [];
    }),
  };
  return { svc: new ProfitabilityService({ client } as never), seenSql, employeeFindMany };
}

/** Bitta chek: 100 000 tiyin sotuv, 60 000 tan narx. */
const receipt = (gid: string | null): Raw[] => [
  { gid, currency: 'UZS', documents: 1n, qty: '1', sum: 100_000n, cost: 60_000n, costMissing: 0n },
];

describe('ProfitabilityService — kassir kesimi (analitika TZ §9 X2)', () => {
  it('bitta chek: xodim kesimi EGAga, kassir kesimi KASSIRga yoziladi', async () => {
    const { svc } = makeCashierService({
      retailByOwner: receipt(OWNER_ID),
      retailByCashier: receipt(CASHIER_ID),
      employees: [
        { id: OWNER_ID, name: 'Menejer', fullName: 'Menejer Egayev' },
        { id: CASHIER_ID, name: 'Kassir', fullName: 'Kassir Kassirov' },
      ],
    });
    const byOwner = await svc.report('acc', { ...BASE, groupBy: 'employee' });
    const byCashier = await svc.report('acc', { ...BASE, groupBy: 'cashier' });

    expect(byOwner.rows.map((r) => r.id)).toEqual([OWNER_ID]);
    expect(byCashier.rows.map((r) => r.id)).toEqual([CASHIER_ID]);
    expect(byCashier.rows[0]?.name).toBe('Kassir Kassirov');
    expect(byCashier.groupBy).toBe('cashier');
    // Bir xil pul, ikki xil bo'linish — jami o'zgarmaydi.
    expect(byCashier.totals.salesSumMinor).toBe(byOwner.totals.salesSumMinor);
    expect(byCashier.totals.profitMinor).toBe('40000');
  });

  it('smenasiz chek kassir kesimida «noma`lum» — tashlanmaydi va 0 ham emas', async () => {
    const { svc } = makeCashierService({ retailByCashier: receipt(null) });
    const r = await svc.report('acc', { ...BASE, groupBy: 'cashier' });

    expect(r.rows.map((x) => x.id)).toEqual([UNKNOWN_CASHIER_ID]);
    expect(r.rows[0]?.salesSumMinor).toBe('100000');
    expect(r.rows[0]?.salesSumMinor).not.toBe('0');
    expect(r.rows[0]?.salesDocuments).toBe(1);
    expect(r.totals.salesSumMinor).toBe('100000');
  });

  it('kassiri yo`q hujjat (otgruzka) jamida qoladi — «noma`lum»ga tushadi', async () => {
    const { svc } = makeCashierService({
      demands: receipt(null),
      retailByCashier: receipt(CASHIER_ID),
      employees: [{ id: CASHIER_ID, name: 'Kassir', fullName: null }],
    });
    const r = await svc.report('acc', { ...BASE, groupBy: 'cashier' });

    expect([...r.rows.map((x) => x.id)].sort()).toEqual([CASHIER_ID, UNKNOWN_CASHIER_ID].sort());
    expect(r.totals.salesSumMinor).toBe('200000');
    expect(r.rows.find((x) => x.id === UNKNOWN_CASHIER_ID)?.salesSumMinor).toBe('100000');
  });

  it('regressiya qulfi: xodim (ega) kesimi kassirga O`TMAYDI', async () => {
    const { svc, seenSql } = makeCashierService({ retailByOwner: receipt(null) });
    const r = await svc.report('acc', { ...BASE, groupBy: 'employee' });

    const retailSql = seenSql.filter((s) => s.includes('retail_sale_positions'));
    expect(retailSql.some((s) => s.includes('rs.owner_id'))).toBe(true);
    expect(retailSql.some((s) => s.includes('cashier_sessions'))).toBe(false);
    // Egasiz qator xodim kesimida oldingidek tushib qoladi — mavjud xulq.
    expect(r.rows).toEqual([]);
  });

  it('kassir kesimi smenaga LEFT JOIN qiladi — sessiyasi topilmagan chek yo`qolmaydi', async () => {
    const { svc, seenSql } = makeCashierService({ retailByCashier: receipt(CASHIER_ID) });
    await svc.report('acc', { ...BASE, groupBy: 'cashier' });

    const retailSql = seenSql.find((s) => s.includes('retail_sale_positions')) ?? '';
    expect(retailSql).toMatch(/LEFT JOIN\s+cashier_sessions/);
    expect(retailSql).toContain('cs.cashier_id');
  });

  it('«noma`lum» sentineli employees jadvaliga so`rov bo`lib ketmaydi', async () => {
    const { svc, employeeFindMany } = makeCashierService({
      retailByCashier: [...receipt(null), ...receipt(CASHIER_ID)],
      employees: [{ id: CASHIER_ID, name: 'Kassir', fullName: null }],
    });
    // Sentinel `id: { in: [...] }` ga tushsa mock (Prisma kabi) yiqiladi.
    const r = await svc.report('acc', { ...BASE, groupBy: 'cashier' });

    expect(employeeFindMany).toHaveBeenCalledTimes(1);
    expect(employeeFindMany.mock.calls[0]?.[0].where.id.in).toEqual([CASHIER_ID]);
    expect(r.rows.find((x) => x.id === UNKNOWN_CASHIER_ID)?.name).toBe('—');
  });
});
