import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { ChatHistoryFilter, ListHrMessagesFilter } from './hr-messages.schema.js';

/**
 * Read model on top of HrTelegramOutbox + Counterparty join. Backs the
 * admin "Xabarlar" page: paginated list of all messages with status,
 * counterparty resolution, and a separate per-counterparty "chat history"
 * panel that scrolls a single peer's outbound thread.
 *
 * Tenancy: every query is `WHERE account_id = $accountId`; RLS on the
 * underlying tables is the defense-in-depth backstop.
 */
@Injectable()
export class HrMessagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, filter: ListHrMessagesFilter) {
    const where: Record<string, unknown> = { accountId };
    if (filter.status) where.status = filter.status;
    if (filter.counterpartyId) where.counterpartyId = filter.counterpartyId;
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {
        ...(filter.dateFrom && { gte: filter.dateFrom }),
        ...(filter.dateTo && { lte: filter.dateTo }),
      };
    }
    if (filter.search) {
      // Match on raw text + phone — admin can paste either to find the row.
      where.OR = [
        { messageText: { contains: filter.search, mode: 'insensitive' } },
        { toPhone: { contains: filter.search } },
      ];
    }

    const [rows, total] = await this.prisma.client.$transaction([
      this.prisma.client.hrTelegramOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        include: {
          counterparty: { select: { id: true, name: true, phone: true } },
          employee: { select: { id: true, name: true } },
        },
      }),
      this.prisma.client.hrTelegramOutbox.count({ where }),
    ]);
    return { rows, total, page: filter.page, limit: filter.limit };
  }

  /** Returns the recent outbound thread for a single counterparty (oldest→newest). */
  async chatHistory(accountId: string, filter: ChatHistoryFilter) {
    return this.prisma.client.hrTelegramOutbox.findMany({
      where: { accountId, counterpartyId: filter.counterpartyId },
      orderBy: { createdAt: 'asc' },
      take: filter.limit,
      include: {
        employee: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Re-enqueue a 'failed' row so the worker picks it up again on the next
   * tick. Idempotent; rows already pending are not touched. Returns the
   * number of rows requeued so the UI can show a count badge.
   */
  async requeue(accountId: string, id: string): Promise<{ ok: true; requeued: boolean }> {
    const updated = await this.prisma.client.hrTelegramOutbox.updateMany({
      where: { id, accountId, status: 'failed' },
      data: {
        status: 'pending',
        retryCount: 0,
        nextRetryAt: null,
        failReason: null,
      },
    });
    return { ok: true, requeued: updated.count > 0 };
  }

  /**
   * Aggregate counters for the admin badge / dashboard summary card.
   * Cheap: 4 indexed COUNTs against (accountId, status).
   */
  async statusCounts(accountId: string) {
    const [pending, retry, sent, failed] = await this.prisma.client.$transaction([
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'pending' } }),
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'retry' } }),
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'sent' } }),
      this.prisma.client.hrTelegramOutbox.count({ where: { accountId, status: 'failed' } }),
    ]);
    return { pending, retry, sent, failed };
  }
}
