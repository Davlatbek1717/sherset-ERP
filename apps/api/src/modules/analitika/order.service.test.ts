import { describe, expect, it, vi } from 'vitest';
import { OrderService } from './order.service.js';

const ACC = 'acc-1';
const PID = '11111111-1111-1111-1111-111111111111';
const CP = '22222222-2222-2222-2222-222222222222';

function makePrisma(over: Record<string, unknown> = {}) {
  const client = {
    analitikaOrder: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'o1' }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'o1',
        number: 'ANL-00001',
        counterpartyId: null,
        state: 'formed',
        totalMinor: 20000n,
        createdAt: new Date('2026-05-25T00:00:00Z'),
        lines: [{ productId: PID, qty: 2, priceMinor: 10000n, sumMinor: 20000n }],
      }),
    },
    product: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: PID, name: 'Sement', code: 'C-1', salePrices: [{ value: '10000' }] },
        ]),
    },
    priceType: { findFirst: vi.fn().mockResolvedValue(null) },
    counterparty: { findMany: vi.fn().mockResolvedValue([{ id: CP, name: 'Akme MChJ' }]) },
    ...over,
  };
  return { client } as never;
}

describe('OrderService.create', () => {
  it('snapshots price, computes line sum + total, assigns ANL-00001', async () => {
    const prisma = makePrisma();
    const svc = new OrderService(prisma);
    const dto = await svc.create(ACC, { lines: [{ productId: PID, qty: 2 }] });

    const c = (prisma as never as ReturnType<typeof makePrisma>).client.analitikaOrder;
    expect(c.create).toHaveBeenCalledOnce();
    const data = c.create.mock.calls[0][0].data;
    expect(data.number).toBe('ANL-00001');
    expect(data.totalMinor).toBe(20000n);
    expect(data.lines.create[0].sumMinor).toBe(20000n);
    expect(data.lines.create[0].priceMinor).toBe(10000n);
    expect(dto.totalMinor).toBe('20000');
    expect(dto.lines[0].productName).toBe('Sement');
  });

  it('rejects a line whose product does not exist', async () => {
    const prisma = makePrisma({
      product: { findMany: vi.fn().mockResolvedValue([]) },
    });
    const svc = new OrderService(prisma);
    await expect(svc.create(ACC, { lines: [{ productId: PID, qty: 1 }] })).rejects.toThrow();
  });

  it('retries the number on a P2002 collision', async () => {
    const p2002 = Object.assign(new Error('dup'), { code: 'P2002' });
    const create = vi.fn().mockRejectedValueOnce(p2002).mockResolvedValueOnce({ id: 'o1' });
    const prisma = makePrisma({
      analitikaOrder: {
        count: vi.fn().mockResolvedValue(0),
        create,
        findMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          id: 'o1',
          number: 'ANL-00002',
          counterpartyId: null,
          state: 'formed',
          totalMinor: 10000n,
          createdAt: new Date(),
          lines: [{ productId: PID, qty: 1, priceMinor: 10000n, sumMinor: 10000n }],
        }),
      },
    });
    const svc = new OrderService(prisma);
    await svc.create(ACC, { lines: [{ productId: PID, qty: 1 }] });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].data.number).toBe('ANL-00001');
    expect(create.mock.calls[1][0].data.number).toBe('ANL-00002');
  });
});

describe('OrderService.list', () => {
  it('resolves counterparty names and line counts', async () => {
    const prisma = makePrisma({
      analitikaOrder: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'o1',
            number: 'ANL-00001',
            counterpartyId: CP,
            state: 'formed',
            totalMinor: 50000n,
            createdAt: new Date('2026-05-25T00:00:00Z'),
            _count: { lines: 3 },
          },
        ]),
      },
    });
    const svc = new OrderService(prisma);
    const res = await svc.list(ACC, {});
    expect(res.items).toHaveLength(1);
    expect(res.items[0].counterpartyName).toBe('Akme MChJ');
    expect(res.items[0].lineCount).toBe(3);
    expect(res.items[0].totalMinor).toBe('50000');
  });
});

describe('OrderService.list — search regression (bug 3470c284)', () => {
  it('search query also matches counterparty name, not just order number', async () => {
    const cpFindMany = vi.fn().mockResolvedValue([{ id: CP }]);
    const orderFindMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      counterparty: { findMany: cpFindMany },
      analitikaOrder: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: orderFindMany,
      },
    });
    const svc = new OrderService(prisma);
    await svc.list(ACC, { search: 'Akme' });

    // The counterparty lookup happens with case-insensitive contains on
    // both name AND legalTitle — earlier we only matched order number.
    expect(cpFindMany).toHaveBeenCalledOnce();
    const cpArgs = cpFindMany.mock.calls[0][0];
    expect(cpArgs.where.OR).toEqual([
      { name: { contains: 'Akme', mode: 'insensitive' } },
      { legalTitle: { contains: 'Akme', mode: 'insensitive' } },
    ]);

    // The order findMany OR includes BOTH the number filter and the
    // resolved counterparty ids.
    expect(orderFindMany).toHaveBeenCalledOnce();
    const where = orderFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { number: { contains: 'Akme', mode: 'insensitive' } },
      { counterpartyId: { in: [CP] } },
    ]);
  });

  it('omits the counterpartyId branch when no counterparty matches', async () => {
    const orderFindMany = vi.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      counterparty: { findMany: vi.fn().mockResolvedValue([]) },
      analitikaOrder: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: orderFindMany,
      },
    });
    const svc = new OrderService(prisma);
    await svc.list(ACC, { search: 'XYZ_NOMATCH' });

    const where = orderFindMany.mock.calls[0][0].where;
    // Only the number filter — no `counterpartyId: { in: [] }` (which Prisma
    // would treat as "match nothing" and silently zero out the result).
    expect(where.OR).toEqual([{ number: { contains: 'XYZ_NOMATCH', mode: 'insensitive' } }]);
  });
});

describe('OrderService.getById', () => {
  it('throws when the order is missing', async () => {
    const prisma = makePrisma({
      analitikaOrder: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const svc = new OrderService(prisma);
    await expect(svc.getById(ACC, 'missing')).rejects.toThrow();
  });
});
