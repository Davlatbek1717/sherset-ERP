import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  CreateProcessingOrderSchema,
  type ProcessingOrderFilter,
  ProcessingOrderFilterSchema,
  UpdateProcessingOrderSchema,
} from './processing-order.schema.js';

/**
 * ProcessingOrderService — planning-only header for production jobs.
 *
 * A ProcessingOrder says: "we intend to produce X units of product Y using
 * BOM/recipe Z". It is a PLANNING artefact — it does NOT touch stock balances.
 *
 * sumMinor is informational only — computed from BOM.standardCostMinor × qty
 * on create/update so the list/detail pages can show an estimated cost without
 * querying the BOM again.
 *
 * TODO(v2): When a Processing operation is posted and references this
 * ProcessingOrder, the actual material consumption (component decrement) and
 * output product (increment) will cascade there. The Processing operation
 * module will handle that stock cascade; this service stays planning-only.
 */
@Injectable()
export class ProcessingOrderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // =========================================================================
  // List
  // =========================================================================

  async list(accountId: string, raw: unknown) {
    const filter = ProcessingOrderFilterSchema.parse(raw);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization / store (the
    // list-view exposes these column headers as sortable). Mirrors
    // internal-order.service.ts / move.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'store'
          ? { store: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.processingOrder.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        processingPlan: {
          select: {
            id: true,
            name: true,
            productId: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.processingOrder.count({ where });

    return { items: items.map((r) => this.serialize(r)), nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror internal-order.service.ts
   * so the ProcessingOrder filter panel reaches moysklad «Заказы на
   * переработку» parity (~14 backed fields) without two-place drift.
   * Preserves the accountId tenant guard + deletedAt/includeDeleted
   * soft-delete handling.
   *
   * NOTE: ProcessingOrder is an internal production-planning doc — it has
   * NO agentId, agentAccountId, contractId, organizationAccountId, or
   * salesChannelId (no counterparty). DO NOT add those clauses.
   */
  private buildListWhere(
    accountId: string,
    filter: ProcessingOrderFilter,
  ): Prisma.ProcessingOrderWhereInput {
    const momentRange =
      filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {};
    const deliveryRange =
      filter.deliveryFrom || filter.deliveryTo
        ? {
            deliveryPlannedMoment: tashkentRangeBounds(filter.deliveryFrom, filter.deliveryTo),
          }
        : {};
    const updatedRange =
      filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {};
    const sumRange =
      filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {};

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.processingPlanId ? { processingPlanId: filter.processingPlanId } : {}),
      ...(filter.productionId ? { productionId: filter.productionId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...momentRange,
      ...deliveryRange,
      ...updatedRange,
      ...sumRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  // =========================================================================
  // Find by id — includes BOM components for the materials table
  // =========================================================================

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.processingOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        processingPlan: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
            components: {
              orderBy: { position: 'asc' },
              include: {
                product: { select: { id: true, name: true, code: true, uom: true } },
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`ProcessingOrder ${id} topilmadi`);
    return this.serialize(row);
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreateProcessingOrderSchema.parse(raw);

    // Auto-number: PO-YYYY-NNNNN per account per year
    const yearPrefix = `PO-${new Date().getFullYear()}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, yearPrefix, async () => {
      const last = await this.prisma.client.processingOrder.findFirst({
        where: { accountId, name: { startsWith: yearPrefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number(last.name.slice(yearPrefix.length)) || 0 : 0;
    });
    const name = `${yearPrefix}${String(n).padStart(5, '0')}`;

    // Convert user-supplied whole-unit quantity to ×1000 microqty BigInt
    const quantityMicro = BigInt(Math.round(Number(data.quantity) * 1_000));

    // Informational sumMinor: BOM.standardCostMinor × (quantity / 1000)
    // If no BOM is linked yet, sumMinor stays 0.
    let sumMinor = 0n;
    if (data.processingPlanId) {
      const bom = await this.prisma.client.billOfMaterials.findFirst({
        where: { id: data.processingPlanId, accountId },
        select: { standardCostMinor: true },
      });
      if (bom) {
        // standardCostMinor is per-BOM-run (= per outputQty units).
        // Here we interpret: sumMinor = standardCostMinor × (quantityMicro / 1000)
        // i.e. multiply by the whole-unit quantity ordered.
        sumMinor = (bom.standardCostMinor * quantityMicro) / 1_000n;
      }
    }

    const moment = data.moment ? new Date(data.moment) : new Date();
    const deliveryPlannedMoment = data.deliveryPlannedMoment
      ? new Date(data.deliveryPlannedMoment)
      : null;
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';
    const postedAt = applicable ? new Date() : null;

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    const created = await this.prisma.client.processingOrder.create({
      data: {
        accountId,
        ownerId,
        groupId: creatorGroupId,
        organizationId: data.organizationId,
        storeId: data.storeId,
        projectId: data.projectId ?? null,
        processingPlanId: data.processingPlanId ?? null,
        productionId: data.productionId ?? null,
        name,
        moment,
        deliveryPlannedMoment,
        applicable,
        state,
        postedAt,
        quantity: quantityMicro,
        sumMinor,
        description: data.description ?? null,
        externalCode: data.externalCode ?? null,
      },
    });

    await this.logAudit(accountId, ownerId, 'create', created.id, null);

    return this.serialize(created);
  }

  // =========================================================================
  // Update
  // =========================================================================

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdateProcessingOrderSchema.parse(raw);
    const row = await this.findById(accountId, id);

    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }

    // Recompute sumMinor if quantity or processingPlanId changes
    const newQuantityStr = data.quantity !== undefined ? String(data.quantity) : null;
    const newPlanId =
      data.processingPlanId !== undefined ? data.processingPlanId : row.processingPlanId;
    const currentQtyMicro = BigInt(row.quantity as string);
    const newQtyMicro = newQuantityStr
      ? BigInt(Math.round(Number(newQuantityStr) * 1_000))
      : currentQtyMicro;

    let newSumMinor: bigint | undefined;
    if (data.quantity !== undefined || data.processingPlanId !== undefined) {
      if (newPlanId) {
        const bom = await this.prisma.client.billOfMaterials.findFirst({
          where: { id: newPlanId, accountId },
          select: { standardCostMinor: true },
        });
        newSumMinor = bom ? (bom.standardCostMinor * newQtyMicro) / 1_000n : 0n;
      } else {
        newSumMinor = 0n;
      }
    }

    try {
      const updated = await this.prisma.client.processingOrder.update({
        where: { id, accountId, version: data.version },
        data: {
          ...(data.organizationId ? { organizationId: data.organizationId } : {}),
          ...(data.storeId ? { storeId: data.storeId } : {}),
          ...(data.projectId !== undefined ? { projectId: data.projectId ?? null } : {}),
          ...(data.processingPlanId !== undefined
            ? { processingPlanId: data.processingPlanId }
            : {}),
          ...(data.productionId !== undefined ? { productionId: data.productionId } : {}),
          ...(data.moment ? { moment: new Date(data.moment) } : {}),
          ...(data.deliveryPlannedMoment !== undefined
            ? {
                deliveryPlannedMoment: data.deliveryPlannedMoment
                  ? new Date(data.deliveryPlannedMoment)
                  : null,
              }
            : {}),
          ...(data.quantity !== undefined ? { quantity: newQtyMicro } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
          ...(newSumMinor !== undefined ? { sumMinor: newSumMinor } : {}),
          version: { increment: 1 },
        },
      });

      await this.logAudit(accountId, userId, 'update', id, null);

      return this.serialize(updated);
    } catch (e) {
      mapVersionedUpdateError(e, 'ProcessingOrder');
      throw e;
    }
  }

  // =========================================================================
  // Soft delete
  // =========================================================================

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        "Provedeno hujjatni o'chirish mumkin emas — avval unpost yoki cancel qiling",
      );
    }
    await this.prisma.client.processingOrder.update({
      where: { id },
      data: { deletedAt: new Date(), state: 'cancelled' },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; projectId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.processingOrder.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.processingOrder.update({
      where: { id, accountId },
      data: { printed },
    });
  }

  /** Print-friendly fetch — exposes columns dropped by serialize()
   *  (moment, description) so the bulk-print stub renderer can fill them. */
  async findRawForPrint(accountId: string, id: string) {
    const row = await this.prisma.client.processingOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { name: true, moment: true, sumMinor: true, description: true },
    });
    if (!row) throw new NotFoundException(`ProcessingOrder ${id} topilmadi`);
    return row;
  }

  // =========================================================================
  // Clone
  // =========================================================================

  async clone(accountId: string, ownerId: string, sourceId: string) {
    // Use a raw DB query so TypeScript knows the full shape (description, externalCode, etc.)
    const src = await this.prisma.client.processingOrder.findFirst({
      where: { id: sourceId, accountId, deletedAt: null },
    });
    if (!src) throw new NotFoundException(`ProcessingOrder ${sourceId} topilmadi`);

    // src.quantity is stored in microqty (×1000); convert back to whole units for create
    const quantityWhole = (Number(src.quantity) / 1_000).toString();

    return this.create(accountId, ownerId, {
      organizationId: src.organizationId,
      storeId: src.storeId,
      projectId: src.projectId ?? undefined,
      processingPlanId: src.processingPlanId ?? undefined,
      productionId: src.productionId ?? undefined,
      quantity: quantityWhole,
      description: src.description ?? undefined,
      externalCode: src.externalCode ?? undefined,
      applicable: false,
    });
  }

  // =========================================================================
  // FSM Transition
  // =========================================================================

  async transition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    const row = await this.findById(accountId, id);

    // TODO(v2): When a Processing operation is posted referencing this
    // ProcessingOrder, the real stock cascade (material consumption + output
    // product increment) will happen there. The Processing operation module
    // handles that; this FSM remains planning-only — no stock side effects.

    if (target === 'post') {
      if (row.applicable) throw new BadRequestException('Already posted');
      await this.prisma.client.processingOrder.update({
        where: { id },
        data: { applicable: true, state: 'posted', postedAt: new Date() },
      });
      await this.logAudit(accountId, userId, 'transition:posted', id, {
        from: { before: row.state, after: 'posted' },
      });
    } else if (target === 'unpost') {
      if (!row.applicable) throw new BadRequestException('Not posted');
      await this.prisma.client.processingOrder.update({
        where: { id },
        data: { applicable: false, state: 'draft', postedAt: null },
      });
      await this.logAudit(accountId, userId, 'transition:unposted', id, {
        from: { before: row.state, after: 'draft' },
      });
    } else if (target === 'cancel') {
      await this.prisma.client.processingOrder.update({
        where: { id },
        data: { applicable: false, state: 'cancelled' },
      });
      await this.logAudit(accountId, userId, 'transition:cancelled', id, {
        from: { before: row.state, after: 'cancelled' },
      });
    }

    return this.findById(accountId, id);
  }

  // =========================================================================
  // Serialize — BigInt fields to string for JSON safety
  // =========================================================================

  private serialize(r: {
    id: string;
    name: string;
    state: string;
    applicable: boolean;
    quantity: bigint;
    sumMinor: bigint;
    organizationId: string;
    storeId: string;
    processingPlanId: string | null;
    productionId: string | null;
    ownerId: string | null;
    [key: string]: unknown;
  }) {
    return {
      ...r,
      quantity: r.quantity.toString(),
      sumMinor: r.sumMinor.toString(),
    };
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * The tab fetches /audit-logs?entity=ProcessingOrder (exact-match the web
   * page's auditEntity="ProcessingOrder"), so this `entity` string MUST stay
   * in sync or the tab renders empty. Non-transactional: this FSM is
   * planning-only with no stock side effects (see the transition TODO note),
   * so the audit row needs no atomic delta.
   */
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
        entity: 'ProcessingOrder',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
