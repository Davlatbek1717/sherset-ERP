import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateCounterpartyGroupSchema,
  UpdateCounterpartyGroupSchema,
} from './counterparty-group.schema.js';

@Injectable()
export class CounterpartyGroupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string) {
    const rows = await this.prisma.client.counterpartyGroup.findMany({
      where: { accountId },
      orderBy: [{ index: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, index: true, _count: { select: { counterparties: true } } },
    });
    return {
      items: rows.map((g) => ({
        id: g.id,
        name: g.name,
        index: g.index,
        counterpartyCount: g._count.counterparties,
      })),
    };
  }

  async create(accountId: string, raw: unknown) {
    const data = CreateCounterpartyGroupSchema.parse(raw);
    // Duplicate name → P2002 (the @@unique[accountId,name]) → global filter maps to 409.
    return this.prisma.client.counterpartyGroup.create({
      data: { accountId, name: data.name, index: data.index ?? 0 },
      select: { id: true, name: true, index: true },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const data = UpdateCounterpartyGroupSchema.parse(raw);
    await this.assertExists(accountId, id);
    return this.prisma.client.counterpartyGroup.update({
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
    // The m2m join FK is ON DELETE CASCADE on the group side, so memberships are
    // dropped automatically; the counterparties themselves are untouched.
    await this.prisma.client.counterpartyGroup.delete({ where: { id } });
    return { ok: true };
  }

  private async assertExists(accountId: string, id: string) {
    const g = await this.prisma.client.counterpartyGroup.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!g) throw new NotFoundException(`CounterpartyGroup ${id} not found`);
  }
}
