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
  type CreateRegionInput,
  CreateRegionSchema,
  RegionFilterSchema,
  type UpdateRegionInput,
  UpdateRegionSchema,
} from './region.schema.js';

const DEFAULT_REGIONS = [
  { name: 'Toshkent shahri', code: 'UZ-TA' },
  { name: 'Toshkent viloyati', code: 'UZ-TO' },
  { name: 'Andijon', code: 'UZ-AN' },
  { name: 'Buxoro', code: 'UZ-BU' },
  { name: "Farg'ona", code: 'UZ-FA' },
  { name: 'Jizzax', code: 'UZ-JI' },
  { name: 'Xorazm', code: 'UZ-XO' },
  { name: 'Namangan', code: 'UZ-NG' },
  { name: 'Navoiy', code: 'UZ-NW' },
  { name: 'Qashqadaryo', code: 'UZ-QA' },
  { name: "Qoraqalpog'iston Respublikasi", code: 'UZ-QR' },
  { name: 'Samarqand', code: 'UZ-SA' },
  { name: 'Sirdaryo', code: 'UZ-SI' },
  { name: 'Surxondaryo', code: 'UZ-SU' },
];

@Injectable()
export class RegionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = RegionFilterSchema.parse(rawFilter);
    // Search box placeholder promises «По названию или коду» — honor both
    // (name + ISO-3166 code) so a code query (e.g. «UZ-TA») actually matches.
    const where: Prisma.RegionWhereInput = {
      accountId,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.client.region.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: 200,
    });
    return { items, total: items.length };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.region.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Region ${id} not found`);
    return row;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    try {
      return await this.prisma.client.region.create({
        data: {
          accountId,
          name: parsed.name,
          code: parsed.code,
          externalCode: parsed.externalCode,
        },
      });
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.RegionUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;

    try {
      return await this.prisma.client.region.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Region');
      this.handlePrisma(e);
    }
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.region.delete({ where: { id, accountId } });
    return { ok: true };
  }

  /** Seed all 14 UZ regions if account has none. */
  async seedDefaultsIfEmpty(accountId: string): Promise<void> {
    const existing = await this.prisma.client.region.findFirst({ where: { accountId } });
    if (existing) return;

    for (const r of DEFAULT_REGIONS) {
      await this.prisma.client.region.create({
        data: { accountId, name: r.name, code: r.code },
      });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateRegionInput {
    const r = CreateRegionSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateRegionInput {
    const r = UpdateRegionSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu kod bilan hudud allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
