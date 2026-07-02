import type { Prisma } from '@moysklad/db';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreateProcessingProcessSchema,
  ProcessingProcessFilterSchema,
  type ProcessingStageInput,
  SetProcessingStagesSchema,
  UpdateProcessingProcessSchema,
} from './processing-process.schema.js';

/**
 * ProcessingProcessService — full CRUD for ProcessingProcess
 * (Техпроцесс). §126/round-6: full moysklad parity — a process owns
 * 1–100 POSITIONS, each referencing a STANDALONE ProcessingStage,
 * with a `nextPositions` multi-successor branching DAG.
 *
 * Each position input either references an existing standalone Этап
 * (`processingStageId` — the moysklad-faithful path) or defines a new
 * one inline (the new stage persists in the Этап catalog). Successor
 * links come from `nextPositionIndexes`; empty ⇒ a linear chain.
 *
 * Money-engine guard: stages are standalone catalog rows — replacing
 * a process's positions NEVER deletes a ProcessingStage (the §85-93 /
 * §117 cost cascade still reads stage.materialMarkup /
 * laborCostMinor untouched; FK is Restrict). Removing a position just
 * detaches it; the Этап lives on in the catalog (moysklad behaviour).
 */

interface ProcessRow {
  id: string;
  name: string;
  code: string | null;
  externalCode: string | null;
  description: string | null;
  shared: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { positions: number };
}

interface StageRow {
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
}

interface PositionRow {
  id: string;
  position: number;
  processingStageId: string;
  processingStage: StageRow;
  nextEdges: Array<{ toPositionId: string }>;
}

const PROC_DETAIL_INCLUDE = {
  positions: {
    orderBy: { position: 'asc' as const },
    include: {
      processingStage: true,
      nextEdges: { select: { toPositionId: true } },
    },
  },
  _count: { select: { positions: true } },
};

@Injectable()
export class ProcessingProcessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // =========================================================================
  // List
  // =========================================================================

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProcessingProcessFilterSchema.parse(rawFilter);
    const where: Prisma.ProcessingProcessWhereInput = {
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

    const rows = await this.prisma.client.processingProcess.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { _count: { select: { positions: true } } },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.processingProcess.count({ where });

    return { items: items.map((r) => this.serialize(r)), nextCursor, total };
  }

  // =========================================================================
  // Find by id
  // =========================================================================

  async findById(accountId: string, id: string) {
    const proc = await this.prisma.client.processingProcess.findFirst({
      where: { id, accountId },
      include: PROC_DETAIL_INCLUDE,
    });
    if (!proc) throw new NotFoundException(`Техпроцесс ${id} topilmadi`);
    return this.serializeDetail(proc);
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = CreateProcessingProcessSchema.parse(raw);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const proc = await tx.processingProcess.create({
          data: {
            accountId,
            groupId: creatorGroupId,
            name: parsed.name,
            code: parsed.code ?? null,
            externalCode: parsed.externalCode ?? null,
            description: parsed.description ?? null,
            shared: parsed.shared,
          },
        });
        await this.createPositions(tx, accountId, proc.id, parsed.stages);
        return proc.id;
      });
      await this.logAudit(accountId, userId, 'create', created);
      return this.findById(accountId, created);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Update
  // =========================================================================

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = UpdateProcessingProcessSchema.parse(raw);
    await this.findById(accountId, id);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const data: Prisma.ProcessingProcessUpdateInput = {};
        if (parsed.name !== undefined) data.name = parsed.name;
        if (parsed.code !== undefined) data.code = parsed.code ?? null;
        if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode ?? null;
        if (parsed.description !== undefined) data.description = parsed.description ?? null;
        if (parsed.shared !== undefined) data.shared = parsed.shared;
        // Optimistic-lock: the header update is UNCONDITIONAL + versioned so the
        // lock ALWAYS runs (even a header-only stage rewrite bumps the version,
        // and even when `data` carries only the version increment). A stale
        // version matches zero rows → P2025 → the whole $transaction rolls back,
        // including the replacePositions() edge+position rewrite below, so a lost
        // race never destroys the positions.
        await tx.processingProcess.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (parsed.stages !== undefined) {
          await this.replacePositions(tx, accountId, id, parsed.stages);
        }
      });
      await this.logAudit(accountId, userId, 'update', id);
      return this.findById(accountId, id);
    } catch (e) {
      mapVersionedUpdateError(e, 'ProcessingProcess');
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Archive / Restore
  // =========================================================================

  async archive(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.processingProcess.update({
      where: { id, accountId },
      data: { archived: true },
    });
    await this.logAudit(accountId, userId, 'delete', id);
    return { ok: true };
  }

  async restore(accountId: string, userId: string, id: string) {
    await this.findById(accountId, id);
    await this.prisma.client.processingProcess.update({
      where: { id, accountId },
      data: { archived: false },
    });
    await this.logAudit(accountId, userId, 'restore', id);
    return { ok: true };
  }

  // =========================================================================
  // Set positions (replace-all)
  // =========================================================================

  async setStages(accountId: string, userId: string, processId: string, raw: unknown) {
    const parsed = SetProcessingStagesSchema.parse(raw);
    await this.findById(accountId, processId);
    await this.prisma.client.$transaction((tx) =>
      this.replacePositions(tx, accountId, processId, parsed.stages),
    );
    await this.logAudit(accountId, userId, 'update', processId);
    const proc = await this.findById(accountId, processId);
    return { items: proc.positions };
  }

  // =========================================================================
  // Position helpers
  // =========================================================================

  /**
   * For each input position: reuse the referenced standalone Этап
   * (`processingStageId`, ownership-checked) or create a new one
   * inline (it persists in the Этап catalog). Then wire the
   * `nextPositions` DAG from each row's `nextPositionIndexes`
   * (0-based indexes into the input array); a row with no explicit
   * successors defaults to the next row (linear chain).
   */
  private async createPositions(
    tx: Prisma.TransactionClient,
    accountId: string,
    processId: string,
    stages: ProcessingStageInput[],
  ): Promise<void> {
    const positionIds: string[] = [];
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      if (!s) continue;
      let stageId: string;
      if (s.processingStageId) {
        const ref = await tx.processingStage.findFirst({
          where: { id: s.processingStageId, accountId },
          select: { id: true },
        });
        if (!ref) throw new NotFoundException(`Этап ${s.processingStageId} topilmadi`);
        stageId = ref.id;
      } else {
        // superRefine guarantees a non-empty `name` here.
        const stage = await tx.processingStage.create({
          data: {
            accountId,
            name: s.name as string,
            code: s.code ?? null,
            externalCode: s.externalCode ?? null,
            description: s.description ?? null,
            laborCostMinor: BigInt(s.laborCostMinor),
            materialMarkup: s.materialMarkup,
            allPerformers: s.allPerformers,
            shared: s.shared,
          },
        });
        stageId = stage.id;
      }
      const pos = await tx.processingProcessPosition.create({
        data: { accountId, processId, processingStageId: stageId, position: s.position ?? i },
      });
      positionIds.push(pos.id);
    }
    // nextPositions DAG: explicit per-row successor indexes, else a
    // linear chain pos[i] → pos[i+1]. Dedupe — the edge has a
    // @@unique([fromPositionId, toPositionId]).
    const edges: Array<{ accountId: string; fromPositionId: string; toPositionId: string }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < positionIds.length; i++) {
      const from = positionIds[i];
      if (!from) continue;
      const explicit = stages[i]?.nextPositionIndexes ?? [];
      const targetIdxs = explicit.length > 0 ? explicit : i + 1 < positionIds.length ? [i + 1] : [];
      for (const toIdx of targetIdxs) {
        const to = positionIds[toIdx];
        if (!to || to === from) continue;
        const key = `${from}>${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ accountId, fromPositionId: from, toPositionId: to });
      }
    }
    if (edges.length > 0) {
      await tx.processingProcessPositionEdge.createMany({ data: edges });
    }
  }

  /**
   * Replace a process's positions. Money-engine-safe by construction:
   * ProcessingStage is a standalone catalog entity, so this only
   * drops THIS process's edges + positions and recreates them — it
   * NEVER deletes a ProcessingStage. The §117 cost cascade (which
   * reads stage.materialMarkup / laborCostMinor) is untouched, and a
   * stage referenced by a Processing completion stays intact
   * (moysklad behaviour — the Этап lives on in the catalog).
   */
  private async replacePositions(
    tx: Prisma.TransactionClient,
    accountId: string,
    processId: string,
    stages: ProcessingStageInput[],
  ): Promise<void> {
    await tx.processingProcessPositionEdge.deleteMany({
      where: { accountId, fromPosition: { processId } },
    });
    await tx.processingProcessPosition.deleteMany({ where: { accountId, processId } });
    await this.createPositions(tx, accountId, processId, stages);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private serialize(r: ProcessRow) {
    return { ...r };
  }

  private serializeStage(s: StageRow) {
    return {
      ...s,
      laborCostMinor: s.laborCostMinor.toString(),
      standardHourCostMinor: s.standardHourCostMinor.toString(),
    };
  }

  private serializeDetail(r: ProcessRow & { positions: PositionRow[] }) {
    return {
      ...this.serialize(r),
      positions: r.positions.map((p) => ({
        id: p.id,
        position: p.position,
        processingStageId: p.processingStageId,
        processingStage: this.serializeStage(p.processingStage),
        nextPositionIds: p.nextEdges.map((e) => e.toPositionId),
      })),
      // Back-compat flat list for existing FE readers (each position's
      // stage, in order) — the §118 stage picker / processings still
      // read `stages`.
      stages: r.positions.map((p) => ({
        ...this.serializeStage(p.processingStage),
        positionId: p.id,
        position: p.position,
      })),
    };
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('Bu nomli Техпроцесс allaqachon mavjud');
    }
    if (err.code === 'P2025') throw new NotFoundException('Yozuv topilmadi');
    throw e;
  }

  /**
   * Write an audit-trail row for the detail page's «Tarix» / History tab.
   * Mirrors prepayment.service — non-transactional sites use the plain
   * client (logged AFTER the DB write/transaction succeeds, so a failed
   * write never logs). The `entity` string MUST equal the web page's
   * `auditEntity="processingprocess"` (production/processes/[id]/page.tsx),
   * or GET /audit-logs?entity=processingprocess returns nothing and the
   * History tab stays empty. This service wrote ZERO auditLog rows before.
   */
  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: { accountId, userId, entity: 'processingprocess', entityId, action },
    });
  }
}
