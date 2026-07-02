import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateSavedFilterSchema,
  ListSavedFilterSchema,
  UpdateSavedFilterSchema,
} from './saved-filter.schema.js';

@Injectable()
export class SavedFilterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, ownerId: string | null, raw: unknown) {
    const { entity } = ListSavedFilterSchema.parse(raw);
    // Per-user pills only — strict ownerId match prevents one user's
    // chips from leaking into another user's list view.
    const items = await this.prisma.client.savedFilter.findMany({
      where: { accountId, ownerId, entity, deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return { items };
  }

  async create(accountId: string, ownerId: string | null, raw: unknown) {
    const parsed = CreateSavedFilterSchema.parse(raw);
    return this.prisma.client.savedFilter.create({
      data: {
        accountId,
        ownerId,
        entity: parsed.entity,
        name: parsed.name,
        queryString: parsed.queryString,
        position: parsed.position ?? 0,
      },
    });
  }

  async update(accountId: string, ownerId: string | null, id: string, raw: unknown) {
    const parsed = UpdateSavedFilterSchema.parse(raw);
    const existing = await this.prisma.client.savedFilter.findFirst({
      where: { id, accountId, ownerId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`SavedFilter ${id} not found`);

    return this.prisma.client.savedFilter.update({
      where: { id },
      data: {
        ...(parsed.entity !== undefined ? { entity: parsed.entity } : {}),
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.queryString !== undefined ? { queryString: parsed.queryString } : {}),
        ...(parsed.position !== undefined ? { position: parsed.position } : {}),
      },
    });
  }

  async remove(accountId: string, ownerId: string | null, id: string) {
    const existing = await this.prisma.client.savedFilter.findFirst({
      where: { id, accountId, ownerId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException(`SavedFilter ${id} not found`);
    await this.prisma.client.savedFilter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }
}
