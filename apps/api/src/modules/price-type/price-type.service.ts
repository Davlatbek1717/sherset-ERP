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
  type CreatePriceTypeInput,
  CreatePriceTypeSchema,
  PriceTypeFilterSchema,
  type UpdatePriceTypeInput,
  UpdatePriceTypeSchema,
} from './price-type.schema.js';

@Injectable()
export class PriceTypeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PriceTypeFilterSchema.parse(rawFilter);
    const where: Prisma.PriceTypeWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.priceType.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.priceType.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`PriceType ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    // If this entry is isDefault, clear the flag on any existing default.
    if (parsed.isDefault) {
      await this.clearDefault(accountId);
    }

    try {
      const created = await this.prisma.client.priceType.create({
        data: {
          accountId,
          name: parsed.name,
          currency: parsed.currency,
          isDefault: parsed.isDefault,
          position: parsed.position,
          externalCode: parsed.externalCode ?? null,
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (parsed.isDefault === true) {
      await this.clearDefault(accountId, id);
    }

    const data: Prisma.PriceTypeUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.isDefault !== undefined) data.isDefault = parsed.isDefault;
    if (parsed.position !== undefined) data.position = parsed.position;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode ?? null;

    try {
      // Optimistic lock: version filter matches only if no concurrent write
      // bumped the version since the form loaded. findById above proves the row
      // exists, so P2025 here means a concurrency conflict, not a missing row.
      const updated = await this.prisma.client.priceType.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      const diff = this.diff(existing, updated);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'PriceType');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.isDefault) {
      throw new BadRequestException(
        'Standart narx turini arxivlash mumkin emas — avval boshqasini standart qiling',
      );
    }
    const updated = await this.prisma.client.priceType.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return updated;
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.priceType.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.isDefault) {
      throw new BadRequestException("Standart narx turini o'chirish mumkin emas");
    }
    // Hard-delete is safe: Product.salePrices references this only by id
    // inside a JSON blob; an orphaned id in a stored price is tolerated
    // by the UI (it just shows "Unknown").
    await this.prisma.client.priceType.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // =====================================================================
  // helpers
  // =====================================================================

  /**
   * Guarantee every account has EXACTLY ONE default price type. Called lazily
   * by the reference endpoint (every GET /price-types) + by seed scripts.
   * Idempotent and self-healing.
   *
   * The previous version promoted an arbitrary `findFirst` row (no orderBy) to
   * default whenever that row was not default — without clearing existing
   * defaults — so an account that already had a default could acquire a SECOND
   * one (e.g. «Оптовая» promoted alongside «Розничная»), which makes price-type
   * columns mirror the default tier and `pickSalePriceMinor` ambiguous. This
   * version keeps the lowest-position default and demotes any extras.
   */
  async ensureDefault(accountId: string): Promise<void> {
    const defaults = await this.prisma.client.priceType.findMany({
      where: { accountId, archived: false, isDefault: true },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    const keep = defaults[0];
    if (defaults.length === 1) return;
    if (keep) {
      // length > 1: heal accounts already corrupted by the old bug — keep the
      // lowest-position default, demote the rest. One default remains.
      await this.prisma.client.priceType.updateMany({
        where: { accountId, isDefault: true, id: { not: keep.id } },
        data: { isDefault: false },
      });
      return;
    }
    // No default yet — promote the first existing type, else create one.
    const first = await this.prisma.client.priceType.findFirst({
      where: { accountId, archived: false },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    if (first) {
      await this.prisma.client.priceType.update({
        where: { id: first.id, accountId },
        data: { isDefault: true },
      });
      return;
    }
    await this.prisma.client.priceType.create({
      data: {
        accountId,
        name: 'Default',
        currency: 'UZS',
        isDefault: true,
        position: 0,
      },
    });
  }

  private parseCreate(raw: unknown): CreatePriceTypeInput {
    const r = CreatePriceTypeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePriceTypeInput {
    const r = UpdatePriceTypeSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async clearDefault(accountId: string, exceptId?: string): Promise<void> {
    await this.prisma.client.priceType.updateMany({
      where: {
        accountId,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (k === 'createdAt' || k === 'updatedAt') continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        d[k] = { before: before[k], after: after[k] };
      }
    }
    return d;
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Record<string, unknown> | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'PriceType',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu nom bilan narx turi allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
