import { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreateSalesChannelSchema,
  SalesChannelFilterSchema,
  UpdateSalesChannelSchema,
} from './sales-channel.schema.js';

/**
 * SalesChannelService — CRUD + archive for external storefront connectors.
 *
 * V1 scope: persistence only.
 * V2 will add: real sync trigger, webhook receiver, cron product push.
 */
@Injectable()
export class SalesChannelService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SalesChannelFilterSchema.parse(rawFilter);

    const where: Prisma.SalesChannelWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { externalRef: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.salesChannel.findMany({
        where,
        orderBy: { [filter.sortBy]: filter.sortDir },
        take: filter.limit,
        select: {
          id: true,
          name: true,
          kind: true,
          externalRef: true,
          archived: true,
          lastSyncedAt: true,
          lastSyncOk: true,
          lastSyncMsg: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.client.salesChannel.count({ where }),
    ]);

    const nextCursor = items.length === filter.limit ? items[items.length - 1]?.id : undefined;

    return { items, total, nextCursor };
  }

  async findById(accountId: string, id: string) {
    const channel = await this.prisma.client.salesChannel.findFirst({
      where: { id, accountId },
    });
    if (!channel) throw new NotFoundException('Sales channel not found');
    return channel;
  }

  async create(accountId: string, rawBody: unknown) {
    const data = CreateSalesChannelSchema.parse(rawBody);
    return this.prisma.client.salesChannel.create({
      data: {
        accountId,
        name: data.name,
        kind: data.kind,
        externalRef: data.externalRef ?? null,
        externalCode: data.externalCode ?? null,
        settings: data.settings != null ? (data.settings as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async update(accountId: string, id: string, rawBody: unknown) {
    const existing = await this.findById(accountId, id);
    const data = UpdateSalesChannelSchema.parse(rawBody);
    try {
      // Optimistic lock: version + accountId in where so a stale form
      // cannot clobber a concurrent save (P2025 → 409).
      return await this.prisma.client.salesChannel.update({
        where: { id: existing.id, accountId, version: data.version },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.kind !== undefined ? { kind: data.kind } : {}),
          ...(data.externalRef !== undefined ? { externalRef: data.externalRef } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(data.settings !== undefined
            ? {
                settings:
                  data.settings == null
                    ? Prisma.JsonNull
                    : (data.settings as Prisma.InputJsonValue),
              }
            : {}),
          ...(data.archived !== undefined ? { archived: data.archived } : {}),
          version: { increment: 1 },
        },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'SalesChannel');
      throw e;
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.salesChannel.update({
      where: { id },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.salesChannel.update({
      where: { id },
      data: { archived: false },
    });
  }

  async remove(accountId: string, id: string) {
    const existing = await this.findById(accountId, id);
    // Prevent deletion if channel has any orders
    const orderCount = await this.prisma.client.onlineOrder.count({
      where: { channelId: existing.id, accountId },
    });
    if (orderCount > 0) {
      throw new BadRequestException(
        `Cannot delete channel with ${orderCount} online order(s). Archive instead.`,
      );
    }
    await this.prisma.client.salesChannel.delete({ where: { id } });
    return { success: true };
  }
}
