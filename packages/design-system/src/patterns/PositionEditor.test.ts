/**
 * PositionEditor pure-function tests — verify the line-total +
 * order-total math used by every detail page (CustomerOrder, Demand,
 * Supply, InvoiceOut/In, ...). A regression in computeLineTotal
 * silently wrecks every invoice / shipment grand total in the app, so
 * these guard the math at the unit level.
 *
 * Also covers makePositionRow's defaults — every "+ Pozitsiya qo'shish"
 * click goes through this factory.
 */
import { describe, expect, it } from 'vitest';
import {
  type PositionRow,
  computeLineTotal,
  computeOrderTotals,
  makePositionRow,
} from './PositionEditor.tsx';

const row = (over: Partial<PositionRow> = {}): PositionRow => ({
  _uid: 'uid-1',
  assortmentId: 'asst-1',
  productLabel: 'Test product',
  productUom: 'шт',
  quantity: '1',
  priceMinor: '0',
  discount: '0',
  vat: '12',
  vatEnabled: true,
  ...over,
});

describe('makePositionRow', () => {
  it('generates a unique _uid each call', () => {
    const a = makePositionRow();
    const b = makePositionRow();
    expect(a._uid).not.toBe(b._uid);
    expect(a._uid).toMatch(/^[a-z0-9]+$/);
  });

  it('sets sensible defaults: qty=1, price=0, discount=0, vat=12, vatEnabled=true', () => {
    const r = makePositionRow();
    expect(r.quantity).toBe('1');
    expect(r.priceMinor).toBe('0');
    expect(r.discount).toBe('0');
    expect(r.vat).toBe('12');
    expect(r.vatEnabled).toBe(true);
    expect(r.assortmentId).toBeNull();
    expect(r.productLabel).toBe('');
    expect(r.productUom).toBeNull();
  });

  it('respects partial overrides', () => {
    const r = makePositionRow({ quantity: '5', priceMinor: '10000', vatEnabled: false });
    expect(r.quantity).toBe('5');
    expect(r.priceMinor).toBe('10000');
    expect(r.vatEnabled).toBe(false);
    // Other defaults unchanged
    expect(r.discount).toBe('0');
    expect(r.vat).toBe('12');
  });

  it('does NOT set customs fields by default — proves the §41/§45 block is opt-in (no regression for the 10+ non-import documents)', () => {
    const r = makePositionRow();
    expect(r.gtdNumber).toBeUndefined();
    expect(r.gtdSumMinor).toBeUndefined();
    expect(r.countryId).toBeUndefined();
    expect(r.countryLabel).toBeUndefined();
  });

  it('carries customs fields when a customs-enabled document supplies them', () => {
    const r = makePositionRow({
      gtdNumber: '10702030/250420/0001234',
      gtdSumMinor: '4500000',
      countryId: 'c-1',
      countryLabel: 'Китай',
    });
    expect(r.gtdNumber).toBe('10702030/250420/0001234');
    expect(r.gtdSumMinor).toBe('4500000');
    expect(r.countryId).toBe('c-1');
    expect(r.countryLabel).toBe('Китай');
  });
});

describe('computeLineTotal', () => {
  it('returns zeros when qty is 0 or price is 0', () => {
    expect(computeLineTotal(row({ quantity: '0', priceMinor: '1000' }), false)).toEqual({
      net: 0n,
      vat: 0n,
      gross: 0n,
    });
    expect(computeLineTotal(row({ quantity: '5', priceMinor: '0' }), false)).toEqual({
      net: 0n,
      vat: 0n,
      gross: 0n,
    });
  });

  it('computes net/vat/gross when vat is excluded (price + vat on top)', () => {
    // 5 × 10000 tiyin = 50000 net; 12% NDS = 6000; gross = 56000
    const t = computeLineTotal(row({ quantity: '5', priceMinor: '10000', vat: '12' }), false);
    expect(t.net).toBe(50000n);
    expect(t.vat).toBe(6000n);
    expect(t.gross).toBe(56000n);
  });

  it('computes net/vat/gross when vat is included in the price', () => {
    // gross = 56000; 12% extracted: vat = 56000 * 12 / 112 = 6000; net = 50000
    const t = computeLineTotal(row({ quantity: '5', priceMinor: '11200', vat: '12' }), true);
    expect(t.gross).toBe(56000n);
    expect(t.vat).toBe(6000n);
    expect(t.net).toBe(50000n);
  });

  it('skips vat when vatEnabled=false (net = gross, vat = 0)', () => {
    const t = computeLineTotal(
      row({ quantity: '5', priceMinor: '10000', vat: '12', vatEnabled: false }),
      false,
    );
    expect(t.net).toBe(50000n);
    expect(t.vat).toBe(0n);
    expect(t.gross).toBe(50000n);
  });

  it('applies discount before vat: 5 × 10000 with 10% discount = 45000 net + 5400 vat', () => {
    const t = computeLineTotal(
      row({ quantity: '5', priceMinor: '10000', discount: '10', vat: '12' }),
      false,
    );
    // 50000 * (100-10)/100 = 45000 net; 45000 * 12/100 = 5400 vat; gross = 50400
    expect(t.net).toBe(45000n);
    expect(t.vat).toBe(5400n);
    expect(t.gross).toBe(50400n);
  });

  it('handles fractional quantity (6-dp, round-half-up for moysklad qty precision)', () => {
    // 2.5 × 1000 tiyin = 2500
    const t = computeLineTotal(
      row({ quantity: '2.5', priceMinor: '1000', vat: '0', vatEnabled: false }),
      false,
    );
    expect(t.net).toBe(2500n);
    expect(t.gross).toBe(2500n);
  });

  it('keeps the 4th–6th qty decimal (no 3-dp truncation) — billed == shipped', () => {
    // 0.0004 × 2500.00 sum (250000 tiyin) = 1.00 sum = 100 tiyin.
    // The legacy (price × round(qty×1000))/1000n billed 0 here while stock
    // shipped/costed the 0.0004 units — a silent money-integrity divergence.
    const t = computeLineTotal(
      row({ quantity: '0.0004', priceMinor: '250000', vat: '0', vatEnabled: false }),
      false,
    );
    expect(t.net).toBe(100n);
    expect(t.gross).toBe(100n);
  });

  it('handles 0% vat as no vat (no division by zero)', () => {
    const t = computeLineTotal(row({ quantity: '5', priceMinor: '10000', vat: '0' }), false);
    expect(t.net).toBe(50000n);
    expect(t.vat).toBe(0n);
    expect(t.gross).toBe(50000n);
  });
});

describe('computeOrderTotals', () => {
  it('returns zeros for an empty positions array', () => {
    expect(computeOrderTotals([], false)).toEqual({ net: 0n, vat: 0n, gross: 0n });
  });

  it('sums net/vat/gross across multiple rows', () => {
    const positions = [
      row({ _uid: 'r1', quantity: '5', priceMinor: '10000', vat: '12' }),
      row({ _uid: 'r2', quantity: '3', priceMinor: '20000', vat: '12' }),
    ];
    // r1: net=50000, vat=6000, gross=56000
    // r2: net=60000, vat=7200, gross=67200
    // total: net=110000, vat=13200, gross=123200
    const t = computeOrderTotals(positions, false);
    expect(t.net).toBe(110000n);
    expect(t.vat).toBe(13200n);
    expect(t.gross).toBe(123200n);
  });

  it('skips zero-qty rows (do not contribute to totals)', () => {
    const positions = [
      row({ _uid: 'r1', quantity: '0', priceMinor: '10000' }),
      row({ _uid: 'r2', quantity: '5', priceMinor: '1000', vat: '0', vatEnabled: false }),
    ];
    const t = computeOrderTotals(positions, false);
    expect(t.net).toBe(5000n);
    expect(t.gross).toBe(5000n);
  });

  it('respects vatIncluded flag across all rows', () => {
    const positions = [
      row({ _uid: 'r1', quantity: '5', priceMinor: '11200', vat: '12' }),
      row({ _uid: 'r2', quantity: '5', priceMinor: '11200', vat: '12' }),
    ];
    // Each row: gross=56000, vat=6000, net=50000 (vat included)
    const t = computeOrderTotals(positions, true);
    expect(t.gross).toBe(112000n);
    expect(t.vat).toBe(12000n);
    expect(t.net).toBe(100000n);
  });
});
