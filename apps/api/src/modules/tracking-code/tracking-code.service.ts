import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateTrackingCodeInput,
  CreateTrackingCodeSchema,
  TrackingCodeFilterSchema,
  type UpdateTrackingCodeInput,
  UpdateTrackingCodeSchema,
} from './tracking-code.schema.js';

@Injectable()
export class TrackingCodeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = TrackingCodeFilterSchema.parse(rawFilter);
    const where: Prisma.TrackingCodeWhereInput = {
      accountId,
      ...(filter.search
        ? {
            OR: [
              { cis: { contains: filter.search, mode: 'insensitive' } },
              { cis1162: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
    };

    const rows = await this.prisma.client.trackingCode.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.trackingCode.count({ where });

    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.trackingCode.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`TrackingCode ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.trackingCode.create({
        data: {
          accountId,
          cis: parsed.cis,
          cis1162: parsed.cis1162,
          type: parsed.type,
          status: parsed.status ?? 'ACTIVE',
          productId: parsed.productId,
          variantId: parsed.variantId,
          trackingCodes: parsed.trackingCodes as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.TrackingCodeUpdateInput = {};
    if (parsed.cis !== undefined) data.cis = parsed.cis;
    if (parsed.cis1162 !== undefined) data.cis1162 = parsed.cis1162;
    if (parsed.type !== undefined) data.type = parsed.type;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.productId !== undefined) data.productId = parsed.productId;
    if (parsed.variantId !== undefined) data.variantId = parsed.variantId;
    if (parsed.trackingCodes !== undefined)
      data.trackingCodes = parsed.trackingCodes as Prisma.InputJsonValue;

    try {
      // Optimistic lock: the `version` filter (extra scalar predicate on the
      // unique `id`) only matches if the row is unchanged since the form loaded.
      // A stale version matches zero rows → Prisma P2025 → 409. findById above
      // already proved the row exists, so P2025 here can only be a conflict.
      return await this.prisma.client.trackingCode.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'TrackingCode');
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.trackingCode.delete({ where: { id, accountId } });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateTrackingCodeInput {
    const r = CreateTrackingCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateTrackingCodeInput {
    const r = UpdateTrackingCodeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(`Bu CIS kod allaqachon mavjud: ${err.meta?.target?.join(', ')}`);
    }
    throw e as Error;
  }
}
