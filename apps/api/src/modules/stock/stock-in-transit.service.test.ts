import { Prisma } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import {
  StockInTransitService,
  inTransitAssortmentKey,
  inTransitStoreKey,
} from './stock-in-transit.service.js';

/**
 * Unit coverage for the shared expected-incoming («Ожидание» / in-transit)
 * computation (backlog B, design doc `_IN-TRANSIT-OZHIDANIE-DESIGN-2026-06-12.md`).
 *
 * This is the SINGLE SOURCE OF TRUTH consumed by both the stock-balance report
 * and the products list. It derives in-transit at QUERY-TIME from active
 * supplier-order positions rather than reading the (dropped) always-0
 * `Stock.inTransitQty` column.
 *
 * Stubs the Prisma boundary (the established report-service test pattern) with
 * canned PurchaseOrderPosition rows. The actual relation-filtered SQL is
 * exercised live by scripts/verify-*-smoke.mjs (a stub can't prove the join).
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

function makeService(positions: CannedPosition[] = []) {
  const findManyPositions = vi.fn(async () =>
    positions.map((p) => ({ assortmentKind: 'product', ...p })),
  );
  const client = {
    purchaseOrderPosition: { findMany: findManyPositions },
  };
  const svc = new StockInTransitService({ client } as never);
  return { svc, findManyPositions };
}

describe('StockInTransitService — getInTransitMap (expected-incoming, §5)', () => {
  it('clamps per position with MAX(0, qty − received) and sums across POs per (store, product)', async () => {
    const { svc } = makeService([
      { assortmentId: 'P1', quantity: D(10), receivedQty: D(0), purchaseOrder: { storeId: 'S1' } },
      // partially received → remainder 3
      { assortmentId: 'P1', quantity: D(5), receivedQty: D(2), purchaseOrder: { storeId: 'S1' } },
      // over-received → clamps to 0, must NOT subtract from the bucket
      { assortmentId: 'P2', quantity: D(4), receivedQty: D(6), purchaseOrder: { storeId: 'S1' } },
      // same product, different store → separate bucket
      { assortmentId: 'P1', quantity: D(7), receivedQty: D(0), purchaseOrder: { storeId: 'S2' } },
    ]);
    const m = await svc.getInTransitMap('acc', {});
    expect(m.get(inTransitStoreKey('S1', 'product', 'P1'))?.toString()).toBe('13');
    expect(m.has(inTransitStoreKey('S1', 'product', 'P2'))).toBe(false);
    expect(m.get(inTransitStoreKey('S2', 'product', 'P1'))?.toString()).toBe('7');
  });

  it('getInTransitByAssortment sums across stores per product (grouped + products-list mode)', async () => {
    const { svc } = makeService([
      { assortmentId: 'P1', quantity: D(30), receivedQty: D(0), purchaseOrder: { storeId: 'S1' } },
      { assortmentId: 'P1', quantity: D(25), receivedQty: D(0), purchaseOrder: { storeId: 'S2' } },
    ]);
    const m = await svc.getInTransitByAssortment('acc', {});
    expect(m.get(inTransitAssortmentKey('product', 'P1'))?.toString()).toBe('55');
  });

  it('queries ONLY confirmed/partially_received non-deleted POs, tenant- and store-scoped (§5 non-vacuous guard)', async () => {
    const { svc, findManyPositions } = makeService([]);
    await svc.getInTransitMap('acc', { storeId: 'S1', assortmentIds: ['P1', 'P2'] });
    const arg = findManyPositions.mock.calls[0]?.[0] as {
      where: {
        accountId: string;
        assortmentId: { in: string[] };
        purchaseOrder: {
          state: { in: string[] };
          deletedAt: null;
          storeId: string;
          accountId: string;
        };
      };
    };
    expect(arg.where.accountId).toBe('acc');
    expect(arg.where.assortmentId).toEqual({ in: ['P1', 'P2'] });
    expect(arg.where.purchaseOrder.state).toEqual({ in: ['confirmed', 'partially_received'] });
    expect(arg.where.purchaseOrder.deletedAt).toBeNull();
    expect(arg.where.purchaseOrder.storeId).toBe('S1');
    expect(arg.where.purchaseOrder.accountId).toBe('acc');
  });
});

/**
 * MK15 — «yo'ldagi tovarda qancha PUL turibdi».
 *
 * The value method deliberately lives HERE, on the service that already owns
 * the in-transit definition, rather than in the manager panel: the panel must
 * not get to decide what «in transit» means. It reuses the very same
 * per-position `MAX(0, qty − received)` clamp, so quantity and value can never
 * disagree, and it prices the remainder with the shared `computePositionTotal`
 * primitive (`@moysklad/money`) — the same one the stored document totals use.
 *
 * PO-level `sumMinor − receivedSumMinor` was REJECTED as the source: that is an
 * aggregate-level clamp, so one over-received line would silently erode another
 * line's expected-incoming value (the exact defect the per-position clamp exists
 * to prevent).
 */
describe('StockInTransitService — getInTransitValueByCurrency (MK15)', () => {
  function makeValueService(
    positions: Array<{
      quantity: Prisma.Decimal;
      receivedQty: Prisma.Decimal;
      priceMinor: bigint;
      discount?: Prisma.Decimal;
      purchaseOrder: { storeId: string; currency: string };
    }>,
  ) {
    const findManyPositions = vi.fn(async () =>
      positions.map((p) => ({
        assortmentKind: 'product',
        assortmentId: 'P1',
        discount: D(0),
        ...p,
      })),
    );
    const client = { purchaseOrderPosition: { findMany: findManyPositions } };
    const svc = new StockInTransitService({ client } as never);
    return { svc, findManyPositions };
  }

  it('qolgan miqdorni narxga ko‘paytiradi (qabul qilingani chiqarib tashlanadi)', async () => {
    const { svc } = makeValueService([
      {
        quantity: D(10),
        receivedQty: D(4),
        priceMinor: 1_000_00n,
        purchaseOrder: { storeId: 'S1', currency: 'UZS' },
      },
    ]);
    // qolgan 6 × 1 000.00 = 6 000.00 → 600 000 tiyin
    expect(await svc.getInTransitValueByCurrency('acc')).toEqual([
      { currency: 'UZS', amountMinor: 600_000n },
    ]);
  });

  it('ortiqcha qabul qilingan qator MANFIY qo‘shmaydi (per-position clamp)', async () => {
    const { svc } = makeValueService([
      {
        quantity: D(5),
        receivedQty: D(9),
        priceMinor: 1_000_00n,
        purchaseOrder: { storeId: 'S1', currency: 'UZS' },
      },
      {
        quantity: D(3),
        receivedQty: D(0),
        priceMinor: 1_000_00n,
        purchaseOrder: { storeId: 'S1', currency: 'UZS' },
      },
    ]);
    expect(await svc.getInTransitValueByCurrency('acc')).toEqual([
      { currency: 'UZS', amountMinor: 300_000n },
    ]);
  });

  it('chegirma qo‘llanadi (umumiy `computePositionTotal` bilan)', async () => {
    const { svc } = makeValueService([
      {
        quantity: D(2),
        receivedQty: D(0),
        priceMinor: 1_000_00n,
        discount: D(10),
        purchaseOrder: { storeId: 'S1', currency: 'UZS' },
      },
    ]);
    // 2 × 1 000.00 = 2 000.00, −10% = 1 800.00 → 180 000 tiyin
    expect(await svc.getInTransitValueByCurrency('acc')).toEqual([
      { currency: 'UZS', amountMinor: 180_000n },
    ]);
  });

  it('valyutalar ALOHIDA qoladi — bu yerda konvertatsiya YO‘Q', async () => {
    const { svc } = makeValueService([
      {
        quantity: D(1),
        receivedQty: D(0),
        priceMinor: 1_000_00n,
        purchaseOrder: { storeId: 'S1', currency: 'UZS' },
      },
      {
        quantity: D(1),
        receivedQty: D(0),
        priceMinor: 50_00n,
        purchaseOrder: { storeId: 'S2', currency: 'USD' },
      },
    ]);
    expect(await svc.getInTransitValueByCurrency('acc')).toEqual([
      { currency: 'UZS', amountMinor: 100_000n },
      { currency: 'USD', amountMinor: 5_000n },
    ]);
  });

  it('yo‘lda tovar yo‘q — bo‘sh massiv (o‘lchandi va nol)', async () => {
    const { svc } = makeValueService([]);
    expect(await svc.getInTransitValueByCurrency('acc')).toEqual([]);
  });

  it('faqat faol xarid buyurtmalari (o‘chirilganlar emas)', async () => {
    const { svc, findManyPositions } = makeValueService([]);
    await svc.getInTransitValueByCurrency('acc');
    const arg = findManyPositions.mock.calls[0]?.[0] as {
      where: { accountId: string; purchaseOrder: { state: { in: string[] }; deletedAt: null } };
    };
    expect(arg.where.accountId).toBe('acc');
    expect(arg.where.purchaseOrder.state).toEqual({ in: ['confirmed', 'partially_received'] });
    expect(arg.where.purchaseOrder.deletedAt).toBeNull();
  });
});
