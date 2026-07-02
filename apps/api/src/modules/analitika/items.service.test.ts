import { describe, expect, it, vi } from 'vitest';
import { ItemsService } from './items.service.js';

const ACC = 'acc-1';
const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const CP1 = '33333333-3333-3333-3333-333333333333';

function makePrisma(over: Record<string, unknown> = {}) {
  const client = {
    product: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: P1,
          code: 'PR-1',
          name: 'Sement',
          uom: 'kg',
          productFolderId: 'f1',
          supplierId: CP1,
          country: 'UZ',
          buyPrice: 8000n,
          salePrices: [{ value: '10000' }],
        },
        {
          id: P2,
          code: 'PR-2',
          name: "G'isht",
          uom: 'dona',
          productFolderId: 'f1',
          supplierId: null,
          country: null,
          buyPrice: 5000n,
          salePrices: [{ value: '7000' }],
        },
      ]),
    },
    priceType: { findFirst: vi.fn().mockResolvedValue(null) },
    productFolder: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'f1',
          name: 'Qurilish materiallari',
          pathName: 'Qurilish materiallari',
          _count: { products: 2 },
        },
        {
          id: 'f2',
          name: 'Asboblar',
          pathName: 'Qurilish materiallari/Asboblar',
          _count: { products: 0 },
        },
      ]),
    },
    supplyPosition: {
      groupBy: vi.fn().mockResolvedValue([{ productId: P1, _sum: { quantity: 100 } }]),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { productId: P1, supply: { moment: new Date('2026-05-20T00:00:00Z'), agentId: CP1 } },
        ]),
    },
    demandPosition: {
      groupBy: vi.fn().mockResolvedValue([{ productId: P1, _sum: { quantity: 60 } }]),
    },
    stock: {
      groupBy: vi.fn().mockResolvedValue([
        { assortmentId: P1, _sum: { qty: 40 } },
        { assortmentId: P2, _sum: { qty: 3 } }, // low stock
      ]),
    },
    counterparty: {
      findMany: vi.fn().mockResolvedValue([{ id: CP1, name: 'Akme MChJ' }]),
    },
    ...over,
  };
  return { client } as never;
}

describe('ItemsService.list', () => {
  it('returns rows with aggregates and resolves last-partner name', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, {});
    expect(res.items).toHaveLength(2);
    expect(res.total).toBe(2);
    const r1 = res.items.find((r) => r.id === P1);
    if (!r1) throw new Error('row missing');
    expect(r1.code).toBe('PR-1');
    expect(r1.unitName).toBe('kg');
    expect(r1.country).toBe('UZ');
    expect(r1.buyPrice).toBe(8000);
    expect(r1.sellPrice).toBe(10000);
    expect(r1.purchasedQty).toBe(100);
    expect(r1.soldQty).toBe(60);
    expect(r1.stock).toBe(40);
    expect(r1.lastPartnerId).toBe(CP1);
    expect(r1.lastPartnerName).toBe('Akme MChJ');
    expect(r1.groupName).toBe('Qurilish materiallari');
    expect(r1.imageUrl).toBeNull(); // not tracked
    expect(r1.brand).toBeNull();
  });

  it('soldInPeriod mirrors soldQty when no period filter is set', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, {});
    const r1 = res.items.find((r) => r.id === P1);
    if (!r1) throw new Error('row missing');
    expect(r1.soldInPeriod).toBe(60);
  });

  it('lowStock filter excludes products at or above the threshold (10)', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, { lowStock: 'true' });
    // P1 stock 40 — excluded; P2 stock 3 — included.
    expect(res.items.map((i) => i.id)).toEqual([P2]);
  });

  it('noPartner filter applies at the DB layer (where: supplierId null)', async () => {
    const prisma = makePrisma();
    const svc = new ItemsService(prisma);
    await svc.list(ACC, { noPartner: 'true' });
    const where = (prisma as never as ReturnType<typeof makePrisma>).client.product.findMany.mock
      .calls[0][0].where;
    expect(where.supplierId).toBeNull();
  });

  it('sort=stock desc reorders rows by aggregated stock', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, { sort: 'stock', order: 'desc' });
    expect(res.items.map((i) => i.id)).toEqual([P1, P2]); // 40 > 3
  });

  it('sort=sellPrice asc orders by ascending sale price', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, { sort: 'sellPrice', order: 'asc' });
    expect(res.items.map((i) => i.id)).toEqual([P2, P1]); // 7000 < 10000
  });

  it('pagination slices the sorted set', async () => {
    const svc = new ItemsService(makePrisma());
    const res = await svc.list(ACC, { page: '1', pageSize: '1' });
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(2);
    expect(res.pagination ?? res.totalPages).toBe(2);
  });
});

describe('ItemsService.stats', () => {
  it('counts totalItems / lowStockCount / noPartnerCount', async () => {
    const svc = new ItemsService(makePrisma());
    const s = await svc.stats(ACC, {});
    expect(s.totalItems).toBe(2);
    expect(s.lowStockCount).toBe(1); // P2 has 3 < 10
    expect(s.noPartnerCount).toBe(1); // P2 has no supplier
  });
});

describe('ItemsService.groups', () => {
  it('returns flat groups with name + path + item count', async () => {
    const svc = new ItemsService(makePrisma());
    const { groups } = await svc.groups(ACC);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      groupId: 'f1',
      groupName: 'Qurilish materiallari',
      itemCount: 2,
    });
    expect(groups[1].groupPath).toBe('Qurilish materiallari/Asboblar');
  });
});
