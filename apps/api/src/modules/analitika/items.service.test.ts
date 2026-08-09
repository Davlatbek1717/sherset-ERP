import { describe, expect, it, vi } from 'vitest';
import { ItemsService, MAX_PRODUCTS_PER_QUERY } from './items.service.js';

const ACC = 'acc-1';
const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const CP1 = '33333333-3333-3333-3333-333333333333';

const BASE_PRODUCTS = [
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
];

function makePrisma(over: Record<string, unknown> = {}) {
  const client = {
    product: {
      // `skip`/`take` DB semantikasi bilan — servis endi DB-paginate qiladi
      // (Faza Q5), shuning uchun dubl ham kesishi SHART.
      findMany: vi.fn(async (args: { skip?: number; take?: number } = {}) => {
        const start = args.skip ?? 0;
        const end = args.take === undefined ? undefined : start + args.take;
        return BASE_PRODUCTS.slice(start, end);
      }),
      count: vi.fn(async (args: { where?: { supplierId?: string | null } } = {}) =>
        args.where && 'supplierId' in args.where && args.where.supplierId === null
          ? BASE_PRODUCTS.filter((p) => p.supplierId === null).length
          : BASE_PRODUCTS.length,
      ),
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

// ---------------------------------------------------------------------------
// Faza Q5 (`PERF-01`) — cap-to'g'riligi.
//
// Bu blok Prisma-dublni DB SEMANTIKASI bilan yuritadi (where → orderBy →
// skip/take, va alohida `count`), shuning uchun «10 000 lik cap» xulqi jonli
// DB dagidek ko'rinadi: `take` dan tashqarida qolgan qator NAZARDAN QOLADI.
// Ayni shu narsa `total` ni yolg'on qilardi va hech kim buni bilmasdi.
// ---------------------------------------------------------------------------

/** Servisdagi `MAX_PRODUCTS_PER_QUERY` bilan bir xil bo'lishi SHART. */
const CAP = 10_000;

it('cap konstantasi test kutgan qiymat bilan bir xil', () => {
  // Quyidagi stsenariylar `CAP + 5` to'plam quradi — konstanta jimgina
  // o'zgarsa ular «cap'dan katta» ni tekshirishni to'xtatib qo'yardi.
  expect(MAX_PRODUCTS_PER_QUERY).toBe(CAP);
});

interface FakeProduct {
  id: string;
  code: string | null;
  name: string;
  uom: string | null;
  productFolderId: string | null;
  supplierId: string | null;
  country: string | null;
  buyPrice: bigint;
  salePrices: unknown;
  article: string | null;
}

type WhereLike = {
  productFolderId?: string;
  supplierId?: string | null;
  id?: { in?: string[] };
  OR?: Array<Record<string, { contains?: string }>>;
};
type OrderByLike = Record<string, 'asc' | 'desc'>;
type FindManyArgs = {
  where?: WhereLike;
  orderBy?: OrderByLike | OrderByLike[];
  skip?: number;
  take?: number;
};

function matchesWhere(p: FakeProduct, where: WhereLike | undefined): boolean {
  if (!where) return true;
  if (where.productFolderId !== undefined && p.productFolderId !== where.productFolderId)
    return false;
  if ('supplierId' in where && where.supplierId === null && p.supplierId !== null) return false;
  if (where.id?.in && !where.id.in.includes(p.id)) return false;
  if (Array.isArray(where.OR)) {
    const hit = where.OR.some((clause) => {
      const entry = Object.entries(clause)[0];
      if (!entry) return false;
      const [field, cond] = entry;
      const needle = cond?.contains;
      if (!needle) return false;
      const value = (p as unknown as Record<string, unknown>)[field];
      return typeof value === 'string' && value.toLowerCase().includes(needle.toLowerCase());
    });
    if (!hit) return false;
  }
  return true;
}

function applyOrderBy(rows: FakeProduct[], orderBy: FindManyArgs['orderBy']): FakeProduct[] {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const entry = Object.entries(spec)[0];
      if (!entry) continue;
      const [field, dir] = entry;
      const av = String((a as unknown as Record<string, unknown>)[field] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[field] ?? '');
      if (av !== bv) return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

/**
 * `stockOf` — mahsulot indeksidan qoldiq. Katta to'plamda saralash/lowStock
 * yo'llarini haqiqiy qilish uchun.
 */
function makeScalePrisma(products: FakeProduct[], stockOf: (p: FakeProduct) => number) {
  const findMany = vi.fn(async (args: FindManyArgs) => {
    const matched = products.filter((p) => matchesWhere(p, args.where));
    const ordered = applyOrderBy(matched, args.orderBy);
    const start = args.skip ?? 0;
    const end = args.take === undefined ? undefined : start + args.take;
    return ordered.slice(start, end);
  });
  const count = vi.fn(
    async (args: FindManyArgs) => products.filter((p) => matchesWhere(p, args.where)).length,
  );
  const client = {
    product: { findMany, count },
    priceType: { findFirst: vi.fn().mockResolvedValue(null) },
    productFolder: { findMany: vi.fn().mockResolvedValue([]) },
    supplyPosition: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    demandPosition: { groupBy: vi.fn().mockResolvedValue([]) },
    stock: {
      groupBy: vi.fn(async (args: { where: { assortmentId?: { in?: string[] } } }) => {
        const ids = new Set(args.where.assortmentId?.in ?? []);
        return products
          .filter((p) => ids.has(p.id))
          .map((p) => ({ assortmentId: p.id, _sum: { qty: stockOf(p) } }));
      }),
    },
    counterparty: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma: { client } as never, client };
}

/** `n` ta tovar; oxirgi ikkitasi ATAYLAB cap-oynasidan tashqarida. */
function buildCatalogue(n: number): FakeProduct[] {
  const rows: FakeProduct[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: `p-${String(i).padStart(6, '0')}`,
      code: `C-${String(i).padStart(6, '0')}`,
      name: `Tovar-${String(i).padStart(6, '0')}`,
      uom: 'dona',
      productFolderId: null,
      supplierId: i % 2 === 0 ? CP1 : null,
      country: null,
      buyPrice: 1000n,
      salePrices: [{ value: String(1000 + (i % 97)) }],
      article: null,
    });
  }
  // Cap oynasidan (birinchi 10 000 ta) TASHQARIDAGI ikki maxsus qator.
  const last = rows[n - 1];
  const beforeLast = rows[n - 2];
  if (last) {
    last.name = 'AAA-alifboda-birinchi';
    last.code = 'AAA-0001';
  }
  if (beforeLast) {
    beforeLast.name = 'Noyob-Sement-9xQ';
  }
  return rows;
}

describe('ItemsService.list — cap-to’g’riligi (Faza Q5, PERF-01)', () => {
  const BIG_N = CAP + 5;

  it('sort=name da sahifani DB dan oladi (10k RAM-tortish YO’Q) va total butun-scope', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma, client } = makeScalePrisma(products, (p) => Number(p.id.slice(2)) % 50);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { page: '1', pageSize: '50' });

    expect(res.total).toBe(BIG_N); // cap'dan emas, butun scope'dan
    expect(res.truncated).toBe(false); // DB-paginate: hech narsa kesilmadi
    expect(res.items).toHaveLength(50);
    const call = client.product.findMany.mock.calls[0]?.[0] as FindManyArgs;
    expect(call.take).toBe(50); // 10 000 EMAS
    expect(call.skip).toBe(0);
  });

  it('sort=name asc alifbodagi birinchi tovarni topadi (cap oynasidan tashqarida)', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma } = makeScalePrisma(products, () => 5);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { sort: 'name', order: 'asc', page: '1', pageSize: '10' });
    expect(res.items[0]?.name).toBe('AAA-alifboda-birinchi');
  });

  it('DB-paginate sahifa 2 ni skip bilan oladi', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma, client } = makeScalePrisma(products, () => 5);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { sort: 'code', order: 'asc', page: '2', pageSize: '25' });
    const call = client.product.findMany.mock.calls[0]?.[0] as FindManyArgs;
    expect(call.skip).toBe(25);
    expect(call.take).toBe(25);
    expect(res.items).toHaveLength(25);
    expect(res.total).toBe(BIG_N);
  });

  it('agregat-saralash (sort=stock) cap ga uriladi — total butun-scope, truncated TRUE', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma } = makeScalePrisma(products, (p) => Number(p.id.slice(2)) % 50);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { sort: 'stock', order: 'desc', page: '1', pageSize: '20' });
    expect(res.total).toBe(BIG_N);
    expect(res.truncated).toBe(true); // jimgina kesish TAQIQ
  });

  it('cap dan kichik to’plamda agregat-saralash truncated=false', async () => {
    const products = buildCatalogue(30);
    const { prisma } = makeScalePrisma(products, (p) => Number(p.id.slice(2)) % 50);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { sort: 'stock', order: 'desc' });
    expect(res.total).toBe(30);
    expect(res.truncated).toBe(false);
  });

  it('qidiruv cap oynasidan tashqaridagi tovarni topadi (SQL pre-filtr)', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma } = makeScalePrisma(products, () => 5);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { search: 'Noyob' });
    expect(res.total).toBe(1);
    expect(res.items.map((i) => i.name)).toEqual(['Noyob-Sement-9xQ']);
    expect(res.truncated).toBe(false);
  });

  it('lowStock filtri cap ga urilganda truncated TRUE (jim kesish yo’q)', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma } = makeScalePrisma(products, (p) => Number(p.id.slice(2)) % 50);
    const svc = new ItemsService(prisma);
    const res = await svc.list(ACC, { lowStock: 'true' });
    expect(res.truncated).toBe(true);
  });
});

describe('ItemsService.stats — cap-to’g’riligi (Faza Q5, PERF-01)', () => {
  const BIG_N = CAP + 5;

  it('totalItems/noPartnerCount butun-scope count dan, truncated bayrog’i bilan', async () => {
    const products = buildCatalogue(BIG_N);
    const { prisma } = makeScalePrisma(products, (p) => Number(p.id.slice(2)) % 50);
    const svc = new ItemsService(prisma);
    const s = await svc.stats(ACC, {});
    expect(s.totalItems).toBe(BIG_N); // 10 000 EMAS
    expect(s.noPartnerCount).toBe(products.filter((p) => !p.supplierId).length);
    expect(s.truncated).toBe(true); // lowStockCount hamon cap-oyna ichida
  });

  it('kichik to’plamda stats truncated=false va sanoqlar aniq', async () => {
    const products = buildCatalogue(12);
    const { prisma } = makeScalePrisma(products, (p) => (Number(p.id.slice(2)) < 4 ? 1 : 40));
    const svc = new ItemsService(prisma);
    const s = await svc.stats(ACC, {});
    expect(s.totalItems).toBe(12);
    expect(s.lowStockCount).toBe(4);
    expect(s.noPartnerCount).toBe(6);
    expect(s.truncated).toBe(false);
  });
});
