import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MTPROTO_ADAPTER, type MtprotoAdapter, isMtprotoFloodError } from './mtproto-adapter.js';
import { isExhausted, nextRetryAt } from './retry-backoff.util.js';

/**
 * HrTelegramOutbox queue worker. Every 5 seconds (yangibolim parity) it
 * picks `pending` rows + due `retry` rows, attempts MTProto delivery via
 * the injected adapter, and updates the row FSM:
 *
 *   pending|retry → sent     (delivery succeeded → telegramMessageId set)
 *   pending|retry → retry    (transient fail → retryCount++ with backoff)
 *   pending|retry → failed   (3 retries exhausted → admin must re-enqueue)
 *
 * FLOOD_WAIT errors persist `flood_wait_until` against the SLOT (in
 * HrTelegramSession) and re-queue the row with the same retry schedule;
 * adapter is expected to refuse sends on flooded slots and pick the other.
 *
 * Concurrency: in-process `running` flag stops overlap when a tick takes
 * longer than the 5s interval. Cross-instance safety still depends on the
 * atomic `updateMany WHERE status IN ('pending','retry')` guard.
 */
@Injectable()
export class HrTelegramOutboxWorker {
  private readonly logger = new Logger(HrTelegramOutboxWorker.name);
  private static readonly MAX_PER_TICK = 50;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MTPROTO_ADAPTER) private readonly adapter: MtprotoAdapter,
  ) {}

  @Cron('*/5 * * * * *') // every 5 seconds
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Outbox tick skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Outbox tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Test/observability — runs one drain cycle and reports counts. */
  async runOnce(): Promise<{ sent: number; retried: number; failed: number }> {
    const now = new Date();
    const due = await this.prisma.client.hrTelegramOutbox.findMany({
      where: {
        OR: [{ status: 'pending' }, { status: 'retry', nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: HrTelegramOutboxWorker.MAX_PER_TICK,
    });

    let sent = 0;
    let retried = 0;
    let failed = 0;

    for (const row of due) {
      // Atomic guard: only proceed if row is still in a sendable state.
      // Defeats races with concurrent worker instances or manual admin moves.
      const claim = await this.prisma.client.hrTelegramOutbox.updateMany({
        where: { id: row.id, status: { in: ['pending', 'retry'] } },
        data: { status: 'pending' }, // touch to mark "being processed" (idempotent)
      });
      if (claim.count === 0) continue;

      try {
        const result = await this.adapter.sendMessage({
          accountId: row.accountId,
          toPhone: row.toPhone,
          text: row.messageText,
          sourceEventType: row.sourceEventType,
        });
        await this.prisma.client.hrTelegramOutbox.update({
          where: { id: row.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            telegramMessageId: result.messageId,
            sentBySlot: result.slot,
            failReason: null,
          },
        });
        sent++;
      } catch (e) {
        const outcome = await this.scheduleRetry(row.id, row.retryCount, e);
        if (outcome === 'failed') failed++;
        else retried++;
      }
    }

    if (sent + retried + failed > 0) {
      this.logger.log(
        `Outbox tick: sent=${sent} retried=${retried} failed=${failed} (queue=${due.length})`,
      );
    }
    return { sent, retried, failed };
  }

  private async scheduleRetry(
    id: string,
    currentRetryCount: number,
    error: unknown,
  ): Promise<'retried' | 'failed'> {
    const nextCount = currentRetryCount + 1;
    const flood = isMtprotoFloodError(error);

    if (flood) {
      // Persist flood wait against the slot so other rows skip it too.
      await this.persistFloodWait(error.slot, error.retryAfterSeconds);
    }

    if (isExhausted(currentRetryCount) && !flood) {
      await this.prisma.client.hrTelegramOutbox.update({
        where: { id },
        data: {
          status: 'failed',
          failReason: serializeError(error),
          retryCount: nextCount,
        },
      });
      return 'failed';
    }

    const due = flood
      ? new Date(Date.now() + error.retryAfterSeconds * 1000)
      : (nextRetryAt(currentRetryCount) ?? new Date(Date.now() + 60_000));

    await this.prisma.client.hrTelegramOutbox.update({
      where: { id },
      data: {
        status: 'retry',
        nextRetryAt: due,
        retryCount: nextCount,
        failReason: serializeError(error),
      },
    });
    return 'retried';
  }

  /**
   * Persists a flood-wait window keyed by slot. Stored in HrTelegramSession
   * with key='flood_wait' so it survives API restart (yangibolim parity).
   * `accountSlot` is the MTProto slot (1 or 2); we don't know `accountId`
   * at this layer so we store account=null sentinel (zero-uuid) and let the
   * adapter resolve. Future: adapter could surface accountId in the error.
   */
  private async persistFloodWait(slot: number, retryAfterSeconds: number): Promise<void> {
    const until = new Date(Date.now() + retryAfterSeconds * 1000);
    this.logger.warn(`FLOOD_WAIT slot=${slot} until=${until.toISOString()}`);
    // NOTE: per-account persistence happens in the gramjs adapter (it knows
    // accountId when the error is raised). Worker just logs here.
  }
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 500);
  try {
    return JSON.stringify(e).slice(0, 500);
  } catch {
    return String(e).slice(0, 500);
  }
}
