import type { Prisma } from '@moysklad/db';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreateProcessingStageSchema,
  ProcessingStageFilterSchema,
  UpdateProcessingStageSchema,
} from './processing-stage.schema.js';

/**
 * §126 — ProcessingStageService: full CRUD for the STANDALONE
 * moysklad `processingstage` (Этап производства) catalog. Mirrors
 * BomService (list/findById/create/update/archive/restore). A stage
 * referenced by a Processing completion (§117) or a ProcessingProcess
 * position is protected by FK Restrict — delete is archive-only here
 * anyway (no hard delete), so the §85-93 money-engine is untouched.
 */
@Injectable()
export class ProcessingStageService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProcessingStageFilterSchema.parse(rawFilter);
    const where: Prisma.ProcessingStageWhereInput = {
      accountId,
      ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { code: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.client.processingStage.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { _count: { select: { performers: true, positions: true } } },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.processingStage.count({ where });
    return { items: items.map((r) => this.serialize(r)), nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const stage = await this.prisma.client.processingStage.findFirst({
      where: { id, accountId },
      include: {
        performers: { select: { employeeId: true, employee: { select: { name: true } } } },
        materialStore: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    if (!stage) throw new NotFoundException(`Этап ${id} topilmadi`);
    return this.serializeDetail(stage);
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = CreateProcessingStageSchema.parse(raw);
    const { allPerformers, performers } = this.normalizePerformers(
      parsed.allPerformers,
      parsed.performers,
    );
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    try {
      const stage = await this.prisma.client.processingStage.create({
        data: {
          accountId,
          groupId: creatorGroupId,
          name: parsed.name,
          code: parsed.code ?? null,
          externalCode: parsed.externalCode ?? null,
          description: parsed.description ?? null,
          laborCostMinor: BigInt(parsed.laborCostMinor),
          materialMarkup: parsed.materialMarkup,
          allPerformers,
          distributionRequired: parsed.distributionRequired,
          standardHourCostMinor: BigInt(parsed.standardHourCostMinor),
          materialStoreId: parsed.materialStoreId ?? null,
          shared: parsed.shared,
          performers: { create: performers.map((employeeId) => ({ accountId, employeeId })) },
        },
        include: {
          performers: { select: { employeeId: true, employee: { select: { name: true } } } },
          materialStore: { select: { id: true, name: true } },
          _count: { select: { positions: true } },
        },
      });
      await this.logAudit(accountId, userId, 'create', stage.id);
      return this.serializeDetail(stage);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = UpdateProcessingStageSchema.parse(raw);
    await this.findById(accountId, id);
    const data: Prisma.ProcessingStageUpdateInput = {};
    if (parsed.name !== undefined) data.name = parsed.name;
    if (parsed.code !== undefined) data.code = parsed.code ?? null;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode ?? null;
    if (parsed.description !== undefined) data.description = parsed.description ?? null;
    if (parsed.laborCostMinor !== undefined) {
      data.laborCostMinor = BigInt(parsed.laborCostMinor);
    }
    if (parsed.materialMarkup !== undefined) data.materialMarkup = parsed.materialMarkup;
    if (parsed.distributionRequired !== undefined) {
      data.distributionRequired = parsed.distributionRequired;
    }
    if (parsed.standardHourCostMinor !== undefined) {
      data.standardHourCostMinor = BigInt(parsed.standardHourCostMinor);
    }
    if (parsed.materialStoreId !== undefined) {
      data.materialStore = parsed.materialStoreId
        ? { connect: { id: parsed.materialStoreId } }
        : { disconnect: true };
    }
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    try {
      await this.prisma.client.$transaction(async (tx) => {
        if (parsed.allPerformers !== undefined || parsed.performers !== undefined) {
          const norm = this.normalizePerformers(parsed.allPerformers, parsed.performers);
          data.allPerformers = norm.allPerformers;
          if (parsed.performers !== undefined) {
            await tx.processingStagePerformer.deleteMany({ where: { accountId, stageId: id } });
            if (norm.performers.length > 0) {
              await tx.processingStagePerformer.createMany({
                data: norm.performers.map((employeeId) => ({ accountId, stageId: id, employeeId })),
              });
            }
          }
        }
        // Optimistic-lock: the performers rewrite (deleteMany+createMany) above
        // and this version-guarded header update run in ONE transaction. If a
        // concurrent edit bumped the version since the form loaded, the version
        // filter misses → zero rows → P2025, and the performers rewrite rolls
        // back (so allocations are NOT destroyed by a stale save → 409).
        await tx.processingStage.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id);
      return this.findById(accountId, id);
    } catch (e) {
      mapVersionedUpdateError(e, 'ProcessingStage');
      this.handlePrisma(e);
    }
  }

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.processingStage.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'delete', id);
    return { ok: true };
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.processingStage.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restore', id);
    return { ok: true };
  }

  // ----- helpers --------------------------------------------------------

  /**
   * moysklad rule: passing only performers[] ⇒ allPerformers=false;
   * allPerformers=true ⇒ performers cleared.
   */
  private normalizePerformers(
    allPerformers: boolean | undefined,
    performers: string[] | undefined,
  ): { allPerformers: boolean; performers: string[] } {
    if (allPerformers === true) return { allPerformers: true, performers: [] };
    if (performers && performers.length > 0) {
      return { allPerformers: false, performers: [...new Set(performers)] };
    }
    return { allPerformers: allPerformers ?? true, performers: performers ?? [] };
  }

  private serialize(r: {
    id: string;
    name: string;
    code: string | null;
    externalCode: string | null;
    description: string | null;
    laborCostMinor: bigint;
    materialMarkup: number;
    allPerformers: boolean;
    distributionRequired: boolean;
    standardHourCostMinor: bigint;
    materialStoreId: string | null;
    shared: boolean;
    archived: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...r,
      laborCostMinor: r.laborCostMinor.toString(),
      standardHourCostMinor: r.standardHourCostMinor.toString(),
    };
  }

  private serializeDetail(
    r: Parameters<ProcessingStageService['serialize']>[0] & {
      performers: Array<{ employeeId: string; employee: { name: string } }>;
      materialStore?: { id: string; name: string } | null;
    },
  ) {
    return {
      ...this.serialize(r),
      materialStore: r.materialStore ?? null,
      // Detail load needs the human-readable employee name (not the raw
      // employeeId UUID) so the performer chips render names on reload.
      performers: r.performers.map((p) => ({ id: p.employeeId, name: p.employee.name })),
    };
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string };
    if (err.code === 'P2002') throw new ConflictException('Bu nomli Этап allaqachon mavjud');
    if (err.code === 'P2025') throw new NotFoundException('Yozuv topilmadi');
    throw e;
  }

  /**
   * Write an audit-trail row for the detail page's «Tarix» / History tab.
   * Mirrors prepayment.service — the non-transactional plain client is used
   * (the helper runs AFTER the DB write/transaction commits). The `entity`
   * string MUST equal the web page's `auditEntity="processingstage"`, or the
   * History tab stays vacuously empty.
   */
  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: { accountId, userId, entity: 'processingstage', entityId, action },
    });
  }
}
