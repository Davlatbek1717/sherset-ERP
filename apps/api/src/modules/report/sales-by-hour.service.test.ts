import { describe, expect, it, vi } from 'vitest';
import { SalesByHourService } from './sales-by-hour.service.js';

/**
 * Unit coverage for sales-by-hour multi-currency consolidation
 * (commit d8c87414). Per (hour, currency) revenue is base-consolidated into
 * 24 bins; peakHour is the argmax over CONSOLIDATED revenue. Rate fixture:
 * base UZS, USD @ 12 000.
 */

const E8 = 100_000_000n;

function currencyRows() {
  return [
    { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
    { code: 'USD', default: false, rateValue: 12_000n * E8, multiplicity: 1, indirect: false },
  ];
}

interface CannedRow {
  hour: number;
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
  return new SalesByHourService({ client } as never);
}

const RANGE = { from: '2026-05-01', to: '2026-05-31', timezone: 'UTC' };

describe('SalesByHourService — multi-currency consolidation', () => {
  it('folds an hour bin across currencies and consolidates to base', async () => {
    const svc = makeService([
      { hour: 10, currency: 'UZS', order_count: 1n, revenue: 1_000_000n, qty: '2' },
      { hour: 10, currency: 'USD', order_count: 1n, revenue: 500n, qty: '1' }, // → 6_000_000
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows).toHaveLength(24); // padded to all 24 bins
    const hour10 = r.rows.find((x) => x.hour === 10);
    // 1_000_000 + 500*12000 = 7_000_000
    expect(hour10?.revenueMinor).toBe('7000000');
    expect(hour10?.orderCount).toBe(2);
    expect(hour10?.qty).toBe('3');
    expect(r.peakHour).toBe(10);
    expect(r.currency).toBe('UZS');
    expect(r.mixedCurrency).toBe(true);
  });

  it('peakHour is argmax over consolidated revenue (foreign hour can win)', async () => {
    const svc = makeService([
      { hour: 9, currency: 'UZS', order_count: 1n, revenue: 5_000_000n, qty: '1' },
      // hour 14 has only 1_000 USD raw, but → base 12_000_000 > hour 9
      { hour: 14, currency: 'USD', order_count: 1n, revenue: 1_000n, qty: '1' },
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.peakHour).toBe(14);
  });

  it('single-currency tenant: identity (no drift)', async () => {
    const svc = makeService([
      { hour: 12, currency: 'UZS', order_count: 2n, revenue: 800_000n, qty: '4' },
    ]);
    const r = await svc.report('acc', RANGE);
    expect(r.rows.find((x) => x.hour === 12)?.revenueMinor).toBe('800000');
    expect(r.mixedCurrency).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Faza Q8 / M-11 — tarixiy kurs (hujjatning o'z `rate_value`'si).
// Soat-bin daromadi endi hujjat kursida baholanadi; Currency jadvali
// qimirlaganda o'tgan davr qayta yozilmaydi. Identity (1e8) = «kurs yo'q».
// ---------------------------------------------------------------------------
type HistHourRow = CannedRow & { rate_value?: bigint };

function makeHourServiceAt(rows: HistHourRow[], usdRate: bigint) {
  const client = {
    currency: {
      findMany: vi.fn(async () => [
        { code: 'UZS', default: true, rateValue: E8, multiplicity: 1, indirect: false },
        { code: 'USD', default: false, rateValue: usdRate * E8, multiplicity: 1, indirect: false },
      ]),
    },
    $queryRaw: vi.fn(async () => rows),
  };
  return new SalesByHourService({ client } as never);
}

const usdHourSale = (rateValue?: bigint): HistHourRow[] => [
  { hour: 10, currency: 'USD', order_count: 1n, revenue: 10_000n, qty: '1', rate_value: rateValue },
];
const hourRevenue = (r: { rows: Array<{ hour: number; revenueMinor: string }> }) =>
  r.rows.find((x) => x.hour === 10)?.revenueMinor;

describe('SalesByHourService — tarixiy kurs (M-11)', () => {
  it('hujjat o‘z kursida baholanadi (joriy kurs EMAS)', async () => {
    const r = await makeHourServiceAt(usdHourSale(11_000n * E8), 12_000n).report('acc', RANGE);
    expect(hourRevenue(r)).toBe('110000000');
  });

  it('joriy kurs 12 000 → 15 000 bo‘lsa ham o‘tgan davr O‘ZGARMAYDI', async () => {
    const before = await makeHourServiceAt(usdHourSale(11_000n * E8), 12_000n).report('acc', RANGE);
    const after = await makeHourServiceAt(usdHourSale(11_000n * E8), 15_000n).report('acc', RANGE);
    expect(hourRevenue(after)).toBe(hourRevenue(before));
  });

  it('identity-qo‘riqchi: default 1e8 kurs joriy kontekstga tushadi', async () => {
    const r = await makeHourServiceAt(usdHourSale(E8), 12_000n).report('acc', RANGE);
    expect(hourRevenue(r)).toBe('120000000');
  });
});
