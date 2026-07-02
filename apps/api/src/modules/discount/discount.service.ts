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
  type CreateDiscountInput,
  CreateDiscountSchema,
  DiscountFilterSchema,
  type UpdateDiscountInput,
  UpdateDiscountSchema,
} from './discount.schema.js';

@Injectable()
export class DiscountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = DiscountFilterSchema.parse(rawFilter);
    const where: Prisma.DiscountWhereInput = {
      accountId,
      archived: filter.archived,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.active !== undefined ? { active: filter.active } : {}),
    };
    const items = await this.prisma.client.discount.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.discount.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Discount ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.discount.create({
        data: {
          accountId,
          name: parsed.name,
          kind: parsed.kind,
          active: parsed.active,
          allAgents: parsed.allAgents,
          allProducts: parsed.allProducts,
          agentTags: parsed.agentTags,
          rules: parsed.rules as Prisma.InputJsonValue | undefined,
          earnRateUzsToPoint: parsed.earnRateUzsToPoint,
          spendRatePointsToUzs: parsed.spendRatePointsToUzs,
          maxPaidRatePercents: parsed.maxPaidRatePercents,
          earnWhileRedeeming: parsed.earnWhileRedeeming,
          archived: parsed.archived,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.DiscountUpdateInput = { version: { increment: 1 } };
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.kind !== undefined) data.kind = parsed.kind;
    if (parsed.active !== undefined) data.active = parsed.active;
    if (parsed.allAgents !== undefined) data.allAgents = parsed.allAgents;
    if (parsed.allProducts !== undefined) data.allProducts = parsed.allProducts;
    if (parsed.agentTags !== undefined) data.agentTags = { set: parsed.agentTags };
    if (parsed.rules !== undefined) data.rules = parsed.rules as Prisma.InputJsonValue;
    if (parsed.earnRateUzsToPoint !== undefined)
      data.earnRateUzsToPoint = parsed.earnRateUzsToPoint;
    if (parsed.spendRatePointsToUzs !== undefined)
      data.spendRatePointsToUzs = parsed.spendRatePointsToUzs;
    if (parsed.maxPaidRatePercents !== undefined)
      data.maxPaidRatePercents = parsed.maxPaidRatePercents;
    if (parsed.earnWhileRedeeming !== undefined)
      data.earnWhileRedeeming = parsed.earnWhileRedeeming;
    if (parsed.archived !== undefined) data.archived = parsed.archived;

    try {
      return await this.prisma.client.discount.update({
        where: { id, accountId, version: parsed.version },
        data,
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Discount');
      this.handlePrisma(e);
    }
  }

  async softArchive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.discount.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.discount.delete({ where: { id, accountId } });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateDiscountInput {
    const r = CreateDiscountSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateDiscountInput {
    const r = UpdateDiscountSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu nomli skidka allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
