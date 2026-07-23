import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  ContactPersonFilterSchema,
  type CreateContactPersonInput,
  CreateContactPersonSchema,
  type UpdateContactPersonInput,
  UpdateContactPersonSchema,
} from './contact-person.schema.js';

@Injectable()
export class ContactPersonService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ContactPersonFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    const rows = await this.prisma.client.contactPerson.findMany({
      where,
      orderBy: this.buildOrderBy(filter.sortBy, filter.sortDir),
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        counterparty: { select: { id: true, name: true, legalTitle: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.contactPerson.count({ where });
    return { items, nextCursor, total };
  }

  /** Compose Prisma where-clause from a validated filter. Always anchors
   *  on accountId (tenant guard); archived defaults to false unless
   *  explicit. Search spans name/phone/email/position. */
  private buildListWhere(
    accountId: string,
    filter: import('./contact-person.schema.js').ContactPersonFilterInput,
  ): Prisma.ContactPersonWhereInput {
    return {
      accountId,
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.counterpartyIds ? { counterpartyId: { in: filter.counterpartyIds } } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { phone: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
              { position: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Translate sortBy into Prisma orderBy — `agent` is a relational sort
   *  (counterparty.name) so it needs the special-case shape. */
  private buildOrderBy(
    sortBy: import('./contact-person.schema.js').ContactPersonFilterInput['sortBy'],
    sortDir: 'asc' | 'desc',
  ): Prisma.ContactPersonOrderByWithRelationInput {
    if (sortBy === 'agent') return { counterparty: { name: sortDir } };
    return { [sortBy]: sortDir } as Prisma.ContactPersonOrderByWithRelationInput;
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.contactPerson.findFirst({
      where: { id, accountId },
      include: {
        counterparty: { select: { id: true, name: true, legalTitle: true, companyType: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`ContactPerson ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    const cp = await this.prisma.client.counterparty.findFirst({
      where: { id: parsed.counterpartyId, accountId },
      select: { id: true },
    });
    if (!cp) throw new BadRequestException('Kontragent topilmadi');

    const created = await this.prisma.client.contactPerson.create({
      data: {
        accountId,
        ownerId: userId,
        counterpartyId: parsed.counterpartyId,
        name: parsed.name,
        position: parsed.position ?? null,
        phone: parsed.phone ?? null,
        email: parsed.email ?? null,
        description: parsed.description ?? null,
      },
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    const data: Prisma.ContactPersonUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.position !== undefined) data.position = parsed.position;
    if (parsed.phone !== undefined) data.phone = parsed.phone;
    if (parsed.email !== undefined) data.email = parsed.email;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.counterpartyId) {
      const cp = await this.prisma.client.counterparty.findFirst({
        where: { id: parsed.counterpartyId, accountId },
        select: { id: true },
      });
      if (!cp) throw new BadRequestException('Kontragent topilmadi');
      data.counterparty = { connect: { id: parsed.counterpartyId } };
    }

    let updated: Awaited<ReturnType<typeof this.prisma.client.contactPerson.update>>;
    try {
      // Optimistic lock: version filter matches only if the row is unchanged
      // since the form loaded. A stale version → P2025 → 409.
      updated = await this.prisma.client.contactPerson.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'ContactPerson');
      throw e;
    }
    const fieldChanges = this.diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (Object.keys(fieldChanges).length) {
      await this.logAudit(accountId, userId, 'update', id, fieldChanges);
    }
    return updated;
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.contactPerson.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return updated;
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.contactPerson.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.contactPerson.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
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
        entity: 'ContactPerson',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private parseCreate(raw: unknown): CreateContactPersonInput {
    const r = CreateContactPersonSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateContactPersonInput {
    const r = UpdateContactPersonSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
