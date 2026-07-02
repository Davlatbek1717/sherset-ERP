import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateInventoryInput,
  CreateInventorySchema,
  type InventoryFilterInput,
  InventoryFilterSchema,
  InventoryTransitionSchema,
  type InventoryTransitionTarget,
  type UpdateInventoryInput,
  UpdateInventorySchema,
} from './inventory.schema.js';

/**
 * InventoryService — physical recount with variance handling.
 *
 * post() contract:
 *   1. For each position: snapshot expectedQty from current Stock row
 *   2. Compute varianceQty = actualQty - expectedQty (signed)
 *   3. Emit one StockOperation per position to ALIGN Stock to actualQty:
 *        - If variance > 0 (surplus): +qty with docType='inventory_surplus'
 *        - If variance < 0 (shortage): -qty with docType='inventory_shortage'
 *        - If variance = 0: skip
 *   4. Persist expectedQty + varianceQty on InventoryPosition for audit
 *   5. Audit 'inventory.posted' with total surplus/shortage counts
 *
 * Unlike other docs, Inventory does NOT have 'unpost' — once reconciled,
 * the physical count is the truth. To revert, cancel (which emits opposite
 * deltas).
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = InventoryFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization / store (the
    // list-view exposes these column headers as sortable). Mirror
    // move.service.ts / supply.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'store'
          ? { store: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.inventory.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.inventory.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror move.service.ts so the
   * Inventory filter panel reaches moysklad «Инвентаризации» parity
   * (~10 backed fields) without two-place drift. Preserves the accountId
   * tenant guard + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: Inventory is an internal warehouse doc — it has NO agentId,
   * agentAccountId, contractId, organizationAccountId, or salesChannelId
   * (no counterparty). DO NOT add those clauses. `sumMinor` IS exposed
   * (schema.prisma:5913 — "Sum of (counted_qty × cost) — populated when
   * the recount is finalised").
   */
  private buildListWhere(
    accountId: string,
    filter: InventoryFilterInput,
  ): Prisma.InventoryWhereInput {
    const momentRange =
      filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
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
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...momentRange,
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

  async findById(accountId: string, id: string) {
    const inv = await this.prisma.client.inventory.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        store: true,
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        positions: {
          include: { product: { select: { id: true, name: true, code: true, uom: true } } },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!inv) throw new NotFoundException(`Inventory ${id} not found`);
    return inv;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.organizationId, parsed.storeId);

    const name = await this.nextName(accountId);
    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'Inventory',
      parsed.attributes,
    );
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    try {
      const created = await this.prisma.client.inventory.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          projectId: parsed.projectId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          description: parsed.description,
          attributes: attributes as Prisma.InputJsonValue,
          state: 'draft',
          positions: {
            create: parsed.positions.map((p, idx) => ({
              accountId,
              position: idx + 1,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              productId: p.assortmentKind === 'product' ? p.assortmentId : null,
              expectedQty: '0',
              actualQty: p.actualQty,
              varianceQty: '0',
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'inventory', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    if (existing.applicable) {
      throw new BadRequestException("Provedeno inventory'ni o'zgartirib bo'lmaydi");
    }
    const data: Prisma.InventoryUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Inventory',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so a
      // version conflict (409) rolls back the delete instead of leaving the
      // count-lines destroyed (Class A — data corruption guard).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          expectedQty: '0',
          actualQty: p.actualQty,
          varianceQty: '0',
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded header
      // update run in ONE transaction. If the optimistic-lock version filter
      // misses (concurrent edit), the update touches zero rows → P2025 → the
      // deleteMany rolls back, so the count-lines are NOT lost. There is no
      // two-step totals write here — exactly ONE versioned update.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.inventoryPosition.deleteMany({ where: { inventoryId: id, accountId } });
        }
        return tx.inventory.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'inventory', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Inventory');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = InventoryTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | cancel`,
      );
    }
    const target: InventoryTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);
    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'inventory', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    const inv = await this.findById(accountId, id);
    if (inv.applicable || inv.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagini o'chirish mumkin");
    }
    await this.prisma.client.inventory.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'inventory', 'DELETE', id);
    return { ok: true };
  }

  /**
   * Mirrors moysklad's "Скопировать". For Inventory we duplicate just the
   * product list (positions); the new draft will compute fresh expectedQty
   * from current stock when posted, and actualQty starts at 0 for re-counting.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.inventory.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Inventarizatsiya topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.inventory.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        organizationId: source.organizationId,
        storeId: source.storeId,
        projectId: source.projectId,
        externalCode: source.externalCode,
        moment: new Date(),
        description: source.description,
        // §61: moysklad «Скопировать» preserves custom-field values
        // (доп. поля) — clone() dropped them (cash/payment clone
        // already preserve them; §39 lossless-clone precedent).
        attributes: (source.attributes ?? {}) as Prisma.InputJsonValue,
        state: 'draft',
        applicable: false,
        positions: {
          create: source.positions.map((p) => ({
            accountId,
            position: p.position,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            productId: p.productId,
            expectedQty: p.expectedQty,
            actualQty: 0,
            varianceQty: p.expectedQty.negated(),
            costMinor: p.costMinor,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'inventory', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InventoryService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted (current: ${existing.state})`);
    }
    if (existing.positions.length === 0) throw new BadRequestException("Pozitsiyalar yo'q");

    return this.prisma.client.$transaction(
      async (tx) => {
        const deltas: StockDelta[] = [];
        let surplusCount = 0;
        let shortageCount = 0;

        for (const p of existing.positions) {
          // Snapshot expected qty from current Stock row
          const stockRow = await tx.stock.findFirst({
            where: {
              accountId,
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
            },
            select: { qty: true },
          });
          const expectedQty = stockRow?.qty?.toString() ?? '0';
          const actualQty = String(p.actualQty);
          const expectedNum = Number(expectedQty);
          const actualNum = Number(actualQty);
          const varianceNum = actualNum - expectedNum;
          const varianceStr = String(varianceNum);

          // Persist snapshot + variance on position
          await tx.inventoryPosition.update({
            where: { id: p.id },
            data: {
              expectedQty,
              varianceQty: varianceStr,
            },
          });

          // Only emit a delta if there's variance
          if (varianceNum > 0) {
            surplusCount++;
            deltas.push({
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              qtyDelta: String(varianceNum),
              costDeltaMinor: null, // cost basis unchanged for surplus (unknown source)
              docType: 'inventory_surplus',
              docId: id,
              docPositionId: p.id,
              reason: 'post',
            });
          } else if (varianceNum < 0) {
            shortageCount++;
            deltas.push({
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              qtyDelta: String(varianceNum), // already negative
              costDeltaMinor: null,
              docType: 'inventory_shortage',
              docId: id,
              docPositionId: p.id,
              reason: 'post',
            });
          }
        }

        if (deltas.length > 0) {
          await this.stock.applyDeltas(tx, accountId, userId, deltas);
        }

        const updated = await tx.inventory.update({
          where: { id, accountId },
          data: { state: 'posted', applicable: true, postedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Inventory',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
              surplusPositions: surplusCount,
              shortagePositions: shortageCount,
            } as Prisma.InputJsonValue,
          },
        });
        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InventoryService['findById']>>,
  ) {
    if (existing.state === 'cancelled') throw new BadRequestException('Oldin cancel qilingan');
    return this.prisma.client.$transaction(async (tx) => {
      const wasApplicable = existing.applicable;
      if (wasApplicable) {
        // Reverse the variance deltas we applied on post
        const deltas: StockDelta[] = [];
        for (const p of existing.positions) {
          const varianceNum = Number(String(p.varianceQty));
          if (varianceNum === 0) continue;
          deltas.push({
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(-varianceNum), // reverse sign
            costDeltaMinor: null,
            docType: 'inventory_cancel',
            docId: id,
            docPositionId: p.id,
            reason: 'cancel',
          });
        }
        if (deltas.length > 0) {
          await this.stock.applyDeltas(tx, accountId, userId, deltas);
        }
      }
      const updated = await tx.inventory.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'Inventory',
          entityId: id,
          action: 'transition:cancelled',
          fieldChanges: {
            from: { before: existing.state, after: 'cancelled' },
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  // =====================================================================
  private parseCreate(raw: unknown): CreateInventoryInput {
    const r = CreateInventorySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdateInventoryInput {
    const r = UpdateInventorySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const [org, store] = await Promise.all([
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: storeId, accountId } }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'inventory', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
      const rows = await this.prisma.client.inventory.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        const m = r.name.match(/\d+$/);
        if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
      }
      return max;
    });
    return String(n).padStart(5, '0');
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
        entity: 'Inventory',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(
        `Bu qiymat bilan inventory mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
