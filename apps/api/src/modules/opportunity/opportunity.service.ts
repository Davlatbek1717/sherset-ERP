import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreateOpportunityInput,
  CreateOpportunitySchema,
  OpportunityFilterSchema,
  type TransitionInput,
  TransitionSchema,
  type UpdateOpportunityInput,
  UpdateOpportunitySchema,
} from './opportunity.schema.js';

type PrismaTx = Prisma.TransactionClient;

function serialize<T extends { amount: bigint }>(row: T): Omit<T, 'amount'> & { amount: string } {
  return { ...row, amount: row.amount.toString() };
}

@Injectable()
export class OpportunityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PipelineService) private readonly pipelines: PipelineService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = OpportunityFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    const rows = await this.prisma.client.opportunity.findMany({
      where,
      orderBy: this.buildOrderBy(filter.sortBy, filter.sortDir),
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        stage: { select: { id: true, name: true, type: true, color: true, position: true } },
        pipeline: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true, legalTitle: true } },
        contactPerson: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.opportunity.count({ where });
    return { items: items.map(serialize), nextCursor, total };
  }

  /** Compose Prisma where-clause from a validated filter. Always anchors
   *  on accountId (tenant guard). Period→createdAt range; updated period
   *  →updatedAt range; archived defaults to false unless explicit. */
  private buildListWhere(
    accountId: string,
    filter: import('./opportunity.schema.js').OpportunityFilterInput,
  ): Prisma.OpportunityWhereInput {
    return {
      accountId,
      ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
      ...(filter.stageId ? { stageId: filter.stageId } : {}),
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.counterpartyIds ? { counterpartyId: { in: filter.counterpartyIds } } : {}),
      ...(filter.contactPersonId ? { contactPersonId: filter.contactPersonId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
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
              { name: { contains: filter.search, mode: 'insensitive' } },
              { number: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  /** Translate sortBy into Prisma orderBy — `agent` is a relational sort
   *  (counterparty.name) so it needs the special-case shape. */
  private buildOrderBy(
    sortBy: import('./opportunity.schema.js').OpportunityFilterInput['sortBy'],
    sortDir: 'asc' | 'desc',
  ): Prisma.OpportunityOrderByWithRelationInput {
    if (sortBy === 'agent') return { counterparty: { name: sortDir } };
    return { [sortBy]: sortDir } as Prisma.OpportunityOrderByWithRelationInput;
  }

  /**
   * Returns opportunities grouped by stage for the Kanban board, plus
   * stage metadata. Skips archived. Defaults to the account's default
   * pipeline if pipelineId is not provided.
   */
  async board(accountId: string, pipelineId: string | undefined) {
    const pipeline = pipelineId
      ? await this.pipelines.findById(accountId, pipelineId)
      : await this.pipelines.getOrCreateDefault(accountId);

    const stages = pipeline.stages;
    const allRows = await this.prisma.client.opportunity.findMany({
      where: { accountId, pipelineId: pipeline.id, archived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        counterparty: { select: { id: true, name: true } },
        contactPerson: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    const byStage = new Map<string, ReturnType<typeof serialize>[]>();
    for (const s of stages) byStage.set(s.id, []);
    for (const row of allRows) {
      const arr = byStage.get(row.stageId);
      if (arr) arr.push(serialize(row));
    }

    return {
      pipeline: { id: pipeline.id, name: pipeline.name, isDefault: pipeline.isDefault },
      stages: stages.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        color: s.color,
        probability: s.probability,
        position: s.position,
        opportunities: byStage.get(s.id) ?? [],
      })),
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.opportunity.findFirst({
      where: { id, accountId },
      include: {
        stage: { select: { id: true, name: true, type: true, color: true, probability: true } },
        pipeline: {
          select: {
            id: true,
            name: true,
            stages: {
              select: { id: true, name: true, type: true, color: true, position: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        counterparty: { select: { id: true, name: true, legalTitle: true, companyType: true } },
        contactPerson: {
          select: { id: true, name: true, position: true, phone: true, email: true },
        },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException(`Opportunity ${id} not found`);
    return serialize(row);
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    // Resolve pipeline: explicit, or get-or-create default.
    let pipelineId = parsed.pipelineId;
    let stageId = parsed.stageId;
    if (!pipelineId) {
      const def = await this.pipelines.getOrCreateDefault(accountId);
      pipelineId = def.id;
      if (!stageId) {
        const first = def.stages.find((s) => s.type === 'open') ?? def.stages[0];
        if (!first) throw new BadRequestException("Voronkada bosqichlar yo'q");
        stageId = first.id;
      }
    }
    if (!stageId) {
      const pipe = await this.pipelines.findById(accountId, pipelineId);
      const first = pipe.stages.find((s) => s.type === 'open') ?? pipe.stages[0];
      if (!first) throw new BadRequestException("Voronkada bosqichlar yo'q");
      stageId = first.id;
    }

    const stage = await this.prisma.client.pipelineStage.findFirst({
      where: { id: stageId, accountId, pipelineId },
      select: { id: true, type: true },
    });
    if (!stage) {
      throw new BadRequestException('Bosqich tanlangan voronkaga tegishli emas');
    }

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

    const created = await this.prisma.client.$transaction(async (tx) => {
      const number = await this.nextNumber(tx, accountId);
      const status = stage.type;
      const closedAt = stage.type === 'open' ? null : new Date();
      return tx.opportunity.create({
        data: {
          accountId,
          ownerId: userId,
          number,
          name: parsed.name,
          pipelineId: pipelineId!,
          stageId: stageId!,
          counterpartyId: parsed.counterpartyId ?? null,
          contactPersonId: parsed.contactPersonId ?? null,
          amount: parsed.amount ?? 0n,
          currency: parsed.currency,
          probability: parsed.probability ?? null,
          expectedCloseDate: parsed.expectedCloseDate ?? null,
          source: parsed.source ?? null,
          description: parsed.description ?? null,
          status,
          closedAt,
        },
      });
    });
    await this.logAudit(accountId, userId, 'create', created.id, null);
    return serialize(created);
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    const data: Prisma.OpportunityUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.amount !== undefined) data.amount = parsed.amount;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.probability !== undefined) data.probability = parsed.probability;
    if (parsed.expectedCloseDate !== undefined) data.expectedCloseDate = parsed.expectedCloseDate;
    if (parsed.source !== undefined) data.source = parsed.source;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.lostReason !== undefined) data.lostReason = parsed.lostReason;

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

    let updated: Awaited<ReturnType<typeof this.prisma.client.opportunity.update>>;
    try {
      updated = await this.prisma.client.opportunity.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Opportunity');
      throw e;
    }
    const changes = this.diff(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    );
    if (Object.keys(changes).length) {
      await this.logAudit(accountId, userId, 'update', id, changes);
    }
    return serialize(updated);
  }

  /**
   * Atomic stage transition. Validates the new stage belongs to the same
   * pipeline, mirrors stage.type into status, and toggles closedAt
   * depending on whether the new stage is terminal.
   */
  async transition(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseTransition(raw);

    const { updated, ownerId, stageType, oppName } = await this.prisma.client.$transaction(
      async (tx) => {
        const opp = await tx.opportunity.findFirst({
          where: { id, accountId },
          select: {
            id: true,
            pipelineId: true,
            stageId: true,
            closedAt: true,
            ownerId: true,
            name: true,
          },
        });
        if (!opp) throw new NotFoundException(`Opportunity ${id} not found`);

        const stage = await tx.pipelineStage.findFirst({
          where: { id: parsed.stageId, accountId, pipelineId: opp.pipelineId },
          select: { id: true, type: true },
        });
        if (!stage) {
          throw new BadRequestException('Bosqich shu voronkaga tegishli emas');
        }

        const data: Prisma.OpportunityUpdateInput = {
          stage: { connect: { id: stage.id } },
          status: stage.type,
        };
        if (stage.type === 'open') {
          data.closedAt = null;
          // Clear lostReason when re-opening
          data.lostReason = null;
        } else {
          if (!opp.closedAt) data.closedAt = new Date();
          if (stage.type === 'lost' && parsed.lostReason !== undefined) {
            data.lostReason = parsed.lostReason;
          }
        }

        const updated = await tx.opportunity.update({
          where: { id, accountId },
          data,
        });
        return { updated, ownerId: opp.ownerId, stageType: stage.type, oppName: opp.name };
      },
    );

    // Emit notification non-blocking — must never break the transition result
    if (ownerId && (stageType === 'won' || stageType === 'lost')) {
      const kind =
        stageType === 'won' ? ('opportunity_won' as const) : ('opportunity_lost' as const);
      this.notifications
        .emit(accountId, ownerId, kind, oppName, null, 'Opportunity', id)
        .catch(() => {});
    }

    await this.logAudit(accountId, userId, 'transition', id, { stage: parsed.stageId });
    return serialize(updated);
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const row = await this.prisma.client.opportunity.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'archived', id, null);
    return serialize(row);
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    const row = await this.prisma.client.opportunity.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restored', id, null);
    return serialize(row);
  }

  async delete(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.opportunity.delete({ where: { id, accountId } });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  /** Auto-number: СД-YYYY-NNNNN — per-account sequence by year. */
  private async nextNumber(tx: PrismaTx, accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `СД-${year}-`;
    const n = await allocateDocumentNumber(tx, accountId, prefix, async () => {
      const last = await tx.opportunity.findFirst({
        where: { accountId, number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      return last ? Number.parseInt(last.number.slice(prefix.length), 10) || 0 : 0;
    });
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  private parseCreate(raw: unknown): CreateOpportunityInput {
    const r = CreateOpportunitySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateOpportunityInput {
    const r = UpdateOpportunitySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseTransition(raw: unknown): TransitionInput {
    const r = TransitionSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
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
        entity: 'Opportunity',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
