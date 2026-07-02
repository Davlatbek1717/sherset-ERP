import { describe, expect, it, vi } from 'vitest';
import { ProfitabilityService } from './profitability.service.js';

/**
 * Unit coverage for the profitability multi-currency fold (commit 38622484).
 *
 * Per (product, currency): revenue (price, demand currency) → base; COGS
 * (dp.cost_minor — FIFO cost, already base after §Tier-2 step A) summed
 * direct; margin/excludeZeroRevenue/rank/limit applied on base figures.
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

interface CannedRow {
  product_id: string;
  currency: string;
  name: string | null;
  code: string | null;
  uom: string | null;
  quantity_sold: string;
  revenue_minor: bigint;
  cogs_minor: bigint;
}

function makeService(queryRows: CannedRow[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async () => queryRows),
  };
  return new ProfitabilityService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

function row(p: Partial<CannedRow> & { currency: string }): CannedRow {
  return {
    product_id: 'p1',
    name: 'P1',
    code: null,
    uom: null,
    quantity_sold: '1',
    revenue_minor: 0n,
    cogs_minor: 0n,
    ...p,
  };
}

describe('ProfitabilityService — multi-currency fold', () => {
  it('folds a product across currencies: revenue→base, COGS summed direct', async () => {
    const svc = makeService([
      row({ currency: 'UZS', quantity_sold: '2', revenue_minor: 20_000n, cogs_minor: 6_000n }),
      row({ currency: 'USD', quantity_sold: '1', revenue_minor: 500n, cogs_minor: 40_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    const p1 = r.rows.find((x) => x.productId === 'p1');
    // revenue = 20_000 + 500*12000 (6_000_000) = 6_020_000
    expect(p1?.revenueMinor).toBe('6020000');
    // cogs = 6_000 + 40_000 (both base) = 46_000
    expect(p1?.cogsMinor).toBe('46000');
    // margin = 6_020_000 − 46_000 = 5_974_000
    expect(p1?.marginMinor).toBe('5974000');
    expect(r.totals.revenueMinor).toBe('6020000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('excludeZeroRevenue drops a product whose base revenue is 0', async () => {
    const svc = makeService([
      row({ product_id: 'real', currency: 'UZS', revenue_minor: 10_000n, cogs_minor: 1_000n }),
      row({ product_id: 'freebie', currency: 'UZS', revenue_minor: 0n, cogs_minor: 5_000n }),
    ]);
    const r = await svc.report('acc', { ...RANGE, excludeZeroRevenue: true });
    expect(r.rows.find((x) => x.productId === 'real')).toBeDefined();
    expect(r.rows.find((x) => x.productId === 'freebie')).toBeUndefined();
  });

  it('ranks by base margin desc; foreign-margin product can outrank a local one', async () => {
    const svc = makeService([
      row({ product_id: 'local', currency: 'UZS', revenue_minor: 50_000n, cogs_minor: 10_000n }),
      // USD margin → base dwarfs the local one
      row({ product_id: 'import', currency: 'USD', revenue_minor: 1_000n, cogs_minor: 100_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    // import margin = 1_000*12000 − 100_000 = 11_900_000 ; local = 40_000
    expect(r.rows[0]?.productId).toBe('import');
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      row({ currency: 'UZS', quantity_sold: '3', revenue_minor: 30_000n, cogs_minor: 9_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows.find((x) => x.productId === 'p1')?.revenueMinor).toBe('30000');
    expect(r.mixedCurrency).toBe(false);
  });
});
