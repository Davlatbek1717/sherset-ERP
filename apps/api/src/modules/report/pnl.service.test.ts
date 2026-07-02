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
  demands?: Array<{ currency: string; sum_minor: bigint | null; cost_minor: bigint | null }>;
  sales_returns?: Array<{ currency: string; sum_minor: bigint | null; cost_minor: bigint | null }>;
  payments_out?: Array<{ currency: string; sum_minor: bigint | null; cost_minor: bigint | null }>;
  cash_out?: Array<{ currency: string; sum_minor: bigint | null; cost_minor: bigint | null }>;
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
