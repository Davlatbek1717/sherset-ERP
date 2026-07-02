import { describe, expect, it, vi } from 'vitest';
import { UnitEconomicsService } from './unit-economics.service.js';

/**
 * Unit coverage for the multi-currency fold fix (commit abb78ece).
 *
 * The bug: revenue_minor was summed across demand currencies, and minQty /
 * rank / limit ran per (product, currency) in SQL. These tests stub the
 * prisma boundary with canned per-(product,currency) rows and assert the
 * service folds per PRODUCT, converting revenue to base while COGS (already
 * base after §Tier-2 step A) sums directly.
 *
 * Rate fixture: base UZS (1e8), USD @ 12 000 ⇒ USD minor → base = ×12000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedUERow {
  product_id: string;
  name: string | null;
  code: string | null;
  uom: string | null;
  currency: string;
  quantity_sold: string;
  orders_count: bigint;
  revenue_minor: bigint;
  cogs_minor: bigint;
}

function makeService(queryRows: CannedUERow[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async () => queryRows),
  };
  return new UnitEconomicsService({ client } as never);
}

const RANGE = { dateFrom: '2026-05-01', dateTo: '2026-05-31' };

function row(p: Partial<CannedUERow> & { currency: string }): CannedUERow {
  return {
    product_id: 'p1',
    name: 'P1',
    code: null,
    uom: null,
    quantity_sold: '1',
    orders_count: 1n,
    revenue_minor: 0n,
    cogs_minor: 0n,
    ...p,
  };
}

describe('UnitEconomicsService — multi-currency fold', () => {
  it('folds a product sold in two currencies, consolidating revenue to base', async () => {
    const svc = makeService([
      row({ currency: 'UZS', quantity_sold: '2', revenue_minor: 20_000n, cogs_minor: 6_000n }),
      row({ currency: 'USD', quantity_sold: '1', revenue_minor: 500n, cogs_minor: 40_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    const p1 = r.rows.find((x) => x.productId === 'p1');
    expect(r.rows.length).toBe(1); // folded into ONE product row
    expect(p1?.quantitySold).toBe('3');
    expect(p1?.ordersCount).toBe(2);
    // 20_000 (UZS) + 500 * 12000 (USD→base 6_000_000) = 6_020_000
    expect(p1?.revenueMinor).toBe('6020000');
    // 6_000 + 40_000 (both base) = 46_000
    expect(p1?.cogsMinor).toBe('46000');
    expect(r.totals.revenueMinor).toBe('6020000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('single-currency tenant: revenue is the identity (no drift)', async () => {
    const svc = makeService([
      row({ currency: 'UZS', quantity_sold: '4', revenue_minor: 40_000n, cogs_minor: 12_000n }),
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows.find((x) => x.productId === 'p1')?.revenueMinor).toBe('40000');
    expect(r.mixedCurrency).toBe(false);
  });

  it('minQty applies per-PRODUCT, not per (product,currency)', async () => {
    // p1 sold 0.6 in each of two currencies ⇒ product total 1.2 ≥ minQty 1.
    // A per-(product,currency) filter would drop both 0.6 rows and lose p1.
    const svc = makeService([
      row({ currency: 'UZS', quantity_sold: '0.6', revenue_minor: 6_000n, cogs_minor: 1_000n }),
      row({ currency: 'USD', quantity_sold: '0.6', revenue_minor: 100n, cogs_minor: 2_000n }),
    ]);
    const r = await svc.report('acc', { ...RANGE, minQty: 1 });
    const p1 = r.rows.find((x) => x.productId === 'p1');
    expect(p1).toBeDefined();
    // 6_000 + 100 * 12000 (1_200_000) = 1_206_000
    expect(p1?.revenueMinor).toBe('1206000');
  });

  it('ranks products by base revenue desc, then caps via limit', async () => {
    const svc = makeService([
      row({ product_id: 'small', currency: 'UZS', quantity_sold: '1', revenue_minor: 10_000n }),
      // 5 USD → base 60_000_000, must outrank the 10_000 UZS product
      row({ product_id: 'big', currency: 'USD', quantity_sold: '1', revenue_minor: 5_00n }),
    ]);
    const r = await svc.report('acc', { ...RANGE, limit: 1 });
    expect(r.rows.length).toBe(1);
    expect(r.rows[0]?.productId).toBe('big');
  });
});
