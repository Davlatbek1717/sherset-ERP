import type { Prisma } from '@moysklad/db';
import type { WebhookStock } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateWebhookStockSchema,
  UpdateWebhookStockSchema,
  WebhookStockFilterSchema,
} from './webhook-stock.schema.js';

/**
 * WebhookStockService — CRUD for stock-event webhook subscriptions.
 *
 * Mirrors moysklad's separate /entity/webhookstock API. Same delivery
 * mechanism as regular webhooks (persistent queue + cron worker), but
 * with stock-specific payload (store + assortment + counter deltas).
 */
@Injectable()
export class WebhookStockService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = WebhookStockFilterSchema.parse(rawFilter);
    const where: Prisma.WebhookStockWhereInput = {
      accountId,
      ...(filter.stockType ? { stockType: filter.stockType } : {}),
      ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
    };
    const rows = await this.prisma.client.webhookStock.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.webhookStock.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string): Promise<WebhookStock> {
    const row = await this.prisma.client.webhookStock.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`WebhookStock ${id} topilmadi`);
    return row;
  }

  async create(accountId: string, raw: unknown): Promise<WebhookStock> {
    const r = CreateWebhookStockSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    return this.prisma.client.webhookStock.create({
      data: {
        accountId,
        stockType: parsed.stockType,
        reportType: parsed.reportType,
        reportUrl: parsed.reportUrl,
        enabled: parsed.enabled ?? true,
      },
    });
  }

  async update(accountId: string, id: string, raw: unknown): Promise<WebhookStock> {
    const existing = await this.findById(accountId, id);
    const r = UpdateWebhookStockSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;
    const data: Prisma.WebhookStockUpdateInput = {};
    if (parsed.stockType !== undefined) data.stockType = parsed.stockType;
    if (parsed.reportType !== undefined) data.reportType = parsed.reportType;
    if (parsed.reportUrl !== undefined) data.reportUrl = parsed.reportUrl;
    if (parsed.enabled !== undefined) data.enabled = parsed.enabled;
    return this.prisma.client.webhookStock.update({
      where: { id, accountId: existing.accountId },
      data,
    });
  }

  async delete(accountId: string, id: string): Promise<{ ok: boolean }> {
    const existing = await this.findById(accountId, id);
    await this.prisma.client.webhookStock.delete({
      where: { id, accountId: existing.accountId },
    });
    return { ok: true };
  }

  /** Used by stock-changing services to look up active stock subscriptions. */
  findActive(accountId: string, stockType: string): Promise<WebhookStock[]> {
    return this.prisma.client.webhookStock.findMany({
      where: { accountId, stockType, enabled: true },
    });
  }
}
