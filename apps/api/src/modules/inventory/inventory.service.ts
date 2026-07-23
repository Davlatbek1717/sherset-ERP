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
  InventoryFillCandidatesSchema,
  type InventoryFilterInput,
  InventoryFilterSchema,
  InventoryPositionMetaSchema,
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
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
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

  /**
   * Grid enrichment for the Инвентаризация editor (owner report 2026-07-14
   * band 3): per-assortment catalog fields (in-grid «Фильтр»), the store's
   * «Расчетный остаток» + per-unit cost («Цена»), and the StockByCell rows
   * («Остатки по ячейке» tab). Per-unit cost = weighted-average basis
   * (costBalanceMinor / qty) with a buyPrice fallback — the same source
   * LossService books write-offs from.
   */
  async positionMeta(accountId: string, raw: unknown) {
    const r = InventoryPositionMetaSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const { storeId, assortmentIds } = r.data;
    await this.ensureStore(accountId, storeId);
    if (assortmentIds.length === 0) return { items: [] };

    const [products, stocks, cellStocks, cells] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, id: { in: assortmentIds } },
        select: {
          id: true,
          name: true,
          code: true,
          article: true,
          description: true,
          uom: true,
          barcodes: true,
          buyPrice: true,
          supplierId: true,
          productFolderId: true,
          supplier: { select: { name: true } },
          productFolder: { select: { name: true } },
        },
      }),
      this.prisma.client.stock.findMany({
        where: {
          accountId,
          storeId,
          assortmentKind: 'product',
          assortmentId: { in: assortmentIds },
        },
        select: { assortmentId: true, qty: true, costBalanceMinor: true },
      }),
      this.prisma.client.stockByCell.findMany({
        where: {
          accountId,
          storeId,
          assortmentKind: 'product',
          assortmentId: { in: assortmentIds },
          qty: { not: 0 },
        },
        select: { assortmentId: true, cellId: true, qty: true },
      }),
      this.prisma.client.storeCell.findMany({
        where: { accountId, storeId },
        select: { id: true, name: true },
      }),
    ]);

    const stockByAssortment = new Map(stocks.map((s) => [s.assortmentId, s]));
    const cellName = new Map(cells.map((c) => [c.id, c.name]));
    const cellsByAssortment = new Map<
      string,
      Array<{ cellId: string; name: string; qty: string }>
    >();
    for (const row of cellStocks) {
      const list = cellsByAssortment.get(row.assortmentId) ?? [];
      list.push({
        cellId: row.cellId,
        name: cellName.get(row.cellId) ?? row.cellId,
        qty: row.qty.toString(),
      });
      cellsByAssortment.set(row.assortmentId, list);
    }

    return {
      items: products.map((p) => {
        const stock = stockByAssortment.get(p.id);
        const qtyNum = stock ? Number(stock.qty) : 0;
        // Weighted-average per-unit cost (tiyin); buyPrice fallback when the
        // store holds no qty (or no cost basis was ever booked).
        const unitCostMinor =
          stock && qtyNum > 0 && stock.costBalanceMinor > 0n
            ? String(Math.round(Number(stock.costBalanceMinor) / qtyNum))
            : p.buyPrice !== null
              ? p.buyPrice.toString()
              : null;
        return {
          assortmentId: p.id,
          name: p.name,
          code: p.code,
          article: p.article,
          description: p.description,
          uom: p.uom,
          barcodes: p.barcodes,
          supplierId: p.supplierId,
          supplierName: p.supplier?.name ?? null,
          folderId: p.productFolderId,
          folderName: p.productFolder?.name ?? null,
          stockQty: stock ? stock.qty.toString() : '0',
          unitCostMinor,
          cells: cellsByAssortment.get(p.id) ?? [],
        };
      }),
    };
  }

  /**
   * Candidate id list for the grid fill actions («Дополнить из остатков» /
   * «Дополнить из номенклатуры»). The append itself happens client-side in
   * the unsaved grid (moysklad behaviour — «Сохранить» persists).
   */
  async fillCandidates(accountId: string, raw: unknown) {
    const r = InventoryFillCandidatesSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    const { storeId, source, productId, folderId } = r.data;
    await this.ensureStore(accountId, storeId);

    if (source === 'stock') {
      const rows = await this.prisma.client.stock.findMany({
        where: { accountId, storeId, assortmentKind: 'product', qty: { not: 0 } },
        select: { assortmentId: true, qty: true },
      });
      if (rows.length === 0) return { items: [] };
      // Drop rows whose product was soft-deleted (stale Stock rows survive).
      const live = await this.prisma.client.product.findMany({
        where: { accountId, id: { in: rows.map((x) => x.assortmentId) }, deletedAt: null },
        select: { id: true },
      });
      const liveIds = new Set(live.map((p) => p.id));
      return {
        items: rows
          .filter((x) => liveIds.has(x.assortmentId))
          .map((x) => ({ assortmentId: x.assortmentId, qty: x.qty.toString() })),
      };
    }

    // source === 'assortment' — a product / a folder SUBTREE / the entire catalog.
    let folderIds: string[] | undefined;
    if (folderId) {
      const folders = await this.prisma.client.productFolder.findMany({
        where: { accountId },
        select: { id: true, parentId: true },
      });
      const children = new Map<string | null, string[]>();
      for (const f of folders) {
        const list = children.get(f.parentId) ?? [];
        list.push(f.id);
        children.set(f.parentId, list);
      }
      folderIds = [];
      const queue = [folderId];
      while (queue.length) {
        const cur = queue.pop();
        if (!cur || folderIds.includes(cur)) continue;
        folderIds.push(cur);
        queue.push(...(children.get(cur) ?? []));
      }
    }
    const products = await this.prisma.client.product.findMany({
      where: {
        accountId,
        deletedAt: null,
        archived: false,
        // Услуги/комплекты не инвентаризируются — товары only (positions'
        // assortmentKind enum is ['product']).
        kind: 'product',
        ...(productId ? { id: productId } : {}),
        ...(folderIds ? { productFolderId: { in: folderIds } } : {}),
      },
      select: { id: true },
    });
    if (products.length === 0) return { items: [] };
    const stocks = await this.prisma.client.stock.findMany({
      where: {
        accountId,
        storeId,
        assortmentKind: 'product',
        assortmentId: { in: products.map((p) => p.id) },
      },
      select: { assortmentId: true, qty: true },
    });
    const qtyById = new Map(stocks.map((s) => [s.assortmentId, s.qty.toString()]));
    return {
      items: products.map((p) => ({ assortmentId: p.id, qty: qtyById.get(p.id) ?? '0' })),
    };
  }

  private async ensureStore(accountId: string, storeId: string): Promise<void> {
    const store = await this.prisma.client.store.findFirst({
      where: { id: storeId, accountId },
      select: { id: true },
    });
    if (!store) throw new BadRequestException('Ombor topilmadi');
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
    // Owner 2026-07-08: «Проведено» toggles freely — an empty doc may be posted
    // (0 positions ⇒ 0 stock delta; moysklad allows it). No position precondition.

    // buyPrice fallback for the per-unit cost snapshot (products with no
    // stock/cost basis at the store) — one query outside the position loop.
    const buyPriceById = new Map<string, bigint | null>(
      (
        await this.prisma.client.product.findMany({
          where: {
            accountId,
            id: { in: existing.positions.map((p) => p.assortmentId) },
          },
          select: { id: true, buyPrice: true },
        })
      ).map((p) => [p.id, p.buyPrice]),
    );

    return this.prisma.client.$transaction(
      async (tx) => {
        const deltas: StockDelta[] = [];
        let surplusCount = 0;
        let shortageCount = 0;
        let sumMinor = 0n;

        for (const p of existing.positions) {
          // Snapshot expected qty from current Stock row
          const stockRow = await tx.stock.findFirst({
            where: {
              accountId,
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
            },
            select: { qty: true, costBalanceMinor: true },
          });
          const expectedQty = stockRow?.qty?.toString() ?? '0';
          const actualQty = String(p.actualQty);
          const expectedNum = Number(expectedQty);
          const actualNum = Number(actualQty);
          const varianceNum = actualNum - expectedNum;
          const varianceStr = String(varianceNum);

          // Per-unit cost snapshot («Цена» column + doc «Итого»/sumMinor):
          // weighted-average basis (costBalanceMinor / qty) with a buyPrice
          // fallback — mirrors the Loss editor's себестоимость preview.
          const costBalance = stockRow?.costBalanceMinor ?? 0n;
          const unitCostNum =
            stockRow && expectedNum > 0 && costBalance > 0n
              ? Math.round(Number(costBalance) / expectedNum)
              : Number(buyPriceById.get(p.assortmentId) ?? 0n);
          sumMinor += BigInt(Math.round(actualNum * unitCostNum));

          // Persist snapshot + variance on position
          await tx.inventoryPosition.update({
            where: { id: p.id },
            data: {
              expectedQty,
              varianceQty: varianceStr,
              costMinor: unitCostNum > 0 ? BigInt(unitCostNum) : null,
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
          // sumMinor = Σ(actualQty × per-unit cost) — "Sum of (counted_qty ×
          // cost)" per the column's schema contract; feeds the list «Сумма»
          // column + the editor «Итого» after posting.
          data: { state: 'posted', applicable: true, postedAt: new Date(), sumMinor },
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
