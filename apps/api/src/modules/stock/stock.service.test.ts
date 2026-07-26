import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { type StockBalance, StockService, netOutstandingReservations } from './stock.service.js';

function makeService() {
  return new StockService({} as never);
}

describe('StockService.assertAvailable', () => {
  const svc = makeService();

  it('passes when balance meets request', () => {
    const balances = new Map<string, StockBalance>([
      [
        'prod-1',
        {
          storeId: 's',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          qty: '10',
          reservedQty: '0',
        },
      ],
    ]);
    expect(() =>
      svc.assertAvailable(
        false,
        [{ assortmentKind: 'product', assortmentId: 'prod-1', requested: '5' }],
        balances,
      ),
    ).not.toThrow();
  });

  it('throws InsufficientStock with shortage detail when below balance', () => {
    const balances = new Map<string, StockBalance>([
      [
        'prod-1',
        {
          storeId: 's',
          assortmentKind: 'product',
          assortmentId: 'prod-1',
          qty: '3',
          reservedQty: '0',
        },
      ],
    ]);
    let caught: unknown;
    try {
      svc.assertAvailable(
        false,
        [{ assortmentKind: 'product', assortmentId: 'prod-1', name: 'Widget', requested: '10' }],
        balances,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    const response = (caught as BadRequestException).getResponse() as {
      error: string;
      details: { shortages: Array<{ shortage: string; requested: string; available: string }> };
    };
    expect(response.error).toBe('InsufficientStock');
    expect(response.details.shortages[0]).toMatchObject({
      requested: '10',
      available: '3',
      shortage: '7',
    });
  });

  it('treats missing balance row as zero', () => {
    const balances = new Map<string, StockBalance>();
    expect(() =>
      svc.assertAvailable(
        false,
        [{ assortmentKind: 'product', assortmentId: 'prod-absent', requested: '1' }],
        balances,
      ),
    ).toThrow(BadRequestException);
  });

  it('bypasses check when allowNegativeStock=true', () => {
    const balances = new Map<string, StockBalance>();
    expect(() =>
      svc.assertAvailable(
        true,
        [{ assortmentKind: 'product', assortmentId: 'prod-absent', requested: '1000' }],
        balances,
      ),
    ).not.toThrow();
  });

  it('reports multiple shortages at once', () => {
    const balances = new Map<string, StockBalance>([
      [
        'p1',
        {
          storeId: 's',
          assortmentKind: 'product',
          assortmentId: 'p1',
          qty: '0',
          reservedQty: '0',
        },
      ],
    ]);
    try {
      svc.assertAvailable(
        false,
        [
          { assortmentKind: 'product', assortmentId: 'p1', requested: '1' },
          { assortmentKind: 'product', assortmentId: 'p2', requested: '5' },
        ],
        balances,
      );
      expect.fail('should have thrown');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as {
        details: { shortages: Array<unknown> };
      };
      expect(resp.details.shortages).toHaveLength(2);
    }
  });
});

// =========================================================================
// Round-4 unit 2 (§114) — reservation ledger net helper (adversarial)
// =========================================================================

describe('netOutstandingReservations', () => {
  const K = { storeId: 's1', assortmentKind: 'product', assortmentId: 'p1' };

  it('returns the held qty for a single reserve', () => {
    const r = netOutstandingReservations([{ ...K, qtyDelta: '5' }]);
    expect(r).toEqual([{ ...K, net: '5' }]);
  });

  it('reserve then exact release ⇒ nothing outstanding (idempotent)', () => {
    const r = netOutstandingReservations([
      { ...K, qtyDelta: '5' },
      { ...K, qtyDelta: '-5' },
    ]);
    expect(r).toEqual([]);
  });

  it('reserve then PARTIAL release ⇒ remainder only', () => {
    const r = netOutstandingReservations([
      { ...K, qtyDelta: '10' },
      { ...K, qtyDelta: '-4' },
    ]);
    expect(r).toEqual([{ ...K, net: '6' }]);
  });

  it('DOUBLE full release cannot drive net negative (no further release emitted)', () => {
    // reserve +5, release -5, then an erroneous second release -5 ⇒ net -5
    // ⇒ excluded (≤0): releaseReservationByDoc emits nothing, so
    // Stock.reservedQty can never go negative from a double unpost/cancel.
    const r = netOutstandingReservations([
      { ...K, qtyDelta: '5' },
      { ...K, qtyDelta: '-5' },
      { ...K, qtyDelta: '-5' },
    ]);
    expect(r).toEqual([]);
  });

  it('decimal exactness: 0.1 + 0.2 − 0.3 == 0 (no float drift ⇒ excluded)', () => {
    const r = netOutstandingReservations([
      { ...K, qtyDelta: '0.1' },
      { ...K, qtyDelta: '0.2' },
      { ...K, qtyDelta: '-0.3' },
    ]);
    expect(r).toEqual([]);
  });

  it('fractional micro-precision sum is exact (6 dp)', () => {
    const r = netOutstandingReservations([
      { ...K, qtyDelta: '1.000001' },
      { ...K, qtyDelta: '2.000002' },
      { ...K, qtyDelta: '-0.000003' },
    ]);
    expect(r).toEqual([{ ...K, net: '3' }]);
  });

  it('aggregates each (store, assortment) key independently', () => {
    const r = netOutstandingReservations([
      { storeId: 's1', assortmentKind: 'product', assortmentId: 'p1', qtyDelta: '3' },
      { storeId: 's1', assortmentKind: 'product', assortmentId: 'p2', qtyDelta: '7' },
      { storeId: 's2', assortmentKind: 'product', assortmentId: 'p1', qtyDelta: '2' },
      { storeId: 's1', assortmentKind: 'product', assortmentId: 'p1', qtyDelta: '-1' },
    ]);
    expect(r).toContainEqual({
      storeId: 's1',
      assortmentKind: 'product',
      assortmentId: 'p1',
      net: '2',
    });
    expect(r).toContainEqual({
      storeId: 's1',
      assortmentKind: 'product',
      assortmentId: 'p2',
      net: '7',
    });
    expect(r).toContainEqual({
      storeId: 's2',
      assortmentKind: 'product',
      assortmentId: 'p1',
      net: '2',
    });
    expect(r).toHaveLength(3);
  });

  it('over-reservation is preserved (no cap — moysklad parity)', () => {
    const r = netOutstandingReservations([{ ...K, qtyDelta: '999999999.999999' }]);
    expect(r).toEqual([{ ...K, net: '999999999.999999' }]);
  });

  it('empty ledger ⇒ empty (clean no-op release)', () => {
    expect(netOutstandingReservations([])).toEqual([]);
  });

  it('many tiny deltas sum exactly to zero (drift stress)', () => {
    const rows = Array.from({ length: 30 }, () => ({ ...K, qtyDelta: '0.000001' }));
    rows.push({ ...K, qtyDelta: '-0.00003' }); // -30 micro
    expect(netOutstandingReservations(rows)).toEqual([]);
  });
});

// =========================================================================
// §2c — assertAvailable now enforces AVAILABLE = qty − reservedQty
// =========================================================================

describe('StockService.assertAvailable — reservation enforcement (§2c)', () => {
  const svc = makeService();
  const bal = (qty: string, reservedQty: string): Map<string, StockBalance> =>
    new Map([
      [
        'p1',
        {
          storeId: 's',
          assortmentKind: 'product',
          assortmentId: 'p1',
          qty,
          reservedQty,
        },
      ],
    ]);
  const req = [{ assortmentKind: 'product', assortmentId: 'p1', requested: '6' }];

  it('ZERO-REGRESSION: reservedQty 0 ⇒ identical to pre-§2c (qty − 0 === qty)', () => {
    expect(() => svc.assertAvailable(false, req, bal('10', '0'))).not.toThrow();
    expect(() => svc.assertAvailable(false, req, bal('5', '0'))).toThrow(BadRequestException);
  });

  it('reserved stock is NOT available to another document (blocks)', () => {
    // 10 on hand, 8 reserved ⇒ available 2 < requested 6 ⇒ shortage
    expect(() => svc.assertAvailable(false, req, bal('10', '8'))).toThrow(BadRequestException);
  });

  it('enough AFTER reservation ⇒ passes', () => {
    // 10 on hand, 3 reserved ⇒ available 7 ≥ requested 6 ⇒ ok
    expect(() => svc.assertAvailable(false, req, bal('10', '3'))).not.toThrow();
  });

  it('shortage detail reports the reservation-adjusted available', () => {
    try {
      svc.assertAvailable(false, req, bal('10', '8'));
      expect.fail('should have thrown');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as {
        details: { shortages: Array<{ available: string; shortage: string }> };
      };
      expect(resp.details.shortages[0]?.available).toBe('2'); // 10 − 8
      expect(resp.details.shortages[0]?.shortage).toBe('4'); // 6 − 2
    }
  });

  it('allowNegativeStock=true still bypasses entirely (reservation ignored)', () => {
    expect(() => svc.assertAvailable(true, req, bal('0', '999'))).not.toThrow();
  });
});

// =========================================================================
// Duplicate-line aggregation + exact (Decimal) sufficiency — oversell guard
// =========================================================================

describe('StockService.assertAvailable — duplicate-line + exactness', () => {
  const svc = makeService();
  const bal = (qty: string): Map<string, StockBalance> =>
    new Map([
      [
        'p1',
        { storeId: 's', assortmentKind: 'product', assortmentId: 'p1', qty, reservedQty: '0' },
      ],
    ]);

  it('TWO lines of the SAME sku are SUMMED before the check (no oversell)', () => {
    // 100 on hand; two 60-unit lines ⇒ 120 requested > 100 ⇒ MUST block.
    // The pre-fix per-line loop passed each 60 ≤ 100 independently → oversold to −20.
    try {
      svc.assertAvailable(
        false,
        [
          { assortmentKind: 'product', assortmentId: 'p1', requested: '60' },
          { assortmentKind: 'product', assortmentId: 'p1', requested: '60' },
        ],
        bal('100'),
      );
      expect.fail('should have thrown — 60+60 > 100');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as {
        details: { shortages: Array<{ requested: string; available: string; shortage: string }> };
      };
      expect(resp.details.shortages).toHaveLength(1); // aggregated to ONE line
      expect(resp.details.shortages[0]).toMatchObject({
        requested: '120',
        available: '100',
        shortage: '20',
      });
    }
  });

  it('duplicate lines that TOGETHER fit still pass', () => {
    expect(() =>
      svc.assertAvailable(
        false,
        [
          { assortmentKind: 'product', assortmentId: 'p1', requested: '40' },
          { assortmentKind: 'product', assortmentId: 'p1', requested: '60' },
        ],
        bal('100'),
      ),
    ).not.toThrow();
  });

  it('fractional sub-unit sufficiency is exact (no float drift)', () => {
    // 0.3 on hand, request 0.1 + 0.2 ⇒ exactly 0.3 ⇒ passes (float 0.1+0.2=0.30000000000000004 would wrongly block)
    expect(() =>
      svc.assertAvailable(
        false,
        [
          { assortmentKind: 'product', assortmentId: 'p1', requested: '0.1' },
          { assortmentKind: 'product', assortmentId: 'p1', requested: '0.2' },
        ],
        bal('0.3'),
      ),
    ).not.toThrow();
  });

  it('fractional oversell by one micro-unit is caught', () => {
    expect(() =>
      svc.assertAvailable(
        false,
        [{ assortmentKind: 'product', assortmentId: 'p1', requested: '0.300001' }],
        bal('0.3'),
      ),
    ).toThrow(BadRequestException);
  });
});
