import { Prisma } from '@moysklad/db';
import { describe, expect, it, vi } from 'vitest';
import { StockInTransitService } from '../stock/stock-in-transit.service.js';
import { StockBalanceService } from './stock-balance.service.js';

/**
 * F1 (2026-08-23 reja) — servis darajasi: `groupBy=warehouse` rejimi va
 * `productCells` endpoint-mantig'i. Prisma chegarasi stub (report-servis test
 * naqshi — stock-balance.service.test.ts bilan bir xil); haqiqiy SQL jonli
 * muhitda deploy-verify bosqichida tekshiriladi.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

function makeService(opts: {
  prefixRows?: Array<{ prefix: string | null; sku_count: bigint; qty: string }>;
  agg?: {
    total_qty: string;
    total_sku: bigint;
    unassigned_qty: string;
    unassigned_sku: bigint;
  };
  stocks?: Array<{
    storeId: string;
    assortmentKind?: string;
    assortmentId: string;
    qty: Prisma.Decimal;
    store?: { id: string; name: string };
  }>;
  cellRows?: Array<{
    storeId: string;
    cellId: string;
    assortmentKind?: string;
    assortmentId: string;
    qty: Prisma.Decimal;
    cell: { id: string; name: string };
  }>;
  products?: Array<{ id: string }>;
}) {
  const queryRaw = vi
    .fn()
    // 1-chaqiruv: prefiks agregatlari; 2-chaqiruv: JAMI/Taqsimlanmagan.
    .mockResolvedValueOnce(opts.prefixRows ?? [])
    .mockResolvedValueOnce([
      opts.agg ?? {
        total_qty: '0',
        total_sku: 0n,
        unassigned_qty: '0',
        unassigned_sku: 0n,
      },
    ]);
  const client = {
    stock: {
      findMany: vi.fn(async () =>
        (opts.stocks ?? []).map((s) => ({ assortmentKind: 'product', ...s })),
      ),
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    stockByCell: {
      findMany: vi.fn(async () =>
        (opts.cellRows ?? []).map((c) => ({ assortmentKind: 'product', ...c })),
      ),
    },
    product: { findMany: vi.fn(async () => opts.products ?? []) },
    purchaseOrderPosition: { findMany: vi.fn(async () => []) },
    $queryRaw: queryRaw,
  };
  const inTransit = new StockInTransitService({ client } as never);
  const svc = new StockBalanceService({ client } as never, inTransit);
  return { svc, client };
}

describe('StockBalanceService — groupBy=warehouse (F1: yacheyka-prefiks kesimi)', () => {
  it('prefiks qatorlari + Taqsimlanmagan + JAMI to`liq DB agregatlaridan keladi', async () => {
    const { svc } = makeService({
      prefixRows: [
        { prefix: '02', sku_count: 291n, qty: '2000000' },
        { prefix: '01', sku_count: 119n, qty: '950000' },
      ],
      agg: {
        total_qty: '52500000',
        total_sku: 400n,
        unassigned_qty: '49550000',
        unassigned_sku: 380n,
      },
    });
    const r = await svc.stockBalanceReport('acc', { groupBy: 'warehouse' });
    expect(r.warehouses).toBeDefined();
    expect(r.warehouses?.rows.map((x) => x.prefix)).toEqual(['01', '02']);
    expect(r.warehouses?.rows[0]?.qty).toBe('950000');
    expect(r.warehouses?.unassigned.qty).toBe('49550000');
    expect(r.warehouses?.totalQty).toBe('52500000');
    // invariant: Σprefiks + Taqsimlanmagan == JAMI
    expect(950000 + 2000000 + 49550000).toBe(52500000);
    // bu rejimda items ishlatilmaydi, summaries qty-o'qini aks ettiradi
    expect(r.items).toEqual([]);
    expect(r.summaries.totalQty).toBe('52500000');
    expect(r.summaries.totalSku).toBe(400);
    expect(r.truncated).toBe(false);
  });

  it('qidiruv hech narsa topmasa — bo`sh hisobot (warehouses yo`q)', async () => {
    const { svc, client } = makeService({ products: [] });
    const r = await svc.stockBalanceReport('acc', { groupBy: 'warehouse', search: 'yo-q-tovar' });
    expect(r.items).toEqual([]);
    expect(r.warehouses).toBeUndefined();
    // SQL agregatlarigacha yetib bormaydi
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });

  it('storeId filtri ikkala agregat so`roviga ham uzatiladi', async () => {
    const { svc, client } = makeService({});
    await svc.stockBalanceReport('acc', {
      groupBy: 'warehouse',
      storeId: '968f9da2-6dbb-4375-b5e2-d19799b51de6',
    });
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe('StockBalanceService.productCells — tovar kartasi yacheykalar kesimi', () => {
  const PID = '11111111-1111-4111-8111-111111111111';

  it('ombor ostida prefiks-guruhlar va biriktirilmagan qoldiq', async () => {
    const { svc } = makeService({
      stocks: [
        {
          storeId: 'S1',
          assortmentId: PID,
          qty: D(100),
          store: { id: 'S1', name: 'Ombor 2' },
        },
      ],
      cellRows: [
        {
          storeId: 'S1',
          cellId: 'c1',
          assortmentId: PID,
          qty: D(10),
          cell: { id: 'c1', name: '01-02-03-04' },
        },
        {
          storeId: 'S1',
          cellId: 'c2',
          assortmentId: PID,
          qty: D(30),
          cell: { id: 'c2', name: '02-01-01-01' },
        },
      ],
    });
    const r = await svc.productCells('acc', { assortmentId: PID });
    expect(r.assortmentKind).toBe('product');
    expect(r.stores).toHaveLength(1);
    expect(r.stores[0]?.totalQty).toBe('100');
    expect(r.stores[0]?.assignedQty).toBe('40');
    expect(r.stores[0]?.unassignedQty).toBe('60');
    expect(r.stores[0]?.groups.map((g) => g.prefix)).toEqual(['01', '02']);
  });

  it('assortmentId bo`lmasa 400', async () => {
    const { svc } = makeService({});
    await expect(svc.productCells('acc', {})).rejects.toThrow();
  });
});
