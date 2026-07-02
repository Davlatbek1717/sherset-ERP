import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrMessagesService } from './hr-messages.service.js';

function makePrisma() {
  return {
    client: {
      hrTelegramOutbox: {
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
}

describe('HrMessagesService.list', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrMessagesService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrMessagesService(prisma as any);
    prisma.client.$transaction.mockResolvedValue([[], 0]);
  });

  it('scopes by accountId and orders desc by createdAt', async () => {
    await svc.list('acc1', { page: 1, limit: 50 });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: { createdAt: string };
      skip: number;
      take: number;
    };
    expect(findArgs.where).toEqual({ accountId: 'acc1' });
    expect(findArgs.orderBy).toEqual({ createdAt: 'desc' });
    expect(findArgs.skip).toBe(0);
    expect(findArgs.take).toBe(50);
  });

  it('applies status filter when provided', async () => {
    await svc.list('acc1', { page: 1, limit: 50, status: 'failed' });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: { status?: string };
    };
    expect(findArgs.where.status).toBe('failed');
  });

  it('applies counterpartyId + employeeId narrowing', async () => {
    await svc.list('acc1', {
      page: 1,
      limit: 50,
      counterpartyId: 'cp-1',
      employeeId: 'emp-1',
    });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: { counterpartyId?: string; employeeId?: string };
    };
    expect(findArgs.where.counterpartyId).toBe('cp-1');
    expect(findArgs.where.employeeId).toBe('emp-1');
  });

  it('applies dateFrom/dateTo as createdAt range', async () => {
    const dateFrom = new Date('2026-05-01');
    const dateTo = new Date('2026-05-31');
    await svc.list('acc1', { page: 1, limit: 50, dateFrom, dateTo });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: { createdAt?: { gte?: Date; lte?: Date } };
    };
    expect(findArgs.where.createdAt).toEqual({ gte: dateFrom, lte: dateTo });
  });

  it('search filter matches messageText OR toPhone (case-insensitive)', async () => {
    await svc.list('acc1', { page: 1, limit: 50, search: '+998901234567' });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: { OR?: unknown[] };
    };
    expect(findArgs.where.OR).toEqual([
      { messageText: { contains: '+998901234567', mode: 'insensitive' } },
      { toPhone: { contains: '+998901234567' } },
    ]);
  });

  it('pagination: page=3 limit=20 → skip=40 take=20', async () => {
    await svc.list('acc1', { page: 3, limit: 20 });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(findArgs.skip).toBe(40);
    expect(findArgs.take).toBe(20);
  });
});

describe('HrMessagesService.chatHistory', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrMessagesService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrMessagesService(prisma as any);
  });

  it('scopes by accountId + counterpartyId, ascending order', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([]);
    await svc.chatHistory('acc1', { counterpartyId: 'cp-1', limit: 40 });
    const findArgs = prisma.client.hrTelegramOutbox.findMany.mock.calls[0]?.[0] as {
      where: { accountId: string; counterpartyId: string };
      orderBy: { createdAt: string };
      take: number;
    };
    expect(findArgs.where).toEqual({ accountId: 'acc1', counterpartyId: 'cp-1' });
    expect(findArgs.orderBy).toEqual({ createdAt: 'asc' });
    expect(findArgs.take).toBe(40);
  });
});

describe('HrMessagesService.requeue', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrMessagesService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrMessagesService(prisma as any);
  });

  it('flips status from failed → pending + clears retry state, returns requeued=true', async () => {
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 1 });
    const result = await svc.requeue('acc1', 'row-1');

    expect(prisma.client.hrTelegramOutbox.updateMany).toHaveBeenCalledWith({
      where: { id: 'row-1', accountId: 'acc1', status: 'failed' },
      data: {
        status: 'pending',
        retryCount: 0,
        nextRetryAt: null,
        failReason: null,
      },
    });
    expect(result).toEqual({ ok: true, requeued: true });
  });

  it('non-failed row → updateMany count=0 → requeued=false (no-op)', async () => {
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 0 });
    const result = await svc.requeue('acc1', 'row-already-sent');
    expect(result).toEqual({ ok: true, requeued: false });
  });

  it('cross-account requeue blocked: where includes accountId scope', async () => {
    prisma.client.hrTelegramOutbox.updateMany.mockResolvedValue({ count: 0 });
    await svc.requeue('acc1', 'row-foreign');
    const args = prisma.client.hrTelegramOutbox.updateMany.mock.calls[0]?.[0] as {
      where: { accountId: string };
    };
    expect(args.where.accountId).toBe('acc1');
  });
});

describe('HrMessagesService.statusCounts', () => {
  it('returns 4 status buckets in one $transaction', async () => {
    const prisma = makePrisma();
    prisma.client.$transaction.mockResolvedValue([12, 3, 100, 2]);
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    const svc = new HrMessagesService(prisma as any);

    const result = await svc.statusCounts('acc1');

    expect(result).toEqual({ pending: 12, retry: 3, sent: 100, failed: 2 });
  });
});
