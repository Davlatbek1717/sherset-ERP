import { describe, expect, it, vi } from 'vitest';
import { AverageBasketService } from './average-basket.service.js';

/**
 * Unit coverage for average-basket multi-currency consolidation
 * (commit d8c87414). Per (bucket, currency) revenue → base; order_count/qty
 * stay correct across the currency split. Note: this service uses
 * $queryRawUnsafe (positional params), so the stub is on that method.
 * Rate fixture: base UZS, USD @ 12 000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedRow {
  bucket: Date;
  currency: string;
  order_count: bigint;
  revenue: bigint;
  total_qty: string;
}

function makeService(rows: CannedRow[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRawUnsafe: vi.fn(async () => rows),
  };
  return new AverageBasketService({ client } as never);
}

const RANGE = { from: '2026-05-01', to: '2026-05-31', granularity: 'month' as const };
const B1 = new Date('2026-05-01T00:00:00Z');

describe('AverageBasketService — multi-currency consolidation', () => {
  it('folds a bucket across currencies, consolidating revenue to base', async () => {
    const svc = makeService([
      { bucket: B1, currency: 'UZS', order_count: 2n, revenue: 1_000_000n, total_qty: '4' },
      { bucket: B1, currency: 'USD', order_count: 1n, revenue: 500n, total_qty: '1' }, // → 6_000_000
    ]);
    const r = await svc.report('acc', RANGE);
    const row = r.rows[0];
    // 1_000_000 + 500*12000 = 7_000_000 across 3 orders
    expect(row?.revenueMinor).toBe('7000000');
    expect(row?.orderCount).toBe(3);
    expect(row?.totalQty).toBe('5');
    // averageBasket = 7_000_000 / 3 = 2_333_333 (BigInt floor)
    expect(row?.averageBasketMinor).toBe('2333333');
    expect(r.totals.revenueMinor).toBe('7000000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      { bucket: B1, currency: 'UZS', order_count: 2n, revenue: 600_000n, total_qty: '6' },
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.totals.revenueMinor).toBe('600000');
    expect(r.totals.averageBasketMinor).toBe('300000'); // 600_000 / 2
    expect(r.mixedCurrency).toBe(false);
  });
});
