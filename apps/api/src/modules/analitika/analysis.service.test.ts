import { describe, expect, it, vi } from 'vitest';
import { AnalysisService } from './analysis.service.js';

const ACC = 'acc-1';
const CP = 'cp-1';
const P1 = 'p-1';

function makePrisma(over: Record<string, unknown> = {}) {
  const client = {
    counterparty: {
      findFirst: vi.fn().mockResolvedValue({
        id: CP,
        code: 'CP-001',
        name: 'Akme MChJ',
        legalTitle: '"Akme" MChJ',
        companyType: 'legalUZ',
        phone: '+998901112233',
        legalAddress: 'Toshkent',
        actualAddress: null,
        description: null,
        uzRequisites: { inn: '301234567', okoned: '47.30', mfo: '00014' },
        archived: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-05-26T00:00:00Z'),
        groupId: 'g-1',
        group: { name: 'Yetkazib beruvchilar' },
      }),
      findMany: vi.fn().mockResolvedValue([
        {
          id: CP,
          code: 'CP-001',
          name: 'Akme MChJ',
          legalTitle: '"Akme" MChJ',
          companyType: 'legalUZ',
          phone: '+998901112233',
          legalAddress: 'Toshkent',
          actualAddress: null,
          description: null,
          uzRequisites: { inn: '301234567', okoned: '47.30', mfo: '00014' },
          archived: false,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-05-26T00:00:00Z'),
          groupId: 'g-1',
          group: { name: 'Yetkazib beruvchilar' },
        },
      ]),
      count: vi.fn().mockResolvedValue(1),
    },
    group: {
      findMany: vi.fn().mockResolvedValue([{ name: 'Yetkazib beruvchilar' }, { name: 'Mijozlar' }]),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: P1,
          code: 'PR-1',
          name: 'Sement M400',
          uom: 'kg',
          buyPrice: 8000n,
          salePrices: [{ value: '10000' }],
        },
      ]),
    },
    supplyPosition: {
      findMany: vi.fn().mockResolvedValue([{ productId: P1, quantity: 10, priceMinor: 8000n }]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ supply: { moment: new Date('2026-05-01T00:00:00Z') } }),
    },
    demandPosition: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ productId: P1, quantity: 6, priceMinor: 10000n, costMinor: 8000n }]),
      findFirst: vi
        .fn()
        .mockResolvedValue({ demand: { moment: new Date('2026-05-20T00:00:00Z') } }),
    },
    stock: {
      findMany: vi.fn().mockResolvedValue([{ assortmentId: P1, qty: 4 }]),
    },
    priceType: {
      // Account default price type — analyze() resolves it to read salePrices by id.
      findFirst: vi.fn().mockResolvedValue({ id: 'pt-default' }),
    },
    ...over,
  };
  return { client } as never;
}

describe('AnalysisService.analyze', () => {
  it('returns partner + stats + per-product breakdown (ref shape)', async () => {
    const svc = new AnalysisService(makePrisma());
    const a = await svc.analyze(ACC, CP, {});

    // Partner DTO (rich)
    expect(a.partner.name).toBe('Akme MChJ');
    expect(a.partner.legalStatus).toBe('Juridical');
    expect(a.partner.inn).toBe('301234567');

    // Stats (money is minor units as number — match reference)
    expect(a.stats.purchasedQty).toBe(10);
    expect(a.stats.purchasedCost).toBe(80000); // 10 × 8000
    expect(a.stats.soldQty).toBe(6);
    expect(a.stats.soldValue).toBe(60000); // 6 × 10000
    expect(a.stats.soldCost).toBe(48000); // 6 × 8000
    expect(a.stats.purchasedSaleValue).toBe(100000); // 10 × 10000 (purchased qty × current sale price)
    expect(a.stats.soldShare).toBeCloseTo(0.6, 5); // 6/10 — decimal, not percent
    expect(a.stats.lastPurchaseAt).toBe('2026-05-01T00:00:00.000Z');
    expect(a.stats.lastSaleAt).toBe('2026-05-20T00:00:00.000Z');

    // Products
    expect(a.products).toHaveLength(1);
    expect(a.products[0]).toMatchObject({
      id: P1,
      code: 'PR-1',
      name: 'Sement M400',
      unitName: 'kg',
      buyPrice: 8000,
      sellPrice: 10000,
      purchasedQty: 10,
      soldQty: 6,
      finalStock: 4,
    });

    // Range
    expect(a.range.from).toBeTruthy();
    expect(a.range.to).toBeTruthy();
  });

  it('returns zeros + empty products when the supplier has no products', async () => {
    const svc = new AnalysisService(
      makePrisma({ product: { findMany: vi.fn().mockResolvedValue([]) } }),
    );
    const a = await svc.analyze(ACC, CP, {});
    expect(a.products).toEqual([]);
    expect(a.stats.purchasedQty).toBe(0);
    expect(a.stats.soldShare).toBe(0);
    expect(a.stats.purchasedCost).toBe(0);
    expect(a.partner.name).toBe('Akme MChJ');
  });

  it('throws when the counterparty does not exist', async () => {
    const svc = new AnalysisService(
      makePrisma({ counterparty: { findFirst: vi.fn().mockResolvedValue(null) } }),
    );
    await expect(svc.analyze(ACC, 'missing', {})).rejects.toThrow();
  });

  it('soldShare is 0 when nothing was purchased', async () => {
    const svc = new AnalysisService(
      makePrisma({
        supplyPosition: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
      }),
    );
    const a = await svc.analyze(ACC, CP, {});
    expect(a.stats.purchasedQty).toBe(0);
    expect(a.stats.soldShare).toBe(0);
    expect(a.stats.lastPurchaseAt).toBeNull();
  });
});

describe('AnalysisService.listCounterparties', () => {
  it('returns rich partner shape + groups + pagination', async () => {
    const svc = new AnalysisService(makePrisma());
    const res = await svc.listCounterparties(ACC, {});

    expect(res.partners).toHaveLength(1);
    const p = res.partners[0];
    expect(p.name).toBe('Akme MChJ');
    expect(p.fullname).toBe('"Akme" MChJ');
    expect(p.code).toBe('CP-001');
    expect(p.legalStatus).toBe('Juridical');
    expect(p.inn).toBe('301234567');
    expect(p.mfo).toBe('00014');
    expect(p.oked).toBe('47.30');
    expect(p.phones).toBe('+998901112233');
    expect(p.address).toBe('Toshkent');
    expect(p.groupName).toBe('Yetkazib beruvchilar');
    expect(p.isDeleted).toBe(false);
    expect(res.groups).toEqual(['Yetkazib beruvchilar', 'Mijozlar']);
    expect(res.pagination).toEqual({ page: 1, pageSize: 50, total: 1, totalPages: 1 });
  });

  it('maps individualUZ → Natural', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.counterparty.findMany = vi
      .fn()
      .mockResolvedValue([
        {
          id: CP,
          code: null,
          name: 'Ali',
          legalTitle: null,
          companyType: 'individualUZ',
          phone: null,
          legalAddress: null,
          actualAddress: null,
          description: null,
          uzRequisites: null,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          groupId: null,
          group: null,
        },
      ]);
    const svc = new AnalysisService(prisma);
    const res = await svc.listCounterparties(ACC, {});
    expect(res.partners[0].legalStatus).toBe('Natural');
    expect(res.partners[0].inn).toBeNull();
  });

  it('respects pagination + showDeleted', async () => {
    const prisma = makePrisma();
    const c = (prisma as never as ReturnType<typeof makePrisma>).client.counterparty;
    c.count = vi.fn().mockResolvedValue(127);
    const svc = new AnalysisService(prisma);
    const res = await svc.listCounterparties(ACC, {
      page: '2',
      pageSize: '20',
      showDeleted: 'true',
    });
    expect(res.pagination).toEqual({ page: 2, pageSize: 20, total: 127, totalPages: 7 });
    // findMany should have been called with skip=20 (page-1)*pageSize, take=20, and NO archived filter
    const arg = c.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(20);
    expect(arg.take).toBe(20);
    expect(arg.where.archived).toBeUndefined();
  });
});
