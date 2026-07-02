import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CharacteristicFilterSchema, CreateCharacteristicSchema } from './characteristic.schema.js';

@Injectable()
export class CharacteristicService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CharacteristicFilterSchema.parse(rawFilter);
    const where: Prisma.CharacteristicWhereInput = {
      accountId,
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.client.characteristic.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return { items, total: items.length };
  }

  async create(accountId: string, raw: unknown) {
    const r = CreateCharacteristicSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return this.findOrCreate(accountId, r.data.name);
  }

  /**
   * Find-or-create a characteristic by name (idempotent). Uses upsert on the
   * `[accountId, name]` unique index so two concurrent generate calls can't
   * create a duplicate (the second hits the unique constraint and updates the
   * existing row). `update: {}` is a no-op — we only want the existing row back.
   * Trims the name (the dictionary key is the trimmed value).
   */
  async findOrCreate(accountId: string, rawName: string) {
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Nom majburiy');
    return this.prisma.client.characteristic.upsert({
      where: { accountId_name: { accountId, name } },
      create: { accountId, name },
      update: {},
    });
  }
}
