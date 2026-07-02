import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateStateSchema, StateFilterSchema, UpdateStateSchema } from './state.schema.js';

/**
 * State service — moysklad-parity workflow states per tenant per
 * entity type. The schema's `states` table is shared across every
 * FSM-backed entity (customerorder, demand, invoiceout, ...) via
 * the `entityType` discriminator column.
 *
 * Default labels for FSM enum slugs are NOT seeded here — fronts
 * fall back to the i18n `states.<entity>.<slug>` namespace when no
 * tenant override exists. This keeps the table empty for fresh
 * accounts unless the admin explicitly creates customised states.
 */
@Injectable()
export class StateService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = StateFilterSchema.parse(rawFilter);
    const items = await this.prisma.client.state.findMany({
      where: {
        accountId,
        ...(filter.entityType ? { entityType: filter.entityType } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > filter.limit;
    return {
      items: hasMore ? items.slice(0, filter.limit) : items,
      nextCursor: hasMore ? items[filter.limit - 1]?.id : undefined,
    };
  }

  async findById(accountId: string, id: string) {
    const found = await this.prisma.client.state.findFirst({
      where: { id, accountId },
    });
    if (!found) throw new NotFoundException(`State ${id} not found`);
    return found;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = CreateStateSchema.parse(raw);
    return this.prisma.client.state.create({
      data: {
        accountId,
        entityType: parsed.entityType,
        name: parsed.name,
        color: parsed.color ?? null,
        stateType: parsed.stateType,
        position: parsed.position,
      },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    await this.findById(accountId, id);
    const parsed = UpdateStateSchema.parse(raw);
    return this.prisma.client.state.update({
      where: { id },
      data: {
        ...(parsed.entityType !== undefined ? { entityType: parsed.entityType } : {}),
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.color !== undefined ? { color: parsed.color } : {}),
        ...(parsed.stateType !== undefined ? { stateType: parsed.stateType } : {}),
        ...(parsed.position !== undefined ? { position: parsed.position } : {}),
      },
    });
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.state.update({
      where: { id },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.state.update({
      where: { id },
      data: { archived: false },
    });
  }

  async remove(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.state.delete({ where: { id } });
    return { ok: true };
  }
}
