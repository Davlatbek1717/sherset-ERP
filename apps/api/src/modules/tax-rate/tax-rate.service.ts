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
  type CreateTaxRateInput,
  CreateTaxRateSchema,
  TaxRateFilterSchema,
  type UpdateTaxRateInput,
  UpdateTaxRateSchema,
} from './tax-rate.schema.js';

const DEFAULT_RATES = [0, 12, 15];

@Injectable()
export class TaxRateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = TaxRateFilterSchema.parse(rawFilter);
    const where: Prisma.TaxRateWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
    };
    // Placeholder is «По ставке…» (by rate): match the numeric rate exactly
    // when the query parses as a number, OR the free-text comment (the only
    // contains-searchable column — `rate` is Decimal). Mirrors the sibling
    // expense-items search; the FE box was previously inert (no-op handler +
    // service dropped the schema's `search` field).
    const search = filter.search?.trim();
    if (search) {
      const num = Number(search);
      const or: Prisma.TaxRateWhereInput[] = [
        { comment: { contains: search, mode: 'insensitive' } },
      ];
      if (Number.isFinite(num)) or.push({ rate: num });
      where.OR = or;
    }
    const items = await this.prisma.client.taxRate.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.taxRate.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`TaxRate ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.taxRate.create({
        data: {
          accountId,
          rate: parsed.rate,
          comment: parsed.comment,
          shared: parsed.shared,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.TaxRateUpdateInput = {};
    if (parsed.rate !== undefined) data.rate = parsed.rate;
    if (parsed.comment !== undefined) data.comment = parsed.comment;
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    try {
      // Optimistic lock: the `version` filter only matches if the row is
      // unchanged since the form loaded. A stale version matches zero rows →
      // Prisma P2025 → 409. findById above already proved the row exists, so
      // P2025 here can only mean a concurrent write bumped the version.
      return await this.prisma.client.taxRate.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'TaxRate');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.taxRate.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.taxRate.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.taxRate.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Seed default UZ rates if account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.taxRate.findFirst({ where: { accountId } });
    if (existing) return;

    for (const rate of DEFAULT_RATES) {
      await this.prisma.client.taxRate.create({
        data: { accountId, rate, shared: true },
      });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateTaxRateInput {
    const r = CreateTaxRateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateTaxRateInput {
    const r = UpdateTaxRateSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu soliq stavkasi allaqachon mavjud (${err.meta?.target?.join(', ')})`,
      );
    }
    throw e as Error;
  }
}
