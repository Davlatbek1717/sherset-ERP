import { describe, expect, it, vi } from 'vitest';
import { CountService } from './count.service.js';

const ACC = 'acc-1';
const COUNTER = 'emp-1';
const PID = '11111111-1111-1111-1111-111111111111';
const SID = '22222222-2222-2222-2222-222222222222';

// Minimal prisma stub — only the methods CountService touches.
function makePrisma(overrides: Record<string, unknown> = {}) {
  const client = {
    analitikaCount: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'cnt-1', productId: PID }),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    stock: {
      findUnique: vi.fn().mockResolvedValue({ qty: 100 }),
    },
    product: {
      findFirst: vi.fn().mockResolvedValue({ salePrices: [{ value: '5000' }] }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: PID, name: 'Sement', code: 'C-1', productFolderId: null }]),
    },
    priceType: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([{ id: COUNTER, name: 'Ali', fullName: 'Aliyev Ali' }]),
    },
    productFolder: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    analitikaReasonCode: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  return { client } as never;
}

// Stub VarianceConfigService with fixed thresholds.
const variance = { get: vi.fn().mockResolvedValue({ greenMaxPct: 5, yellowMaxPct: 15 }) } as never;

describe('CountService.upsert', () => {
  it('clears the count when both quantities are zero', async () => {
    const prisma = makePrisma();
    const svc = new CountService(prisma, variance);
    const res = await svc.upsert(ACC, COUNTER, {
      productId: PID,
      storeId: SID,
      kamQty: 0,
      kopQty: 0,
    });
    expect(res).toEqual({ cleared: true });
    expect(
      (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.deleteMany,
    ).toHaveBeenCalledOnce();
  });

  it('computes net + status (shortage 20 of 100 = 20% → red) and snapshots price', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.upsert = vi
      .fn()
      .mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'cnt-1',
        ...create,
        countedAt: new Date('2026-05-25T00:00:00Z'),
        reviewerId: null,
        reasonCodeId: null,
        decision: null,
      }));
    const svc = new CountService(prisma, variance);
    const res = await svc.upsert(ACC, COUNTER, {
      productId: PID,
      storeId: SID,
      kamQty: 20,
      kopQty: 0,
    });
    if ('cleared' in res) throw new Error('expected a DTO');
    expect(res.netQty).toBe(-20);
    expect(res.status).toBe('red');
    expect(res.salePriceMinor).toBe('5000');
    expect(res.expectedQty).toBe(100);
    expect(res.productName).toBe('Sement');
  });

  it('green when shortage is within the green threshold (3 of 100 = 3%)', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.upsert = vi
      .fn()
      .mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
        id: 'cnt-2',
        ...create,
        countedAt: new Date(),
        reviewerId: null,
        reasonCodeId: null,
        decision: null,
      }));
    const svc = new CountService(prisma, variance);
    const res = await svc.upsert(ACC, COUNTER, {
      productId: PID,
      storeId: SID,
      kamQty: 3,
      kopQty: 0,
    });
    if ('cleared' in res) throw new Error('expected a DTO');
    expect(res.status).toBe('green');
  });

  it('falls back to update on a P2002 create race (last write wins)', async () => {
    const prisma = makePrisma();
    const p2002 = Object.assign(new Error('unique'), { code: 'P2002' });
    const upsertMock = vi.fn().mockRejectedValue(p2002);
    const updateMock = vi.fn().mockResolvedValue({
      id: 'cnt-3',
      accountId: ACC,
      productId: PID,
      storeId: SID,
      expectedQty: 100,
      kamQty: 0,
      kopQty: 4,
      netQty: 4,
      salePriceMinor: 5000n,
      status: 'green',
      counterId: COUNTER,
      countedAt: new Date(),
      reviewerId: null,
      reasonCodeId: null,
      decision: null,
      note: null,
    });
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.upsert = upsertMock;
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.update = updateMock;
    const svc = new CountService(prisma, variance);
    const res = await svc.upsert(ACC, COUNTER, {
      productId: PID,
      storeId: SID,
      kamQty: 0,
      kopQty: 4,
    });
    if ('cleared' in res) throw new Error('expected a DTO');
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(updateMock).toHaveBeenCalledOnce();
    expect(res.netQty).toBe(4);
  });
});

describe('CountService approval', () => {
  function rowFrom(decision: string | null, reviewerId: string | null) {
    return {
      id: 'cnt-1',
      productId: PID,
      storeId: SID,
      expectedQty: 100,
      kamQty: 20,
      kopQty: 0,
      netQty: -20,
      salePriceMinor: 5000n,
      status: 'red',
      decision,
      counterId: COUNTER,
      countedAt: new Date(),
      reviewerId,
      reasonCodeId: null,
      note: null,
    };
  }

  it('approve sets decision=accepted + reviewer', async () => {
    const prisma = makePrisma();
    const c = (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount;
    c.update = vi.fn().mockResolvedValue(rowFrom('accepted', 'rev-1'));
    const svc = new CountService(prisma, variance);
    const res = await svc.approve(ACC, 'rev-1', 'cnt-1', {});
    expect(res.decision).toBe('accepted');
    expect(res.reviewerId).toBe('rev-1');
    expect(c.update).toHaveBeenCalledOnce();
  });

  it('reject sets decision=rejected', async () => {
    const prisma = makePrisma();
    const c = (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount;
    c.update = vi.fn().mockResolvedValue(rowFrom('rejected', 'rev-1'));
    const svc = new CountService(prisma, variance);
    const res = await svc.reject(ACC, 'rev-1', 'cnt-1', {
      reasonCodeId: '33333333-3333-3333-3333-333333333333',
    });
    expect(res.decision).toBe('rejected');
  });

  it('cancel reverts decision to null', async () => {
    const prisma = makePrisma();
    const c = (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount;
    c.update = vi.fn().mockResolvedValue(rowFrom(null, null));
    const svc = new CountService(prisma, variance);
    const res = await svc.cancel(ACC, 'cnt-1');
    expect(res.decision).toBeNull();
    expect(res.reviewerId).toBeNull();
  });

  it('approve throws when the count does not exist', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findFirst = vi
      .fn()
      .mockResolvedValue(null);
    const svc = new CountService(prisma, variance);
    await expect(svc.approve(ACC, 'rev-1', 'missing', {})).rejects.toThrow();
  });

  it('bulkApprove updates only undecided rows and returns the count', async () => {
    const prisma = makePrisma();
    const svc = new CountService(prisma, variance);
    const res = await svc.bulkApprove(ACC, 'rev-1', {
      ids: ['33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'],
    });
    expect(res.count).toBe(2);
    const c = (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount;
    expect(c.updateMany).toHaveBeenCalledOnce();
    const arg = c.updateMany.mock.calls[0][0];
    expect(arg.where.decision).toBeNull();
    expect(arg.data.decision).toBe('accepted');
  });

  it('bulkApprove rejects an empty id list', async () => {
    const prisma = makePrisma();
    const svc = new CountService(prisma, variance);
    await expect(svc.bulkApprove(ACC, 'rev-1', { ids: [] })).rejects.toThrow();
  });
});

describe('CountService.report', () => {
  function countRow(over: Record<string, unknown> = {}) {
    return {
      id: 'cnt-1',
      productId: PID,
      storeId: SID,
      expectedQty: 100,
      kamQty: 20,
      kopQty: 0,
      netQty: -20,
      salePriceMinor: 5000n,
      status: 'red',
      decision: null,
      counterId: COUNTER,
      countedAt: new Date('2026-05-25T00:00:00Z'),
      reviewerId: null,
      reasonCodeId: null,
      note: null,
      ...over,
    };
  }

  it('computes signed money: shortage 20 × 5000 = 100000 loss', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findMany = vi
      .fn()
      .mockResolvedValue([countRow()]);
    const svc = new CountService(prisma, variance);
    const r = await svc.report(ACC, { period: 'all' });
    expect(r.lossMinor).toBe('100000');
    expect(r.surplusMinor).toBe('0');
    expect(r.netMinor).toBe('-100000');
    expect(r.byProduct).toHaveLength(1);
    expect(r.byProduct[0].moneyMinor).toBe('-100000');
    expect(r.byProduct[0].counterName).toBe('Aliyev Ali');
    expect(r.byProduct[0].pct).toBe(20);
  });

  it('surplus is positive and nets against loss', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findMany = vi
      .fn()
      .mockResolvedValue([
        countRow({ id: 'a', kamQty: 0, kopQty: 4, netQty: 4, status: 'green' }),
        countRow({ id: 'b', netQty: -20 }),
      ]);
    const svc = new CountService(prisma, variance);
    const r = await svc.report(ACC, { period: 'all' });
    expect(r.surplusMinor).toBe('20000'); // 4 × 5000
    expect(r.lossMinor).toBe('100000');
    expect(r.netMinor).toBe('-80000');
    expect(r.byCounter).toHaveLength(1);
    expect(r.byCounter[0].count).toBe(2);
  });

  it('excludes rejected counts via the where filter', async () => {
    const prisma = makePrisma();
    const findMany = vi.fn().mockResolvedValue([]);
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findMany = findMany;
    const svc = new CountService(prisma, variance);
    await svc.report(ACC, { period: 'all' });
    expect(findMany.mock.calls[0][0].where.decision).toEqual({ not: 'rejected' });
  });
});

describe('CountService.reset', () => {
  it('deletes counts and returns the count', async () => {
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.deleteMany = vi
      .fn()
      .mockResolvedValue({ count: 7 });
    const svc = new CountService(prisma, variance);
    const res = await svc.reset(ACC, {});
    expect(res.count).toBe(7);
  });

  it('rejects an invalid storeId', async () => {
    const prisma = makePrisma();
    const svc = new CountService(prisma, variance);
    await expect(svc.reset(ACC, { storeId: 'nope' })).rejects.toThrow();
  });
});

describe('CountService.snapshot — null-decision regression (bug 3470c284)', () => {
  it('filters with OR null/accepted so pending counts (decision=null) appear', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findMany = findMany;
    const svc = new CountService(prisma, variance);
    await svc.snapshot(ACC, {});

    // Earlier the code used `decision: { not: 'rejected' }` — but Prisma's
    // three-valued logic excludes NULL from such "not equals" comparisons,
    // so pending counts (decision=null) were silently filtered out.
    // The fix spells it out: OR pending OR accepted.
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ decision: null }, { decision: 'accepted' }]);
    expect(where.decision).toBeUndefined();
  });

  it('passes storeId through when provided', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma();
    (prisma as never as ReturnType<typeof makePrisma>).client.analitikaCount.findMany = findMany;
    const svc = new CountService(prisma, variance);
    await svc.snapshot(ACC, { storeId: SID });

    const where = findMany.mock.calls[0][0].where;
    expect(where.storeId).toBe(SID);
    expect(where.accountId).toBe(ACC);
  });

  it('filters by groupName in-memory (post-fetch, since AnalitikaCount has no folder relation)', async () => {
    const counts = [
      {
        id: 'c1',
        productId: 'p-a',
        storeId: SID,
        expectedQty: 10,
        netQty: 2,
        salePriceMinor: 10000n,
        status: 'red',
        decision: null,
        counterId: COUNTER,
        countedAt: new Date('2026-05-01'),
      },
      {
        id: 'c2',
        productId: 'p-b',
        storeId: SID,
        expectedQty: 5,
        netQty: -1,
        salePriceMinor: 5000n,
        status: 'yellow',
        decision: null,
        counterId: COUNTER,
        countedAt: new Date('2026-05-02'),
      },
    ];
    const prisma = makePrisma();
    const client = (prisma as never as ReturnType<typeof makePrisma>).client;
    client.analitikaCount.findMany = vi.fn().mockResolvedValue(counts);
    client.product.findMany = vi.fn().mockResolvedValue([
      { id: 'p-a', name: 'Cement', code: 'A', productFolder: { name: 'Materiallar' } },
      { id: 'p-b', name: 'Sand', code: 'B', productFolder: { name: 'Boshqa' } },
    ]);
    const svc = new CountService(prisma, variance);
    const filtered = await svc.snapshot(ACC, { groupName: 'Materiallar' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].productName).toBe('Cement');
  });
});
