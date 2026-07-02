import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateGroupSchema, UpdateGroupSchema } from './group.schema.js';

@Injectable()
export class GroupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, search?: string, limit?: string) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '200', 10) || 200, 1), 500);
    const items = await this.prisma.client.group.findMany({
      where: {
        accountId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ index: 'asc' }, { name: 'asc' }],
      take,
      select: { id: true, name: true, index: true },
    });
    return { items, total: items.length };
  }

  async create(accountId: string, raw: unknown) {
    const data = CreateGroupSchema.parse(raw);
    // Append to the end of the picklist unless an explicit index is given.
    let index = data.index;
    if (index === undefined) {
      const last = await this.prisma.client.group.findFirst({
        where: { accountId },
        orderBy: { index: 'desc' },
        select: { index: true },
      });
      index = (last?.index ?? -1) + 1;
    }
    // Duplicate name → P2002 (the @@unique[accountId,name]) → global filter maps to 409.
    return this.prisma.client.group.create({
      data: { accountId, name: data.name, index },
      select: { id: true, name: true, index: true },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const data = UpdateGroupSchema.parse(raw);
    await this.assertExists(accountId, id);
    return this.prisma.client.group.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.index !== undefined ? { index: data.index } : {}),
      },
      select: { id: true, name: true, index: true },
    });
  }

  async delete(accountId: string, id: string) {
    await this.assertExists(accountId, id);
    // Every groupId FK in the schema is ON DELETE SET NULL (verified: 44/44), so
    // deleting a department just unlinks its records (employees/documents keep,
    // lose their «Отдел») — no cascade, no orphan. moysklad-equivalent behaviour.
    await this.prisma.client.group.delete({ where: { id } });
    return { ok: true };
  }

  private async assertExists(accountId: string, id: string) {
    const g = await this.prisma.client.group.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!g) throw new NotFoundException(`Group ${id} not found`);
  }
}
