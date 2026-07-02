import { Prisma } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import { StockInTransitService } from '../stock/stock-in-transit.service.js';
import { StockBalanceService } from './stock-balance.service.js';

/**
 * Unit coverage for the report's *displayed* «Доступно» = `Остаток − Резерв +
 * Ожидание` (backlog B, design doc `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md`).
 *
 * The report derives expected-incoming («Ожидание» / `inTransitQty`) at
 * QUERY-TIME via the shared `StockInTransitService` (unit-tested in
 * apps/api/src/modules/stock/stock-in-transit.service.test.ts) rather than
 * reading the dropped always-0 `Stock.inTransitQty` column. Here we wire a real
 * StockInTransitService over the same mocked Prisma client so the end-to-end
 * report shape (Ожидание populated, available folds it in) is exercised.
 *
 * These stub the Prisma boundary (the established report-service test pattern —
 * see slow-movers/counterparty-balance) with canned Stock + PurchaseOrderPosition
 * rows. The actual relation-filtered SQL is exercised live by
 * scripts/verify-in-transit-stock-balance-smoke.mjs (a stub can't prove the join).
 *
 * § references are to the design doc.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

interface CannedPosition {
  assortmentKind?: string;
  assortmentId: string;
  quantity: Prisma.Decimal;
  receivedQty: Prisma.Decimal;
  purchaseOrder: { storeId: string };
}

interface CannedStock {
  storeId: string;
  assortmentKind?: string;
  assortmentId: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  store?: { id: string; name: string };
}

interface CannedGroup {
  assortmentKind: string;
  assortmentId: string;
  _sum: { qty: Prisma.Decimal; reservedQty: Prisma.Decimal };
}

function makeService(opts: {
  stocks?: CannedStock[];
  grouped?: CannedGroup[];
  positions?: CannedPosition[];
  products?: Array<{ id: string; name: string; code: string | null; uom: string | null }>;
  count?: number;
}) {
  const findManyPositions = vi.fn(async () =>
    (opts.positions ?? []).map((p) => ({ assortmentKind: 'product', ...p })),
  );
  const client = {
    stock: {
      findMany: vi.fn(async () =>
        (opts.stocks ?? []).map((s) => ({ assortmentKind: 'product', ...s })),
      ),
      groupBy: vi.fn(async () => opts.grouped ?? []),
      count: vi.fn(async () => opts.count ?? opts.stocks?.length ?? 0),
    },
    product: { findMany: vi.fn(async () => opts.products ?? []) },
    purchaseOrderPosition: { findMany: findManyPositions },
  };
  // Wire a real StockInTransitService over the same mocked client — the report
  // delegates the in-transit query to it (the shared single-source-of-truth).
  const inTransit = new StockInTransitService({ client } as never);
  const svc = new StockBalanceService({ client } as never, inTransit);
  return { svc, findManyPositions };
}

describe('StockBalanceService — display «Доступно» = Остаток − Резерв + Ожидание (§6)', () => {
  it('flat: populates «Ожидание» and adds it to available + summaries', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(10),
          reservedQty: D(2),
          store: { id: 'S1', name: 'Main' },
        },
      ],
      positions: [
        // 20 ordered, 5 received → 15 in transit
        {
          assortmentId: 'P1',
          quantity: D(20),
          receivedQty: D(5),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [{ id: 'P1', name: 'Prod1', code: 'C1', uom: 'pcs' }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.inTransitQty).toBe('15');
    expect(r.items[0]?.available).toBe('23'); // 10 − 2 + 15
    expect(r.summaries.totalInTransit).toBe('15');
    expect(r.summaries.totalAvailable).toBe('23');
  });

  it('flat zero-regression: with NO in-transit, available stays Остаток − Резерв', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(10),
          reservedQty: D(3),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.inTransitQty).toBe('0');
    expect(r.items[0]?.available).toBe('7');
    expect(r.summaries.totalAvailable).toBe('7');
  });

  it('flat: qty=0 reserved=0 but in-transit>0 → available = in-transit (the old qty===0 short-circuit bug)', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: 'P1',
          qty: D(0),
          reservedQty: D(0),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [
        {
          assortmentId: 'P1',
          quantity: D(55),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', {});
    expect(r.items[0]?.available).toBe('55');
    expect(r.items[0]?.inTransitQty).toBe('55');
  });

  it('grouped: in-transit summed across stores → moysklad worked example 27 − 1 + 55 = 81', async () => {
    const { svc } = makeService({
      grouped: [
        {
          assortmentKind: 'product',
          assortmentId: 'P1',
          _sum: { qty: D(27), reservedQty: D(1) },
        },
      ],
      positions: [
        {
          assortmentId: 'P1',
          quantity: D(30),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
        {
          assortmentId: 'P1',
          quantity: D(25),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S2' },
        },
      ],
      products: [{ id: 'P1', name: 'P', code: null, uom: null }],
    });
    const r = await svc.stockBalanceReport('acc', { groupBy: 'product' });
    expect(r.items[0]?.inTransitQty).toBe('55');
    expect(r.items[0]?.available).toBe('81');
    expect(r.summaries.totalInTransit).toBe('55');
    expect(r.summaries.totalAvailable).toBe('81');
  });

  it('variant/bundle Stock rows never collide with product POs (key namespacing)', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentKind: 'variant',
          assortmentId: 'P1', // same id as the product PO below, different kind
          qty: D(4),
          reservedQty: D(0),
          store: { id: 'S1', name: 'M' },
        },
      ],
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: 'P1',
          quantity: D(9),
          receivedQty: D(0),
          purchaseOrder: { storeId: 'S1' },
        },
      ],
      products: [],
      count: 1,
    });
    const r = await svc.stockBalanceReport('acc', { assortmentKind: 'variant' });
    // variant row must NOT pick up the product PO's in-transit
    expect(r.items[0]?.inTransitQty).toBe('0');
    expect(r.items[0]?.available).toBe('4');
  });
});
