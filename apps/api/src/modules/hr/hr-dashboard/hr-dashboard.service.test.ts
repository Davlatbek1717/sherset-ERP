import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HrDashboardService } from './hr-dashboard.service.js';

function makePrisma() {
  return {
    client: {
      counterparty: { count: vi.fn() },
      hrTelegramAccount: { count: vi.fn() },
      hrTelegramOutbox: { count: vi.fn(), findMany: vi.fn() },
      hrTaskLog: { count: vi.fn() },
      $transaction: vi.fn(),
    },
  };
}

describe('HrDashboardService.summary', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: HrDashboardService;

  beforeEach(() => {
    prisma = makePrisma();
    // biome-ignore lint/suspicious/noExplicitAny: test wiring
    svc = new HrDashboardService(prisma as any);
  });

  it('aggregates counts + dense 7-day series + recent messages', async () => {
    // $transaction returns the array of the 8 queued reads in order.
    prisma.client.$transaction.mockResolvedValue([
      42, // totalCounterparties
      2, // telegramConnectedSlots
      7, // messagesSentToday
      3, // messagesFailed
      5, // pendingTasks
      1, // pendingReviews
      [], // windowRows (no sent in 7 days)
      [
        {
          id: 'o-1',
          toPhone: '+998901234567',
          status: 'sent',
          createdAt: new Date('2026-05-22T08:00:00Z'),
          counterparty: { name: 'OOO Test' },
        },
      ],
    ]);

    const result = await svc.summary('acc1');

    expect(result.totalCounterparties).toBe(42);
    expect(result.telegramConnectedSlots).toBe(2);
    expect(result.messagesSentToday).toBe(7);
    expect(result.messagesFailed).toBe(3);
    expect(result.pendingTasks).toBe(5);
    expect(result.pendingReviews).toBe(1);
    // Dense 7-day series
    expect(result.sentSeries).toHaveLength(7);
    expect(result.sentSeries.every((s) => s.sent === 0)).toBe(true);
    // Recent message mapped
    expect(result.recentMessages).toHaveLength(1);
    expect(result.recentMessages[0]?.counterpartyName).toBe('OOO Test');
    expect(result.recentMessages[0]?.toPhone).toBe('+998901234567');
  });

  it('recent message with null counterparty → counterpartyName null', async () => {
    prisma.client.$transaction.mockResolvedValue([
      0,
      0,
      0,
      0,
      0,
      0,
      [],
      [
        {
          id: 'o-2',
          toPhone: '+998900000000',
          status: 'failed',
          createdAt: new Date('2026-05-22T08:00:00Z'),
          counterparty: null,
        },
      ],
    ]);
    const result = await svc.summary('acc1');
    expect(result.recentMessages[0]?.counterpartyName).toBeNull();
  });

  it('series always 7 dense buckets even with zero data', async () => {
    prisma.client.$transaction.mockResolvedValue([0, 0, 0, 0, 0, 0, [], []]);
    const result = await svc.summary('acc1');
    expect(result.sentSeries).toHaveLength(7);
    // dates are ascending unique ISO strings
    const dates = result.sentSeries.map((s) => s.date);
    expect(new Set(dates).size).toBe(7);
    expect([...dates].sort()).toEqual(dates);
  });
});
