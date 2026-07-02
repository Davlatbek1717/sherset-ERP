import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';

/** Max rows transitioned per cron tick (caps DB and webhook fan-out). */
const BATCH_LIMIT = 200;

/**
 * Hourly cron — finds InvoiceOut rows past their paymentPlannedMoment
 * still in a non-terminal billing state and bumps them to 'overdue'.
 *
 * Eligible source states:
 *   posted          — sent to customer obligation, not yet paid
 *   sent            — explicit "sent" action taken
 *   partially_paid  — partial payment received but unpaid balance is overdue
 *
 * Audit log + webhook UPDATE event fire per row, so external integrations
 * (1C sync, dunning workflows) get notified on transition.
 *
 * NOT touched here:
 *   draft / cancelled / paid — terminal w.r.t. billing
 *   already 'overdue' — no double-tap
 *   payedSumMinor >= sumMinor — invoice fully covered (paid by 17.4 cascade
 *   should have moved them; defence-in-depth filter here)
 */
@Injectable()
export class InvoiceOutOverdueService {
  private readonly logger = new Logger(InvoiceOutOverdueService.name);
  private isRunning = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  /** Runs at the top of every hour. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const now = new Date();
      const due = await this.prisma.client.invoiceOut.findMany({
        where: {
          state: { in: ['posted', 'sent', 'partially_paid'] },
          paymentPlannedMoment: { not: null, lt: now },
          deletedAt: null,
        },
        select: { id: true, accountId: true, state: true, sumMinor: true, payedSumMinor: true },
        take: BATCH_LIMIT,
      });

      const overdueRows = due.filter((r) => r.payedSumMinor < r.sumMinor);
      if (overdueRows.length === 0) return;

      this.logger.log(`Marking ${overdueRows.length} invoices overdue`);
      for (const row of overdueRows) {
        await this.prisma.client.invoiceOut.update({
          where: { id: row.id },
          data: { state: 'overdue' },
        });
        await this.prisma.client.auditLog.create({
          data: {
            accountId: row.accountId,
            userId: null,
            entity: 'InvoiceOut',
            entityId: row.id,
            action: 'transition:overdue',
            fieldChanges: {
              from: { before: row.state, after: 'overdue' },
              trigger: 'cron',
            },
          },
        });
        this.webhookFire.fireForEvent(row.accountId, 'invoiceout', 'UPDATE', row.id, ['state']);
      }
    } catch (err) {
      this.logger.error(`Overdue sweep failed: ${String(err)}`);
    } finally {
      this.isRunning = false;
    }
  }
}
