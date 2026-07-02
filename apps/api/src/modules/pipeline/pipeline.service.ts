import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type CreatePipelineInput,
  CreatePipelineSchema,
  PipelineFilterSchema,
  type StageInput,
  type UpdatePipelineInput,
  UpdatePipelineSchema,
} from './pipeline.schema.js';

const DEFAULT_STAGES: StageInput[] = [
  { name: 'Yangi', type: 'open', probability: 10, color: '#94A3B8' },
  { name: 'Aloqa', type: 'open', probability: 30, color: '#3B82F6' },
  { name: 'Taklif', type: 'open', probability: 60, color: '#F59E0B' },
  { name: 'Muzokara', type: 'open', probability: 80, color: '#8B5CF6' },
  { name: 'Yutuq', type: 'won', probability: 100, color: '#10B981' },
  { name: "Yo'qotish", type: 'lost', probability: 0, color: '#EF4444' },
];

@Injectable()
export class PipelineService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PipelineFilterSchema.parse(rawFilter);
    const where: Prisma.PipelineWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : { archived: false }),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.client.pipeline.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { [filter.sortBy]: filter.sortDir }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count: { select: { opportunities: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.pipeline.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.pipeline.findFirst({
      where: { id, accountId },
      include: {
        stages: { orderBy: { position: 'asc' } },
        _count: { select: { opportunities: true } },
      },
    });
    if (!row) throw new NotFoundException(`Pipeline ${id} not found`);
    return row;
  }

  /**
   * Returns the default pipeline for the account, creating one with the
   * canonical 6-stage layout if none exists. Used by Opportunity create
   * to give a sensible starting point on first use.
   */
  async getOrCreateDefault(accountId: string) {
    const existing = await this.prisma.client.pipeline.findFirst({
      where: { accountId, isDefault: true, archived: false },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    if (existing) return existing;

    const created = await this.prisma.client.$transaction(async (tx) => {
      const pipeline = await tx.pipeline.create({
        data: {
          accountId,
          name: 'Asosiy voronka',
          isDefault: true,
          stages: {
            create: DEFAULT_STAGES.map((s, idx) => ({
              accountId,
              name: s.name,
              type: s.type,
              probability: s.probability,
              color: s.color ?? null,
              position: idx,
            })),
          },
        },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
      return pipeline;
    });
    return created;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);

    return this.prisma.client.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.pipeline.updateMany({
          where: { accountId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.pipeline.create({
        data: {
          accountId,
          name: parsed.name,
          isDefault: parsed.isDefault,
          stages: {
            create: parsed.stages.map((s, idx) => ({
              accountId,
              name: s.name,
              type: s.type,
              probability: s.probability,
              color: s.color ?? null,
              position: idx,
            })),
          },
        },
        include: { stages: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    await this.findById(accountId, id);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        if (parsed.isDefault === true) {
          await tx.pipeline.updateMany({
            where: { accountId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }

        // Optimistic lock: ALWAYS bump the version. The version filter 409s on a
        // stale save and aborts the tx, rolling back the demote-default above and
        // the stages rewrite below. findById above proves the row exists.
        const data: Prisma.PipelineUpdateInput = { version: { increment: 1 } };
        if (parsed.name !== undefined) data.name = parsed.name;
        if (parsed.isDefault !== undefined) data.isDefault = parsed.isDefault;
        await tx.pipeline.update({ where: { id, accountId, version: parsed.version }, data });

        if (parsed.stages !== undefined) {
          // Replace stages: keep existing matched by id, delete missing,
          // create new. Reject deletion if a stage still has opportunities.
          const existing = await tx.pipelineStage.findMany({
            where: { pipelineId: id, accountId },
            select: { id: true },
          });
          const incomingIds = new Set(parsed.stages.filter((s) => s.id).map((s) => s.id as string));
          const toDelete = existing.filter((e) => !incomingIds.has(e.id)).map((e) => e.id);

          if (toDelete.length > 0) {
            const blocking = await tx.opportunity.count({
              where: { accountId, stageId: { in: toDelete } },
            });
            if (blocking > 0) {
              throw new BadRequestException(
                "O'chiriladigan bosqichlarda hali ochiq bitimlar bor — avval ularni ko'chiring",
              );
            }
            await tx.pipelineStage.deleteMany({
              where: { id: { in: toDelete }, accountId },
            });
          }

          for (let idx = 0; idx < parsed.stages.length; idx++) {
            const s = parsed.stages[idx];
            if (!s) continue;
            if (s.id) {
              await tx.pipelineStage.update({
                where: { id: s.id, accountId },
                data: {
                  name: s.name,
                  type: s.type,
                  probability: s.probability,
                  color: s.color ?? null,
                  position: idx,
                },
              });
            } else {
              await tx.pipelineStage.create({
                data: {
                  accountId,
                  pipelineId: id,
                  name: s.name,
                  type: s.type,
                  probability: s.probability,
                  color: s.color ?? null,
                  position: idx,
                },
              });
            }
          }
        }

        return tx.pipeline.findFirstOrThrow({
          where: { id, accountId },
          include: { stages: { orderBy: { position: 'asc' } } },
        });
      });
    } catch (e) {
      mapVersionedUpdateError(e, 'Pipeline');
      throw e;
    }
  }

  async archive(accountId: string, id: string) {
    const pipe = await this.findById(accountId, id);
    if (pipe.isDefault) {
      throw new BadRequestException('Standart voronkani arxivlash mumkin emas');
    }
    return this.prisma.client.pipeline.update({
      where: { id, accountId },
      data: { archived: true },
    });
  }

  async restore(accountId: string, id: string) {
    await this.findById(accountId, id);
    return this.prisma.client.pipeline.update({
      where: { id, accountId },
      data: { archived: false },
    });
  }

  async delete(accountId: string, id: string) {
    const pipe = await this.findById(accountId, id);
    if (pipe.isDefault) {
      throw new BadRequestException("Standart voronkani o'chirish mumkin emas");
    }
    const usage = await this.prisma.client.opportunity.count({
      where: { accountId, pipelineId: id },
    });
    if (usage > 0) {
      throw new BadRequestException(
        `Voronkada ${usage} ta bitim bor — avval ularni ko'chiring yoki o'chiring`,
      );
    }
    await this.prisma.client.pipeline.delete({ where: { id, accountId } });
    return { ok: true };
  }

  private parseCreate(raw: unknown): CreatePipelineInput {
    const r = CreatePipelineSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePipelineInput {
    const r = UpdatePipelineSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
