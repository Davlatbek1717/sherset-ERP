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
  type CreateCustomEntityInput,
  CreateCustomEntitySchema,
  type CreateCustomEntityValueInput,
  CreateCustomEntityValueSchema,
  CustomEntityFilterSchema,
  type UpdateCustomEntityInput,
  UpdateCustomEntitySchema,
  type UpdateCustomEntityValueInput,
  UpdateCustomEntityValueSchema,
} from './custom-entity.schema.js';

@Injectable()
export class CustomEntityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // =====================================================================
  // Parent (CustomEntity)
  // =====================================================================

  async list(accountId: string, rawFilter: unknown) {
    const filter = CustomEntityFilterSchema.parse(rawFilter);
    const where: Prisma.CustomEntityWhereInput = {
      accountId,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.customEntity.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      include: { _count: { select: { values: true } } },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.customEntity.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`CustomEntity ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.customEntity.create({
        data: { accountId, name: parsed.name },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.CustomEntityUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;

    try {
      // Optimistic lock: the `version` filter only matches if the row is
      // unchanged since the form loaded. A stale version matches zero rows →
      // Prisma P2025 → 409. findById above proved the row exists, so P2025
      // here can only be a conflict.
      return await this.prisma.client.customEntity.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'CustomEntity');
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.customEntity.delete({ where: { id, accountId } });
    return { ok: true };
  }

  // =====================================================================
  // Children (CustomEntityValue)
  // =====================================================================

  async listValues(accountId: string, customEntityId: string) {
    // Verify parent belongs to account
    await this.findById(accountId, customEntityId);

    const items = await this.prisma.client.customEntityValue.findMany({
      where: { accountId, customEntityId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return { items, total: items.length };
  }

  async findValueById(accountId: string, customEntityId: string, valueId: string) {
    await this.findById(accountId, customEntityId);
    const row = await this.prisma.client.customEntityValue.findFirst({
      where: { id: valueId, accountId, customEntityId },
    });
    if (!row) throw new NotFoundException(`CustomEntityValue ${valueId} not found`);
    return row;
  }

  async createValue(accountId: string, customEntityId: string, raw: unknown) {
    await this.findById(accountId, customEntityId);
    const parsed = this.parseCreateValue(raw);
    return this.prisma.client.customEntityValue.create({
      data: {
        accountId,
        customEntityId,
        name: parsed.name,
        position: parsed.position,
      },
    });
  }

  async updateValue(accountId: string, customEntityId: string, valueId: string, raw: unknown) {
    const parsed = this.parseUpdateValue(raw);
    await this.findValueById(accountId, customEntityId, valueId);

    const data: Prisma.CustomEntityValueUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.position !== undefined) data.position = parsed.position;

    return this.prisma.client.customEntityValue.update({
      where: { id: valueId },
      data,
    });
  }

  async deleteValue(accountId: string, customEntityId: string, valueId: string) {
    await this.findValueById(accountId, customEntityId, valueId);
    await this.prisma.client.customEntityValue.delete({ where: { id: valueId } });
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateCustomEntityInput {
    const r = CreateCustomEntitySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCustomEntityInput {
    const r = UpdateCustomEntitySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseCreateValue(raw: unknown): CreateCustomEntityValueInput {
    const r = CreateCustomEntityValueSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdateValue(raw: unknown): UpdateCustomEntityValueInput {
    const r = UpdateCustomEntityValueSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu nom bilan lug'at allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
