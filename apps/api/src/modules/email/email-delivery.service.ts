import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isCronLeader } from '../shared/cron-leader.js';
import {
  LEASE_EXPIRED_NOTE,
  OUTBOX_SENDING,
  claimLeaseUntil,
  dedupNote,
  dedupSince,
} from '../shared/outbox-claim.js';
import { EmailService } from './email.service.js';

/**
 * Backoff schedule indexed by attempt number (1-based).
 *
 *   attempt 1 → 0ms (set on enqueue)
 *   attempt 2 → +1 minute
 *   attempt 3 → +5 minutes
 *   attempt 4 → +15 minutes
 *   attempt 5 → +1 hour (final)
 *   attempt 6 → DEAD (no further attempts)
 *
 * Tighter than the webhook schedule because email is more time-sensitive
 * (overdue invoice notifications, password resets, etc.) — most transient
 * SMTP errors clear within an hour.
 */
const BACKOFF_MS = [0, 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000] as const;

/** Max email rows processed per cron tick. */
const BATCH_LIMIT = 20;
const ERROR_MSG_MAX = 500;

type DueEmail = Prisma.EmailLogGetPayload<true>;

/**
 * Cron worker that drains the EmailLog queue.
 *
 * Runs every 30 seconds. Picks up to BATCH_LIMIT pending emails whose
 * nextRetryAt has passed and hands each to EmailService.sendQueuedNow().
 * On success → status='sent', sentAt=NOW. On error → either schedule the
 * next retry per BACKOFF_MS, or mark 'dead' if attempts exhausted.
 *
 * Multi-instance safe (Faza 28 / INT-08): each row is claimed
 * `pending → 'sending'` with a lease BEFORE the SMTP call, so a second
 * process loses the claim and skips the row; `reapExpiredClaims` recovers
 * rows abandoned mid-send. The `isRunning` flag still prevents tick overlap
 * inside one process.
 */
@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processDue(): Promise<void> {
    if (!isCronLeader()) return;
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.reapExpiredClaims(new Date());
      const due = await this.prisma.client.emailLog.findMany({
        where: {
          status: 'pending',
          nextRetryAt: { lte: new Date() },
        },
        orderBy: { nextRetryAt: 'asc' },
        take: BATCH_LIMIT,
      });
      if (due.length === 0) return;
      this.logger.debug(`Processing ${due.length} due emails`);
      // Sequential processing — most accounts share one SMTP connection
      // pool, parallel sends would race on rate limits.
      for (const log of due) {
        await this.deliver(log);
      }
    } catch (err) {
      this.logger.error(`Email delivery tick failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }

  /** Re-queues rows stranded in `'sending'` by a worker that died mid-send. */
  private async reapExpiredClaims(now: Date): Promise<void> {
    const reaped = await this.prisma.client.emailLog.updateMany({
      where: { status: OUTBOX_SENDING, nextRetryAt: { lte: now } },
      data: { status: 'pending', attempt: { increment: 1 }, errorMsg: LEASE_EXPIRED_NOTE },
    });
    if (reaped.count > 0) {
      this.logger.warn(`Re-queued ${reaped.count} email(s) with an expired claim lease`);
    }
  }

  private async deliver(log: DueEmail): Promise<void> {
    // EXCLUSIVE claim (INT-08) + sending-first (INT-09) — see
    // `shared/outbox-claim.ts` for why `pending → pending` locked nothing.
    const claim = await this.prisma.client.emailLog.updateMany({
      where: { id: log.id, status: 'pending' },
      data: { status: OUTBOX_SENDING, attemptedAt: new Date(), nextRetryAt: claimLeaseUntil() },
    });
    if (claim.count === 0) return;

    // Re-attempt only: identical mail already delivered inside the dedup
    // window ⇒ the interrupted attempt did reach the SMTP server.
    if (log.attempt > 1) {
      const twin = await this.prisma.client.emailLog.findFirst({
        where: {
          id: { not: log.id },
          accountId: log.accountId,
          toAddresses: { equals: log.toAddresses },
          subject: log.subject,
          bodyHtml: log.bodyHtml,
          status: 'sent',
          sentAt: { gte: dedupSince() },
        },
        select: { sentAt: true },
        orderBy: { sentAt: 'desc' },
      });
      if (twin) {
        this.logger.warn(`Email ${log.id} suppressed by dedup (twin sent ${String(twin.sentAt)})`);
        await this.prisma.client.emailLog.update({
          where: { id: log.id },
          data: { status: 'sent', sentAt: new Date(), errorMsg: dedupNote(twin.sentAt) },
        });
        return;
      }
    }

    try {
      await this.emailService.sendQueuedNow(log.id);
      await this.prisma.client.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'sent',
          attemptedAt: new Date(),
          sentAt: new Date(),
          errorMsg: null,
        },
      });
    } catch (err) {
      await this.scheduleRetryOrDie(log, (err as Error).message ?? 'unknown error');
    }
  }

  private async scheduleRetryOrDie(log: DueEmail, errorMsg: string): Promise<void> {
    const truncated = errorMsg.slice(0, ERROR_MSG_MAX);
    this.logger.warn(`Email ${log.id} attempt ${log.attempt} failed: ${truncated}`);
    const nextAttempt = log.attempt + 1;
    if (nextAttempt > log.maxAttempts) {
      await this.prisma.client.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'dead',
          attemptedAt: new Date(),
          errorMsg: truncated,
        },
      });
      return;
    }
    const delayIndex = Math.min(nextAttempt - 1, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[delayIndex]!;
    await this.prisma.client.emailLog.update({
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
