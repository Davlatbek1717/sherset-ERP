import { randomUUID } from 'node:crypto';
import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateOnlineOrderSchema,
  OnlineOrderFilterSchema,
  RejectOnlineOrderSchema,
} from './online-order.schema.js';

/**
 * OnlineOrderService — list, accept, reject, convertToCustomerOrder (stub).
 *
 * convertToCustomerOrder V1 behavior:
 *   - Validates state === 'accepted'
 *   - Flips state to 'converted'
 *   - Sets customerOrderId to a generated UUID (placeholder)
 *   - Documents TODO for V2 actual conversion
 *
 * V2 will: create a real CustomerOrder + Demand from the online order items.
 */
@Injectable()
export class OnlineOrderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = OnlineOrderFilterSchema.parse(rawFilter);

    const where: Prisma.OnlineOrderWhereInput = {
      accountId,
      ...(filter.channelId ? { channelId: filter.channelId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            receivedAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { customerName: { contains: filter.search, mode: 'insensitive' } },
              { customerPhone: { contains: filter.search, mode: 'insensitive' } },
              { externalOrderId: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.client.onlineOrder.findMany({
        where,
        orderBy: { [filter.sortBy]: filter.sortDir },
        take: filter.limit,
        include: {
          channel: { select: { id: true, name: true, kind: true } },
        },
      }),
      this.prisma.client.onlineOrder.count({ where }),
    ]);

    const nextCursor = items.length === filter.limit ? items[items.length - 1]?.id : undefined;

    // BigInt → string serialization
    const serialized = items.map((o) => ({
      ...o,
      sumMinor: o.sumMinor.toString(),
    }));

    return { items: serialized, total, nextCursor };
  }

  async findById(accountId: string, id: string) {
    const order = await this.prisma.client.onlineOrder.findFirst({
      where: { id, accountId },
      include: {
        channel: { select: { id: true, name: true, kind: true } },
      },
    });
    if (!order) throw new NotFoundException('Online order not found');
    return { ...order, sumMinor: order.sumMinor.toString() };
  }

  async create(accountId: string, rawBody: unknown) {
    const data = CreateOnlineOrderSchema.parse(rawBody);

    // Verify channel belongs to this account
    const channel = await this.prisma.client.salesChannel.findFirst({
      where: { id: data.channelId, accountId },
    });
    if (!channel) throw new NotFoundException('Sales channel not found');

    try {
      const created = await this.prisma.client.onlineOrder.create({
        data: {
          accountId,
          channelId: data.channelId,
          externalOrderId: data.externalOrderId,
          customerName: data.customerName ?? null,
          customerPhone: data.customerPhone ?? null,
          customerAddress: data.customerAddress ?? null,
          sumMinor: data.sumMinor,
          currency: data.currency,
          items: data.items ?? undefined,
          receivedAt: data.receivedAt ?? new Date(),
        },
      });
      return { ...created, sumMinor: created.sumMinor.toString() };
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          `Order ${data.externalOrderId} already exists for this channel`,
        );
      }
      throw e;
    }
  }

  async accept(accountId: string, id: string) {
    const order = await this.findById(accountId, id);
    if (order.state !== 'pending') {
      throw new BadRequestException(`Cannot accept order in state '${order.state}'`);
    }
    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: { state: 'accepted' },
    });
    return { ...updated, sumMinor: updated.sumMinor.toString() };
  }

  async reject(accountId: string, id: string, rawBody: unknown) {
    const order = await this.findById(accountId, id);
    if (order.state !== 'pending') {
      throw new BadRequestException(`Cannot reject order in state '${order.state}'`);
    }
    const body = RejectOnlineOrderSchema.parse(rawBody ?? {});
    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: {
        state: 'rejected',
        // Store rejection reason in lastSyncMsg-style field
        // TODO V2: add rejectionReason column
      },
    });
    void body; // reason acknowledged but not yet persisted (V2 column)
    return { ...updated, sumMinor: updated.sumMinor.toString() };
  }

  /**
   * convertToCustomerOrder — V1 STUB.
   *
   * Current behavior:
   *   1. Validate state === 'accepted' (not pending/rejected/already converted)
   *   2. Flip state to 'converted'
   *   3. Assign a generated UUID as customerOrderId (placeholder — no actual
   *      CustomerOrder row is created in V1)
   *
   * TODO V2: Create a real CustomerOrder + Demand from the online order items.
   * Reference: CustomerOrderService.create() + DemandService.create()
   */
  async convertToCustomerOrder(accountId: string, id: string) {
    const order = await this.findById(accountId, id);
    if (order.state !== 'accepted') {
      throw new BadRequestException(
        `Cannot convert order in state '${order.state}'. Order must be accepted first.`,
      );
    }

    // V1: Generate a placeholder UUID — no real CustomerOrder created yet.
    const placeholderCustomerOrderId = randomUUID();

    const updated = await this.prisma.client.onlineOrder.update({
      where: { id },
      data: {
        state: 'converted',
        customerOrderId: placeholderCustomerOrderId,
      },
    });
    return {
      ...updated,
      sumMinor: updated.sumMinor.toString(),
      _v1Warning:
        'customerOrderId is a placeholder UUID. Real CustomerOrder creation is deferred to V2.',
    };
  }

  async counts(accountId: string) {
    const [pending, accepted, total] = await Promise.all([
      this.prisma.client.onlineOrder.count({ where: { accountId, state: 'pending' } }),
      this.prisma.client.onlineOrder.count({ where: { accountId, state: 'accepted' } }),
      this.prisma.client.onlineOrder.count({ where: { accountId } }),
    ]);
    return { pending, accepted, total };
  }
}
