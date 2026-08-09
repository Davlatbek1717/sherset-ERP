import { createHmac } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isCronLeader } from '../shared/cron-leader.js';
import { LEASE_EXPIRED_NOTE, OUTBOX_SENDING, claimLeaseUntil } from '../shared/outbox-claim.js';

/**
 * Backoff schedule indexed by attempt number (1-based).
 *
 *   attempt 1 → 0ms (immediate, set on enqueue)
 *   attempt 2 → +1 minute
 *   attempt 3 → +5 minutes
 *   attempt 4 → +30 minutes
 *   attempt 5 → +1 hour
 *   attempt 6 → +6 hours (final retry)
 *   attempt 7 → DEAD (status='dead', no further attempts)
 *
 * Mirrors moysklad's official retry policy.
 */
const BACKOFF_MS = [
  0,
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
] as const;

const REQUEST_TIMEOUT_MS = 10_000;
/** Max deliveries processed per cron tick. Caps DB load + HTTP fan-out. */
const BATCH_LIMIT = 50;
const ERROR_MSG_MAX = 500;

type DueDelivery = Prisma.WebhookDeliveryGetPayload<{ include: { webhook: true } }>;

/**
 * Cron worker that drains the WebhookDelivery queue.
 *
 * Runs every 30 seconds. Picks up to BATCH_LIMIT pending deliveries whose
 * nextRetryAt has passed, POSTs each to its subscription URL with HMAC
 * signing (when secretHash present), and either marks them 'sent' or
 * schedules the next retry.
 *
 * Multi-instance safe (Faza 28 / INT-08): every row is claimed
 * `pending → 'sending'` with a lease BEFORE the HTTP call, so a second
 * process (pm2 cluster, overlapping deploy) loses the claim and skips the
 * row. `reapExpiredClaims` returns rows abandoned mid-flight. The
 * `isRunning` guard still prevents tick overlap inside one process.
 *
 * Delivery stays AT-LEAST-ONCE by design (a reaped row is re-sent because
 * the outcome of the interrupted attempt is unknown). Consumers get an
 * `Idempotency-Key` header carrying the delivery id so they can dedup.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private isRunning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Drain the queue every 30 seconds. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processDue(): Promise<void> {
    if (!isCronLeader()) return;
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.reapExpiredClaims(new Date());
      const due = await this.prisma.client.webhookDelivery.findMany({
        where: { status: 'pending', nextRetryAt: { lte: new Date() } },
        include: { webhook: true },
        orderBy: { nextRetryAt: 'asc' },
        take: BATCH_LIMIT,
      });
      if (due.length === 0) return;
      this.logger.debug(`Processing ${due.length} due webhook deliveries`);
      // Independent deliveries — fan out in parallel.
      await Promise.all(due.map((d) => this.deliver(d)));
    } catch (err) {
      this.logger.error(`Webhook delivery tick failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Re-queues deliveries stranded in `'sending'` by a worker that died between
   * the claim and the outcome write. `attempt` is bumped so a row that keeps
   * killing the worker still walks toward `dead` instead of looping forever.
   */
  private async reapExpiredClaims(now: Date): Promise<void> {
    const reaped = await this.prisma.client.webhookDelivery.updateMany({
      where: { status: OUTBOX_SENDING, nextRetryAt: { lte: now } },
      data: { status: 'pending', attempt: { increment: 1 }, errorMsg: LEASE_EXPIRED_NOTE },
    });
    if (reaped.count > 0) {
      this.logger.warn(
        `Re-queued ${reaped.count} webhook deliver(ies) with an expired claim lease`,
      );
    }
  }

  private async deliver(d: DueDelivery): Promise<void> {
    // EXCLUSIVE claim before any side effect: `pending` leaves the sendable
    // set, so a rival worker's identical updateMany returns count=0.
    // `attemptedAt` is written HERE (before the POST), not after it — INT-09.
    const claim = await this.prisma.client.webhookDelivery.updateMany({
      where: { id: d.id, status: 'pending' },
      data: { status: OUTBOX_SENDING, attemptedAt: new Date(), nextRetryAt: claimLeaseUntil() },
    });
    if (claim.count === 0) return;

    if (!d.webhook.enabled) {
      // Subscription was disabled after this delivery was enqueued.
      // Drop straight to dead — no point retrying a disabled webhook.
      await this.markDead(d.id, 'webhook disabled');
      return;
    }

    const body = JSON.stringify(d.payload);
    // Idempotency-Key = delivery id, stable across every retry of this row.
    // Webhook delivery is at-least-once (a lease-reaped row is re-sent with
    // an unknown prior outcome) — this is how a consumer dedups.
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': d.id,
    };
    if (d.webhook.secretHash) {
      headers['X-Lognex-Signature'] = createHmac('sha256', d.webhook.secretHash)
        .update(body)
        .digest('hex');
    }

    let httpStatus: number | null = null;
    let errorMsg: string | null = null;
    try {
      const res = await fetch(d.webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      httpStatus = res.status;
      if (res.ok) {
        await this.markSent(d.id, httpStatus);
        return;
      }
      errorMsg = `HTTP ${httpStatus}`;
      try {
        const text = await res.text();
        if (text) errorMsg += `: ${text.slice(0, ERROR_MSG_MAX - errorMsg.length - 2)}`;
      } catch {
        // Ignore body-read errors — status code is enough signal.
      }
    } catch (err) {
      errorMsg = `Network: ${String(err)}`.slice(0, ERROR_MSG_MAX);
    }

    await this.scheduleRetryOrDie(d, httpStatus, errorMsg ?? 'unknown error');
  }

  private async markSent(id: string, httpStatus: number): Promise<void> {
    const now = new Date();
    await this.prisma.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'sent',
        attemptedAt: now,
        deliveredAt: now,
        httpStatus,
        errorMsg: null,
      },
    });
  }

  private async markDead(
    id: string,
    errorMsg: string,
    httpStatus: number | null = null,
  ): Promise<void> {
    await this.prisma.client.webhookDelivery.update({
      where: { id },
      data: {
        status: 'dead',
        attemptedAt: new Date(),
        httpStatus,
        errorMsg: errorMsg.slice(0, ERROR_MSG_MAX),
      },
    });
  }

  private async scheduleRetryOrDie(
    d: DueDelivery,
    httpStatus: number | null,
    errorMsg: string,
  ): Promise<void> {
    const nextAttempt = d.attempt + 1;
    if (nextAttempt > d.maxAttempts) {
      await this.markDead(d.id, errorMsg, httpStatus);
      return;
    }
    const delayIndex = Math.min(nextAttempt - 1, BACKOFF_MS.length - 1);
    const delay = BACKOFF_MS[delayIndex]!;
    const nextRetryAt = new Date(Date.now() + delay);
    await this.prisma.client.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: 'pending',
        attempt: nextAttempt,
        nextRetryAt,
        attemptedAt: new Date(),
        httpStatus,
        errorMsg: errorMsg.slice(0, ERROR_MSG_MAX),
      },
    });
  }
}
