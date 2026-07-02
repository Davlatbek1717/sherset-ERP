import { describe, expect, it, vi } from 'vitest';
import { SalesByChannelService } from './sales-by-channel.service.js';

/**
 * Unit coverage for sales-by-channel multi-currency consolidation
 * (commit d8c87414). Per (channel, currency) revenue is base-consolidated;
 * order_count/qty stay correct across the currency split (a demand has one
 * currency). Rate fixture: base UZS, USD @ 12 000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedRow {
  channel_id: string | null;
  channel_name: string | null;
  channel_type: string | null;
  currency: string;
  order_count: bigint;
  revenue: bigint;
  qty: string;
}

function makeService(rows: CannedRow[]) {
  const client = {
    currency: { findMany: vi.fn(async () => currencyRows()) },
    $queryRaw: vi.fn(async () => rows),
  };
  return new SalesByChannelService({ client } as never);
}

const RANGE = { from: '2026-05-01', to: '2026-05-31' };

describe('SalesByChannelService — multi-currency consolidation', () => {
  it('folds a channel sold in two currencies, consolidating revenue to base', async () => {
    const svc = makeService([
      {
        channel_id: 'web',
        channel_name: 'Web',
        channel_type: 'online',
        currency: 'UZS',
        order_count: 1n,
        revenue: 1_000_000n,
        qty: '2',
      },
      {
        channel_id: 'web',
        channel_name: 'Web',
        channel_type: 'online',
        currency: 'USD',
        order_count: 1n,
        revenue: 500n, // → base 6_000_000
        qty: '1',
      },
    ]);
    const r = await svc.report('acc', RANGE);
    const web = r.rows.find((x) => x.channelId === 'web');
    // 1_000_000 + 500*12000 = 7_000_000
    expect(web?.revenueMinor).toBe('7000000');
    expect(web?.orderCount).toBe(2);
    expect(web?.qty).toBe('3');
    expect(r.totalRevenueMinor).toBe('7000000');
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('ranks channels by consolidated base revenue', async () => {
    const svc = makeService([
      {
        channel_id: 'retail',
        channel_name: 'Retail',
        channel_type: 'pos',
        currency: 'UZS',
        order_count: 1n,
        revenue: 2_000_000n,
        qty: '5',
      },
      {
        channel_id: 'b2b',
        channel_name: 'B2B',
        channel_type: 'direct',
        currency: 'USD',
        order_count: 1n,
        revenue: 1_000n, // → base 12_000_000 > retail 2_000_000
        qty: '1',
      },
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows[0]?.channelId).toBe('b2b');
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      {
        channel_id: null,
        channel_name: null,
        channel_type: null,
        currency: 'UZS',
        order_count: 3n,
        revenue: 900_000n,
        qty: '7',
      },
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.totalRevenueMinor).toBe('900000');
    expect(r.rows[0]?.channelName).toBe('Direct'); // null channel ⇒ Direct
    expect(r.mixedCurrency).toBe(false);
  });
});
