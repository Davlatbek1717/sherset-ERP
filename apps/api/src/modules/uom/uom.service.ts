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
  type CreateUomInput,
  CreateUomSchema,
  UomFilterSchema,
  type UpdateUomInput,
  UpdateUomSchema,
} from './uom.schema.js';

const DEFAULT_UOMS = [
  { name: 'шт', code: '796', description: 'Штука (dona)' },
  { name: 'кг', code: '166', description: 'Kilogramm' },
  { name: 'г', code: '163', description: 'Gramm' },
  { name: 'л', code: '112', description: 'Litr' },
  { name: 'м', code: '006', description: 'Metr' },
  { name: 'м²', code: '055', description: 'Kvadrat metr' },
  { name: 'м³', code: '113', description: 'Kub metr' },
  { name: 'пачка', code: '778', description: 'Pachka' },
];

@Injectable()
export class UomService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = UomFilterSchema.parse(rawFilter);
    const where: Prisma.UomWhereInput = {
      accountId,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.uom.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.uom.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Uom ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.uom.create({
        data: {
          accountId,
          name: parsed.name,
          code: parsed.code,
          externalCode: parsed.externalCode,
          description: parsed.description,
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

    const data: Prisma.UomUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    try {
      // Optimistic lock: version predicate means a stale write matches zero rows →
      // Prisma P2025 → 409. findById above already proved the row exists, so
      // P2025 here can only be a conflict.
      return await this.prisma.client.uom.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Uom');
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    try {
      await this.prisma.client.uom.delete({ where: { id, accountId } });
      return { ok: true };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /** Seed 8 common UZ units if account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.uom.findFirst({ where: { accountId } });
    if (existing) return;

    for (const u of DEFAULT_UOMS) {
      await this.prisma.client.uom.create({
        data: { accountId, name: u.name, code: u.code, description: u.description, shared: true },
      });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateUomInput {
    const r = CreateUomSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateUomInput {
    const r = UpdateUomSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu kod bilan o'lchov birligi allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    // No table currently FK-references a uom row (Product.uom is free text),
    // but guard defensively so a future relation or a concurrent delete
    // returns a clean 409/404 instead of a 500 leaking through runBulk.
    if (err.code === 'P2003' || err.code === 'P2014')
      throw new ConflictException("O'lchov birligi ishlatilmoqda — avval bog'liqliklarni uzing");
    if (err.code === 'P2025') throw new NotFoundException("O'lchov birligi topilmadi");
    throw e as Error;
  }
}
