import { describe, expect, it, vi } from 'vitest';
import { PnlService } from './pnl.service.js';

/**
 * Unit coverage for the P&L multi-currency consolidation (commit 14b25a5d).
 *
 * The money-bug class: revenue/returns/expenses are document-currency totals
 * that MUST be base-consolidated, while COGS (demand.cost_sum_minor) is
 * ALREADY base (normalized at supply-post §Tier-2 step A) and must be summed
 * DIRECTLY — NOT converted again. These tests stub the four per-table
 * queries (routed by SQL text) and assert that contract.
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

interface TableRows {
  demands?: Array<{
    currency: string;
    rate_value?: bigint;
    sum_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
  sales_returns?: Array<{
    currency: string;
    rate_value?: bigint;
    sum_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
  payments_out?: Array<{
    currency: string;
    rate_value?: bigint;
    sum_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
  cash_out?: Array<{
    currency: string;
    rate_value?: bigint;
    sum_minor: bigint | null;
    cost_minor: bigint | null;
  }>;
}

function makeService(tables: TableRows) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    // Route by table name in the SQL template (computeTotals fires 4 queries).
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM demands')) return tables.demands ?? [];
      if (sql.includes('FROM sales_returns')) return tables.sales_returns ?? [];
      if (sql.includes('FROM payments_out')) return tables.payments_out ?? [];
      if (sql.includes('FROM cash_out')) return tables.cash_out ?? [];
      return [];
    }),
  };
  return new PnlService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31', groupBy: 'none' as const };

describe('PnlService — multi-currency totals', () => {
  it('consolidates revenue to base while COGS (already base) is summed direct', async () => {
    const svc = makeService({
      demands: [
        { currency: 'UZS', sum_minor: 100_000n, cost_minor: 30_000n },
        // USD revenue → base ×12000; cost_sum_minor is ALREADY base.
        { currency: 'USD', sum_minor: 500n, cost_minor: 6_000_000n },
      ],
    });
    const r = await svc.pnlReport('acc', RANGE);
    // revenue = 100_000 + 500*12000 (6_000_000) = 6_100_000
    expect(r.totals.revenueMinor).toBe('6100000');
    // cogs = 30_000 + 6_000_000 (NOT ×12000 again) = 6_030_000
    expect(r.totals.cogsMinor).toBe('6030000');
    expect(r.totals.grossProfitMinor).toBe('70000');
    expect(r.totals.netProfitMinor).toBe('70000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('consolidates returns + expenses (payments_out / cash_out) to base', async () => {
    const svc = makeService({
      demands: [{ currency: 'UZS', sum_minor: 1_000_000n, cost_minor: 200_000n }],
      sales_returns: [{ currency: 'UZS', sum_minor: 100_000n, cost_minor: null }],
      payments_out: [{ currency: 'USD', sum_minor: 100n, cost_minor: null }], // → 1_200_000 base
      cash_out: [{ currency: 'UZS', sum_minor: 300_000n, cost_minor: null }],
    });
    const r = await svc.pnlReport('acc', RANGE);
    // revenue = 1_000_000 − 100_000 (returns) = 900_000
    expect(r.totals.revenueMinor).toBe('900000');
    expect(r.totals.cogsMinor).toBe('200000');
    // gross = 900_000 − 200_000 = 700_000
    expect(r.totals.grossProfitMinor).toBe('700000');
    // expenses = 100*12000 (1_200_000) + 300_000 = 1_500_000 ⇒ net = 700_000 − 1_500_000
    expect(r.totals.expensesMinor).toBe('1500000');
    expect(r.totals.netProfitMinor).toBe('-800000');
    expect(r.mixedCurrency).toBe(true);
  });

  it('single-currency tenant: totals are the identity (no drift)', async () => {
    const svc = makeService({
      demands: [{ currency: 'UZS', sum_minor: 500_000n, cost_minor: 120_000n }],
    });
    const r = await svc.pnlReport('acc', RANGE);
    expect(r.totals.revenueMinor).toBe('500000');
    expect(r.totals.cogsMinor).toBe('120000');
    expect(r.totals.grossProfitMinor).toBe('380000');
    expect(r.mixedCurrency).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Faza 17 / M-11 — yopilgan davr P&L barqarorligi.
//
// Ilgari konsolidatsiya Currency jadvalining BUGUNGI kursi bilan bo'lardi:
// kurs har qimirlaganda yanvar oyining foydasi qayta yozilardi. Endi SQL
// (currency, rate_value) bo'yicha guruhlaydi va har bucket o'z kursida
// baholanadi.
// ---------------------------------------------------------------------------
function makeServiceWithRates(
  tables: TableRows,
  rates: Array<{
    code: string;
    default: boolean;
    rateValue: bigint;
    multiplicity: number;
    indirect: boolean;
  }>,
) {
  const client = {
    currency: { findMany: vi.fn(async () => rates) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('FROM demands')) return tables.demands ?? [];
      if (sql.includes('FROM sales_returns')) return tables.sales_returns ?? [];
      if (sql.includes('FROM payments_out')) return tables.payments_out ?? [];
      if (sql.includes('FROM cash_out')) return tables.cash_out ?? [];
      return [];
    }),
  };
  return new PnlService({ client } as never);
}

const UZS_BASE = { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false };
const usdAt = (rate: bigint) => ({
  code: 'USD',
  default: false,
  rateValue: rate * E8,
  multiplicity: 1,
  indirect: false,
});

describe('PnlService — tarixiy kurs (M-11)', () => {
  // $100.00 = 10 000 sent, hujjat 11 000 kursda yozilgan.
  const janurayUsdSale: TableRows = {
    demands: [{ currency: 'USD', rate_value: 11_000n * E8, sum_minor: 10_000n, cost_minor: 0n }],
  };

  it('hujjat o‘z kursida baholanadi (joriy kurs EMAS)', async () => {
    const svc = makeServiceWithRates(janurayUsdSale, [UZS_BASE, usdAt(12_000n)]);
    const r = await svc.pnlReport('acc', RANGE);
    // 10 000 sent × 11 000 = 110 000 000 tiyin (12 000 kursda 120 000 000 bo'lardi)
    expect(r.totals.revenueMinor).toBe('110000000');
  });

  it('kurs 12 000 → 15 000 ga o‘zgarsa ham o‘tgan davr O‘ZGARMAYDI', async () => {
    const before = await makeServiceWithRates(janurayUsdSale, [UZS_BASE, usdAt(12_000n)]).pnlReport(
      'acc',
      RANGE,
    );
    const after = await makeServiceWithRates(janurayUsdSale, [UZS_BASE, usdAt(15_000n)]).pnlReport(
      'acc',
      RANGE,
    );
    expect(after.totals.revenueMinor).toBe(before.totals.revenueMinor);
    expect(after.totals.netProfitMinor).toBe(before.totals.netProfitMinor);
  });

  it('bir valyutaning ikki kursli buckets’i alohida qo‘shiladi', async () => {
    const svc = makeServiceWithRates(
      {
        demands: [
          { currency: 'USD', rate_value: 11_000n * E8, sum_minor: 10_000n, cost_minor: 0n },
          { currency: 'USD', rate_value: 13_000n * E8, sum_minor: 10_000n, cost_minor: 0n },
        ],
      },
      [UZS_BASE, usdAt(12_000n)],
    );
    const r = await svc.pnlReport('acc', RANGE);
    // 110 000 000 + 130 000 000 — o'rtacha kurs bilan «tekislash» YO'Q
    expect(r.totals.revenueMinor).toBe('240000000');
  });

  it('kursi YO‘Q valyuta jamiga qo‘shilmaydi, alohida qatorda qaytadi (M-12)', async () => {
    const svc = makeServiceWithRates(
      {
        demands: [
          { currency: 'UZS', sum_minor: 500_000n, cost_minor: 0n },
          // Currency jadvalida EUR yo'q va hujjatda kurs muzlatilmagan.
          { currency: 'EUR', sum_minor: 100_000n, cost_minor: 0n },
        ],
      },
      [UZS_BASE],
    );
    const r = await svc.pnlReport('acc', RANGE);
    expect(r.totals.revenueMinor).toBe('500000'); // 600 000 EMAS
    expect(r.unconvertedByCurrency).toEqual([{ currency: 'EUR', amountMinor: '100000' }]);
    expect(r.mixedCurrency).toBe(true);
  });
});
