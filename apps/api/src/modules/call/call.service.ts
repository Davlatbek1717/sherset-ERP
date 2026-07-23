import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CallFilterSchema,
  type CreateCallInput,
  CreateCallSchema,
  type UpdateCallInput,
  UpdateCallSchema,
} from './call.schema.js';

@Injectable()
export class CallService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = CallFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    const rows = await this.prisma.client.call.findMany({
      where,
      orderBy: this.buildOrderBy(filter.sortBy, filter.sortDir),
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        counterparty: { select: { id: true, name: true, legalTitle: true } },
        contactPerson: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.call.count({ where });
    return { items, nextCursor, total };
  }

  /** Compose Prisma where-clause from a validated filter. Always anchors
   *  on accountId (tenant guard). Period→startedAt range; updated period
   *  →updatedAt range; archived defaults to false unless explicit. */
  private buildListWhere(
    accountId: string,
    filter: import('./call.schema.js').CallFilterInput,
  ): Prisma.CallWhereInput {
    return {
      accountId,
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.counterpartyIds ? { counterpartyId: { in: filter.counterpartyIds } } : {}),
      ...(filter.contactPersonId ? { contactPersonId: filter.contactPersonId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.direction ? { direction: filter.direction } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.dateFrom || filter.dateTo
        ? {
            startedAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: {
              ...(filter.updatedFrom ? { gte: filter.updatedFrom } : {}),
              ...(filter.updatedTo ? { lte: filter.updatedTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { summary: { contains: filter.search, mode: 'insensitive' } },
              { externalNumber: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Translate sortBy into Prisma orderBy — `agent` is a relational sort
   *  (counterparty.name) so it needs the special-case shape. */
  private buildOrderBy(
    sortBy: import('./call.schema.js').CallFilterInput['sortBy'],
    sortDir: 'asc' | 'desc',
  ): Prisma.CallOrderByWithRelationInput {
    if (sortBy === 'agent') return { counterparty: { name: sortDir } };
    return { [sortBy]: sortDir } as Prisma.CallOrderByWithRelationInput;
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.call.findFirst({
      where: { id, accountId },
      include: {
        counterparty: { select: { id: true, name: true, legalTitle: true, companyType: true } },
        contactPerson: {
          select: { id: true, name: true, position: true, phone: true, email: true },
        },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`Call ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    if (parsed.counterpartyId) {
      const cp = await this.prisma.client.counterparty.findFirst({
        where: { id: parsed.counterpartyId, accountId },
        select: { id: true },
      });
      if (!cp) throw new BadRequestException('Kontragent topilmadi');
    }

    if (parsed.contactPersonId) {
      const person = await this.prisma.client.contactPerson.findFirst({
        where: { id: parsed.contactPersonId, accountId },
        select: { id: true, counterpartyId: true },
      });
      if (!person) throw new BadRequestException('Aloqa shaxsi topilmadi');
      if (parsed.counterpartyId && person.counterpartyId !== parsed.counterpartyId) {
        throw new BadRequestException('Aloqa shaxsi tanlangan kontragentga tegishli emas');
      }
    }

    return this.prisma.client.call.create({
      data: {
        accountId,
        ownerId: userId,
        counterpartyId: parsed.counterpartyId ?? null,
        contactPersonId: parsed.contactPersonId ?? null,
        direction: parsed.direction,
        channel: parsed.channel,
        status: parsed.status,
        startedAt: parsed.startedAt,
        durationSec: parsed.durationSec ?? null,
        externalNumber: parsed.externalNumber ?? null,
        summary: parsed.summary ?? null,
      },
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    const data: Prisma.CallUpdateInput = {};
    if (parsed.direction !== undefined) data.direction = parsed.direction;
    if (parsed.channel !== undefined) data.channel = parsed.channel;
    if (parsed.status !== undefined) data.status = parsed.status;
    if (parsed.startedAt !== undefined) data.startedAt = parsed.startedAt;
    if (parsed.durationSec !== undefined) data.durationSec = parsed.durationSec;
    if (parsed.externalNumber !== undefined) data.externalNumber = parsed.externalNumber;
    if (parsed.summary !== undefined) data.summary = parsed.summary;

    if (parsed.counterpartyId !== undefined) {
      if (parsed.counterpartyId === null) {
        data.counterparty = { disconnect: true };
      } else {
        const cp = await this.prisma.client.counterparty.findFirst({
          where: { id: parsed.counterpartyId, accountId },
          select: { id: true },
        });
        if (!cp) throw new BadRequestException('Kontragent topilmadi');
        data.counterparty = { connect: { id: parsed.counterpartyId } };
      }
    }

    if (parsed.contactPersonId !== undefined) {
      if (parsed.contactPersonId === null) {
        data.contactPerson = { disconnect: true };
      } else {
        const person = await this.prisma.client.contactPerson.findFirst({
          where: { id: parsed.contactPersonId, accountId },
          select: { id: true },
        });
        if (!person) throw new BadRequestException('Aloqa shaxsi topilmadi');
        data.contactPerson = { connect: { id: parsed.contactPersonId } };
      }
    }

    return this.prisma.client.call.update({
      where: { id, accountId },
      data,
    });
  }

  async archive(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.call.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.call.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.call.delete({ where: { id, accountId } });
    return { ok: true };
  }

  private parseCreate(raw: unknown): CreateCallInput {
    const r = CreateCallSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCallInput {
    const r = UpdateCallSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
