import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay } from '../hr-shared/tz.util.js';

export interface HrDashboardSummary {
  totalCounterparties: number;
  telegramConnectedSlots: number;
  messagesSentToday: number;
  messagesFailed: number;
  pendingTasks: number;
  pendingReviews: number;
  /** Last 7 local days (oldest→newest): outbox sent count per day. */
  sentSeries: Array<{ date: string; sent: number }>;
  /** Last 5 outbox rows (any status). */
  recentMessages: Array<{
    id: string;
    counterpartyName: string | null;
    toPhone: string;
    status: string;
    createdAt: string;
  }>;
}

/**
 * Realtime HR dashboard read model. All counts are scoped to accountId.
 * The 7-day series buckets HrTelegramOutbox by local (Asia/Tashkent) day
 * so the chart aligns with the admin's calendar, not UTC.
 */
@Injectable()
export class HrDashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(accountId: string): Promise<HrDashboardSummary> {
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgoStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [
      totalCounterparties,
      telegramConnectedSlots,
      messagesSentToday,
      messagesFailed,
      pendingTasks,
      pendingReviews,
      windowRows,
      recent,
    ] = await this.prisma.client.$transaction([
      this.prisma.client.counterparty.count({ where: { accountId } }),
      this.prisma.client.hrTelegramAccount.count({ where: { accountId, isActive: true } }),
      this.prisma.client.hrTelegramOutbox.count({
        where: { accountId, status: 'sent', sentAt: { gte: todayStart, lt: todayEnd } },
      }),
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'failed' } }),
      this.prisma.client.hrTaskLog.count({ where: { accountId, status: 'sent' } }),
      this.prisma.client.hrTaskLog.count({ where: { accountId, status: 'pending_review' } }),
      this.prisma.client.hrTelegramOutbox.findMany({
        where: { accountId, status: 'sent', sentAt: { gte: sevenDaysAgoStart, lt: todayEnd } },
        select: { sentAt: true },
      }),
      this.prisma.client.hrTelegramOutbox.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { counterparty: { select: { name: true } } },
      }),
    ]);

    return {
      totalCounterparties,
      telegramConnectedSlots,
      messagesSentToday,
      messagesFailed,
      pendingTasks,
      pendingReviews,
      sentSeries: bucketByLocalDay(windowRows, sevenDaysAgoStart),
      recentMessages: recent.map((r) => ({
        id: r.id,
        counterpartyName: r.counterparty?.name ?? null,
        toPhone: r.toPhone,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}

/**
 * Bucket sent rows into 7 consecutive local days starting at `startDay`.
 * Returns a dense array (zero-filled gaps) so the chart x-axis is stable.
 */
function bucketByLocalDay(
  rows: Array<{ sentAt: Date | null }>,
  startDay: Date,
): Array<{ date: string; sent: number }> {
  const buckets: Array<{ date: string; sent: number }> = [];
  const dayMs = 24 * 60 * 60 * 1000;
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDay.getTime() + i * dayMs);
    buckets.push({ date: isoDate(d), sent: 0 });
  }
  const indexByDate = new Map(buckets.map((b, i) => [b.date, i]));
  for (const r of rows) {
    if (!r.sentAt) continue;
    // Approx local-day bucketing via startOfLocalDay alignment of the row.
    const key = isoDate(startOfLocalDay(r.sentAt));
    const idx = indexByDate.get(key);
    if (idx !== undefined) {
      const bucket = buckets[idx];
      if (bucket) bucket.sent++;
    }
  }
  return buckets;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
