import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrReportsService } from './hr-reports.service.js';

function makePrisma() {
  return {
    client: {
      demand: { findMany: vi.fn() },
      hrTelegramOutbox: { findMany: vi.fn() },
    },
  };
}

describe('HrReportsService.report (sales)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrReportsService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrReportsService(prisma as any);
  });

  it('aggregates posted demand sum by day + top agents (BigInt→string)', async () => {
    prisma.client.demand.findMany.mockResolvedValue([
      {
        sumMinor: 1_000_000_00n,
        postedAt: new Date('2026-05-10T08:00:00Z'),
        agentId: 'cp-1',
        agent: { name: 'Alfa' },
      },
      {
        sumMinor: 2_000_000_00n,
        postedAt: new Date('2026-05-10T12:00:00Z'),
        agentId: 'cp-2',
        agent: { name: 'Beta' },
      },
      {
        sumMinor: 500_000_00n,
        postedAt: new Date('2026-05-11T09:00:00Z'),
        agentId: 'cp-1',
        agent: { name: 'Alfa' },
      },
    ]);

    const result = await svc.report('acc1', {
      dateFrom: new Date('2026-05-10'),
      dateTo: new Date('2026-05-11'),
      metric: 'sales',
    });

    expect(result.metric).toBe('sales');
    // total = 3.5M so'm = 350_000_000 tiyin
    expect(result.total).toBe('350000000');
    // top agents: cp-1 (1.5M) and cp-2 (2M) → cp-2 first (higher)
    expect(result.topCounterparties[0]?.counterpartyId).toBe('cp-2');
    expect(result.topCounterparties[0]?.value).toBe('200000000');
    expect(result.topCounterparties[1]?.counterpartyId).toBe('cp-1');
    expect(result.topCounterparties[1]?.value).toBe('150000000');
    // series dense across the 2-day window
    expect(result.series.length).toBeGreaterThanOrEqual(2);
  });

  it('empty period → zero total + dense zero series', async () => {
    prisma.client.demand.findMany.mockResolvedValue([]);
    const result = await svc.report('acc1', {
      dateFrom: new Date('2026-05-10'),
      dateTo: new Date('2026-05-12'),
      metric: 'sales',
    });
    expect(result.total).toBe('0');
    expect(result.topCounterparties).toEqual([]);
    expect(result.series.every((s) => s.value === '0')).toBe(true);
  });

  it('caps top counterparties at 5', async () => {
    prisma.client.demand.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        sumMinor: BigInt((i + 1) * 100),
        postedAt: new Date('2026-05-10T08:00:00Z'),
        agentId: `cp-${i}`,
        agent: { name: `Agent ${i}` },
      })),
    );
    const result = await svc.report('acc1', {
      dateFrom: new Date('2026-05-10'),
      dateTo: new Date('2026-05-10'),
      metric: 'sales',
    });
    expect(result.topCounterparties).toHaveLength(5);
    // highest sum (cp-7, 800) first
    expect(result.topCounterparties[0]?.counterpartyId).toBe('cp-7');
  });
});

describe('HrReportsService.report (messages)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrReportsService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrReportsService(prisma as any);
  });

  it('counts sent outbox by day + top recipients', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([
      {
        sentAt: new Date('2026-05-10T08:00:00Z'),
        counterpartyId: 'cp-1',
        counterparty: { name: 'Alfa' },
      },
      {
        sentAt: new Date('2026-05-10T09:00:00Z'),
        counterpartyId: 'cp-1',
        counterparty: { name: 'Alfa' },
      },
      {
        sentAt: new Date('2026-05-10T10:00:00Z'),
        counterpartyId: 'cp-2',
        counterparty: { name: 'Beta' },
      },
    ]);

    const result = await svc.report('acc1', {
      dateFrom: new Date('2026-05-10'),
      dateTo: new Date('2026-05-10'),
      metric: 'messages',
    });

    expect(result.metric).toBe('messages');
    expect(result.total).toBe('3');
    expect(result.topCounterparties[0]?.counterpartyId).toBe('cp-1');
    expect(result.topCounterparties[0]?.value).toBe('2');
  });

  it('uses outbox table for messages metric (not demand)', async () => {
    prisma.client.hrTelegramOutbox.findMany.mockResolvedValue([]);
    await svc.report('acc1', {
      dateFrom: new Date('2026-05-10'),
      dateTo: new Date('2026-05-10'),
      metric: 'messages',
    });
    expect(prisma.client.hrTelegramOutbox.findMany).toHaveBeenCalled();
    expect(prisma.client.demand.findMany).not.toHaveBeenCalled();
  });
});
