import { Prisma } from '@moysklad/db';
import type { Webhook } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateWebhookSchema,
  UpdateWebhookSchema,
  WebhookDeliveryFilterSchema,
  WebhookFilterSchema,
} from './webhook.schema.js';

/**
 * WebhookService — CRUD for webhook subscriptions.
 *
 * Mirrors moysklad's /entity/webhook API. The `action` field is stored as
 * a comma-joined string in the DB (e.g. "CREATE,UPDATE") and exposed as an
 * array in API responses via the raw Prisma row (callers can split if needed).
 */
@Injectable()
export class WebhookService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = WebhookFilterSchema.parse(rawFilter);
    const where: Prisma.WebhookWhereInput = {
      accountId,
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
      ...(filter.search
        ? {
            OR: [
              { url: { contains: filter.search, mode: 'insensitive' } },
              { entityType: { contains: filter.search.toLowerCase() } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.webhook.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.webhook.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string): Promise<Webhook> {
    const row = await this.prisma.client.webhook.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Webhook ${id} topilmadi`);
    return row;
  }

  async create(accountId: string, raw: unknown): Promise<Webhook> {
    const r = CreateWebhookSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;

    return this.prisma.client.webhook.create({
      data: {
        accountId,
        entityType: parsed.entityType,
        action: parsed.action.join(','),
        url: parsed.url,
        secretHash: parsed.secretHash ?? null,
        diffType: parsed.diffType ?? null,
        enabled: parsed.enabled ?? true,
        authContext: (parsed.authContext as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async update(accountId: string, id: string, raw: unknown): Promise<Webhook> {
    const existing = await this.findById(accountId, id);
    const r = UpdateWebhookSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const parsed = r.data;

    const data: Prisma.WebhookUpdateInput = {};
    if (parsed.entityType !== undefined) data.entityType = parsed.entityType;
    if (parsed.action !== undefined) data.action = parsed.action.join(',');
    if (parsed.url !== undefined) data.url = parsed.url;
    if (parsed.secretHash !== undefined) data.secretHash = parsed.secretHash ?? null;
    if (parsed.diffType !== undefined) data.diffType = parsed.diffType ?? null;
    if (parsed.enabled !== undefined) data.enabled = parsed.enabled;
    if (parsed.authContext !== undefined) {
      data.authContext = (parsed.authContext as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }

    return this.prisma.client.webhook.update({
      where: { id, accountId: existing.accountId },
      data,
    });
  }

  async delete(accountId: string, id: string): Promise<{ ok: boolean }> {
    const existing = await this.findById(accountId, id);
    await this.prisma.client.webhook.delete({
      where: { id, accountId: existing.accountId },
    });
    return { ok: true };
  }

  /**
   * Returns enabled webhooks whose action column contains the given action.
   * Used by WebhookFireService to look up delivery targets.
   */
  findActiveForEvent(
    accountId: string,
    entityType: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
  ): Promise<Webhook[]> {
    return this.prisma.client.webhook.findMany({
      where: {
        accountId,
        entityType,
        enabled: true,
        action: { contains: action },
      },
    });
  }

  /**
   * Per-webhook delivery history (admin UI).
   * Tenant-scoped via {@link findById} which throws if the webhook is not
   * owned by the given account. Returns most-recent-first paginated rows.
   */
  async listDeliveries(accountId: string, webhookId: string, rawFilter: unknown) {
    await this.findById(accountId, webhookId); // tenant guard + 404
    const filter = WebhookDeliveryFilterSchema.parse(rawFilter);
    const where: Prisma.WebhookDeliveryWhereInput = {
      webhookId,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const rows = await this.prisma.client.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.webhookDelivery.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Manually re-enqueue a 'dead' or 'failed' delivery for another attempt.
   * Resets attempt counter to 1 and nextRetryAt to NOW so the worker picks
   * it up on the next tick.
   */
  async retryDelivery(accountId: string, webhookId: string, deliveryId: string) {
    await this.findById(accountId, webhookId); // tenant guard
    const delivery = await this.prisma.client.webhookDelivery.findFirst({
      where: { id: deliveryId, webhookId, accountId },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} topilmadi`);
    return this.prisma.client.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'pending',
        attempt: 1,
        nextRetryAt: new Date(),
        attemptedAt: null,
        deliveredAt: null,
        httpStatus: null,
        errorMsg: null,
      },
    });
  }
}
