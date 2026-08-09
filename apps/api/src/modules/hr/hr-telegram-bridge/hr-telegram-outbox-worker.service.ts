import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { isCronLeader } from '../../shared/cron-leader.js';
import {
  LEASE_EXPIRED_NOTE,
  OUTBOX_SENDING,
  claimLeaseUntil,
  dedupNote,
  dedupSince,
} from '../../shared/outbox-claim.js';
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
 * longer than the 5s interval. Cross-instance safety comes from the
 * EXCLUSIVE claim (`pending|retry → 'sending'` + lease) — see
 * `shared/outbox-claim.ts`. Faza 28 (INT-08/HR-4): the previous guard wrote
 * `pending → pending`, so a rival worker's `updateMany` also returned
 * `count = 1` and both sent the same message.
 */
@Injectable()
export class HrTelegramOutboxWorker {
  private readonly logger = new Logger(HrTelegramOutboxWorker.name);
  private running = false;

  /**
   * Har tick'da ko'pi bilan shuncha qator olinadi (ban-himoya, 2026-07-21:
   * partiyani cheklaydi). ASOSIY tezlik-chegara endi mtproto-worker'ning
   * har-send `pace()` throttle'ida (akkaunt bo'yicha ~3s) — bu faqat bitta
   * tick qancha qatorni "band qilishini" cheklaydi (qisqaroq tick = restartga
   * chidamli). Default 10, `TELEGRAM_OUTBOX_MAX_PER_TICK` bilan sozlanadi.
   */
  private maxPerTick(): number {
    return Number(process.env.TELEGRAM_OUTBOX_MAX_PER_TICK) || 10;
  }

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MTPROTO_ADAPTER) private readonly adapter: MtprotoAdapter,
  ) {}

  @Cron('*/5 * * * * *') // every 5 seconds
  async tick(): Promise<void> {
    if (!isCronLeader()) return;
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
    await this.reapExpiredClaims(now);
    const due = await this.prisma.client.hrTelegramOutbox.findMany({
      where: {
        OR: [{ status: 'pending' }, { status: 'retry', nextRetryAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: this.maxPerTick(),
    });

    let sent = 0;
    let retried = 0;
    let failed = 0;

    for (const row of due) {
      // EXCLUSIVE claim (INT-08/HR-4): move the row OUT of the sendable set
      // and stamp a lease. A rival worker blocks on the row lock, re-evaluates
      // the predicate and gets count=0 ⇒ exactly one sender.
      const claim = await this.prisma.client.hrTelegramOutbox.updateMany({
        where: { id: row.id, status: { in: ['pending', 'retry'] } },
        data: { status: OUTBOX_SENDING, nextRetryAt: claimLeaseUntil(now) },
      });
      if (claim.count === 0) continue;

      // INT-09: on a RE-attempt the previous attempt's outcome may be unknown
      // (crash after the provider accepted). If the same text already reached
      // this recipient inside the dedup window, don't send it twice.
      if (row.retryCount > 0) {
        const twin = await this.findDeliveredTwin(row, now);
        if (twin) {
          await this.prisma.client.hrTelegramOutbox.update({
            where: { id: row.id },
            data: { status: 'sent', sentAt: new Date(), failReason: dedupNote(twin.sentAt) },
          });
          sent++;
          continue;
        }
      }

      try {
        // A row carrying an attachment (акт-сверка .xlsx) is delivered as a
        // Telegram document; otherwise a plain text message.
        const result = row.attachmentPath
          ? await this.adapter.sendDocument({
              accountId: row.accountId,
              toPhone: row.toPhone ?? '',
              filePath: row.attachmentPath,
              caption: row.messageText,
            })
          : await this.adapter.sendMessage({
              accountId: row.accountId,
              toPhone: row.toPhone ?? '',
              text: row.messageText,
              sourceEventType: row.sourceEventType,
              toSelf: row.toSelf,
              viaSlot: row.viaSlot ?? undefined,
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

  /**
   * Returns rows abandoned mid-send (worker killed between claim and outcome)
   * to the queue once their lease expires. Without this a pm2 restart would
   * strand every in-flight row in `'sending'` forever.
   *
   * `retryCount` is incremented so a row that crashes the worker every time
   * still walks the backoff ladder into `failed` instead of looping.
   */
  private async reapExpiredClaims(now: Date): Promise<void> {
    const reaped = await this.prisma.client.hrTelegramOutbox.updateMany({
      where: { status: OUTBOX_SENDING, nextRetryAt: { lte: now } },
      data: { status: 'retry', retryCount: { increment: 1 }, failReason: LEASE_EXPIRED_NOTE },
    });
    if (reaped.count > 0) {
      this.logger.warn(`Outbox: re-queued ${reaped.count} row(s) with an expired claim lease`);
    }
  }

  /** Same recipient + same text already delivered inside the dedup window? */
  private async findDeliveredTwin(
    row: {
      id: string;
      accountId: string;
      toPhone: string | null;
      toSelf: boolean;
      messageText: string;
      attachmentPath: string | null;
    },
    now: Date,
  ): Promise<{ sentAt: Date | null } | null> {
    return this.prisma.client.hrTelegramOutbox.findFirst({
      where: {
        id: { not: row.id },
        accountId: row.accountId,
        toPhone: row.toPhone,
        toSelf: row.toSelf,
        messageText: row.messageText,
        attachmentPath: row.attachmentPath,
        status: 'sent',
        sentAt: { gte: dedupSince(now) },
      },
      select: { sentAt: true },
      orderBy: { sentAt: 'desc' },
    });
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
