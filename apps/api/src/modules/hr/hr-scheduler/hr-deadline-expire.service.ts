import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { HrTaskSendService } from '../hr-task-send/hr-task-send.service.js';

/**
 * Deadline auto-expire worker. Every minute, find HrTaskLog rows in 'sent'
 * status whose template.deadlineMinutes has elapsed since sent_at, atomically
 * flip them to 'answered_no', and trigger finalize (auto_expire_fine + event).
 *
 * Atomic guard: updateMany with `status='sent'` filter — concurrent worker
 * instances cannot double-process the same row (one win, others count=0).
 *
 * Multi-tenant: scans across accounts; finalize uses each log's accountId.
 */
@Injectable()
export class HrDeadlineExpireService {
  private readonly logger = new Logger(HrDeadlineExpireService.name);

  /** Per-tick safety cap to bound DB load on large queues. */
  private static readonly MAX_PER_TICK = 500;

  /**
   * In-process guard: if a previous tick is still running (e.g. >60s on a
   * large queue or under DB pressure), skip the next tick rather than
   * stacking parallel runs that all compete on the same rows. Cross-instance
   * safety still comes from the atomic `updateMany WHERE status='sent'`
   * guard inside `runOnce`.
   */
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(HrTaskSendService) private readonly sendService: HrTaskSendService,
  ) {}

  @Cron('0 * * * * *') // every minute, on the 0-second tick
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Deadline tick skipped: previous run still in flight');
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (e) {
      this.logger.error(`Deadline tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed for tests. Returns the number of logs expired in this run. */
  async runOnce(): Promise<{ expired: number }> {
    const now = Date.now();
    const candidates = await this.prisma.client.hrTaskLog.findMany({
      where: { status: 'sent' },
      select: {
        id: true,
        accountId: true,
        templateId: true,
        employeeId: true,
        sentAt: true,
        template: { select: { deadlineMinutes: true } },
      },
      take: HrDeadlineExpireService.MAX_PER_TICK,
    });

    let expired = 0;
    for (const log of candidates) {
      const dl = log.template.deadlineMinutes;
      if (dl == null || dl <= 0) continue;
      const expiresAtMs = log.sentAt.getTime() + dl * 60_000;
      if (expiresAtMs >= now) continue;

      // Atomic flip — only the worker that wins the race transitions the row.
      const upd = await this.prisma.client.hrTaskLog.updateMany({
        where: { id: log.id, status: 'sent' },
        data: {
          status: 'answered_no',
          answeredAt: new Date(),
          failReason: 'deadline_expired',
        },
      });
      if (upd.count === 0) continue;

      try {
        await this.sendService.finalize(
          log.accountId,
          log.id,
          'answered_no',
          log.templateId,
          log.employeeId,
          null,
          'deadline_expire',
        );
        expired++;
      } catch (e) {
        this.logger.error(`Finalize for expired log ${log.id} failed: ${(e as Error).message}`);
      }
    }

    if (expired > 0) {
      this.logger.log(`HR deadline expired ${expired} log(s)`);
    }
    return { expired };
  }
}
