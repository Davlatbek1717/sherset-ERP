import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConsignmentFilterSchema } from './consignment.schema.js';

/**
 * Consignment read service. Sprint 8 ships read-only list + detail.
 *
 * The expiry sort defaults to ASC because the most common screen task
 * is «show me what's about to expire» — clerks scan from the top.
 * Switch to DESC when ranking long-shelf-life batches for FEFO
 * back-fill operations.
 */
@Injectable()
export class ConsignmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown) {
    const filter = ConsignmentFilterSchema.parse(raw);
    const where: Prisma.ConsignmentWhereInput = {
      accountId,
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.variantId ? { variantId: filter.variantId } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { label: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
              { product: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.expiryFrom || filter.expiryTo
        ? {
            expiryDate: {
              ...(filter.expiryFrom ? { gte: new Date(filter.expiryFrom) } : {}),
              ...(filter.expiryTo ? { lte: new Date(filter.expiryTo) } : {}),
            },
          }
        : {}),
      // «Already expired» — server-anchored to today() so a clerk
      // and the API agree on what's stale, regardless of client
      // timezone drift.
      ...(filter.expiredOnly ? { expiryDate: { lt: new Date() } } : {}),
    };

    const rows = await this.prisma.client.consignment.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        product: { select: { id: true, name: true, code: true, uom: true } },
        variant: { select: { id: true, name: true, code: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.consignment.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.consignment.findFirst({
      where: { id, accountId },
      include: {
        product: true,
        variant: true,
      },
    });
    if (!row) throw new NotFoundException(`Consignment ${id} not found`);
    return row;
  }
}
