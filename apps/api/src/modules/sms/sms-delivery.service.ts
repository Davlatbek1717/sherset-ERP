import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SmsService } from './sms.service.js';

/**
 * SMS retry backoff (mirrors EmailDeliveryService):
 *   attempt 1 → 0ms, 2 → +1m, 3 → +5m, 4 → +15m, 5 → +1h.
 * Eskiz transient failures usually clear within minutes; tighter than
 * webhook because customers expect SMS quickly (OTPs, order alerts).
 */
const BACKOFF_MS = [0, 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000] as const;
const BATCH_LIMIT = 20;
const ERROR_MSG_MAX = 500;

type DueSms = Prisma.SmsLogGetPayload<true>;

@Injectable()
export class SmsDeliveryService {
  private readonly logger = new Logger(SmsDeliveryService.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SmsService) private readonly smsService: SmsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processDue(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const due = await this.prisma.client.smsLog.findMany({
        where: { status: 'pending', nextRetryAt: { lte: new Date() } },
        orderBy: { nextRetryAt: 'asc' },
        take: BATCH_LIMIT,
      });
      if (due.length === 0) return;
      this.logger.debug(`Processing ${due.length} due SMS`);
      // Sequential — Eskiz rate-limits per token; parallel sends would 429.
      for (const log of due) {
        await this.deliver(log);
      }
    } catch (err) {
      this.logger.error(`SMS delivery tick failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }

  private async deliver(log: DueSms): Promise<void> {
    try {
      const result = await this.smsService.sendQueuedNow(log.id);
      await this.prisma.client.smsLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          attemptedAt: new Date(),
          sentAt: new Date(),
          providerMessageId: result.providerMessageId || null,
          errorMsg: null,
        },
      });
    } catch (err) {
      await this.scheduleRetryOrDie(log, (err as Error).message ?? 'unknown');
    }
  }

  private async scheduleRetryOrDie(log: DueSms, errorMsg: string): Promise<void> {
    const truncated = errorMsg.slice(0, ERROR_MSG_MAX);
    this.logger.warn(`SMS ${log.id} attempt ${log.attempt} failed: ${truncated}`);
    const nextAttempt = log.attempt + 1;
    if (nextAttempt > log.maxAttempts) {
      await this.prisma.client.smsLog.update({
        where: { id: log.id },
        data: { status: 'dead', attemptedAt: new Date(), errorMsg: truncated },
      });
      return;
    }
    const delayIndex = Math.min(nextAttempt - 1, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[delayIndex]!;
    await this.prisma.client.smsLog.update({
      where: { id: log.id },
      data: {
        status: 'pending',
        attempt: nextAttempt,
        nextRetryAt: new Date(Date.now() + delay),
        attemptedAt: new Date(),
        errorMsg: truncated,
      },
    });
  }
}
