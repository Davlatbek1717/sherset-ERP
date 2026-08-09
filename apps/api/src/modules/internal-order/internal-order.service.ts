import type { Prisma } from '@moysklad/db';
import { scaleMinorByQty } from '@moysklad/money';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { compareDecimals, subtractDecimals } from '../demand/fifo-consumer.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { availableOf } from '../stock/stock.service.js';
import {
  CreateInternalOrderSchema,
  type InternalOrderFilterInput,
  InternalOrderFilterSchema,
  type InternalOrderPositionInput,
  UpdateInternalOrderSchema,
} from './internal-order.schema.js';

/**
 * InternalOrder service — internal stock-transfer requests.
 *
 * Money math note: the document carries `sumMinor` / `vatSumMinor`
 * derived from the position table for REPORTING ONLY. Posting does NOT
 * touch the counterparty balance (there's no counterparty involved) and
 * does NOT touch the stock balance (stock moves when a separate Move
 * document is posted referencing this order). So the FSM here is purely
 * about lifecycle tracking — no transaction needed beyond the row
 * updates themselves.
 *
 * Fulfilment: `movedSumMinor` on the header and `movedQuantity` per
 * position are bumped by the Move module (out of scope for this file)
 * when a Move references this order.
 */
@Injectable()
export class InternalOrderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, raw: unknown) {
    const filter = InternalOrderFilterSchema.parse(raw);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    // moysklad parity: relational sort for organization / store (the
    // list-view exposes these column headers as sortable). Mirror
    // move.service.ts / supply.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'store'
          ? { store: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.internalOrder.findMany({
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
    const total = await this.prisma.client.internalOrder.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror move.service.ts so the
   * InternalOrder filter panel reaches moysklad «Внутренние заказы» parity
   * (~12 backed fields) without two-place drift. Preserves the accountId
   * tenant guard + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: InternalOrder is an internal stock-transfer request — it has NO
   * agentId, agentAccountId, contractId, organizationAccountId, or
   * salesChannelId (no counterparty). DO NOT add those clauses.
   */
  private buildListWhere(
    accountId: string,
    filter: InternalOrderFilterInput,
    // «Кто изменил» — InternalOrder has NO modifiedById column, so list()
    // pre-queries the auditLog and passes the matched entityIds here.
    // `[]` (requested but zero audit rows) forces an EMPTY result.
    extraIdFilter?: string[],
  ): Prisma.InternalOrderWhereInput {
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
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.storeIds ? { storeId: { in: filter.storeIds } } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.projectIds ? { projectId: { in: filter.projectIds } } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.ownerIds ? { ownerId: { in: filter.ownerIds } } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.groupIds ? { groupId: { in: filter.groupIds } } : {}),
      ...(filter.productIds
        ? { positions: { some: { productId: { in: filter.productIds } } } }
        : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
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

  /**
   * «Кто изменил» (modifiedByIds) — InternalOrder has no modifiedById column,
   * so we approximate via the auditLog: the DISTINCT entityIds this account's
   * InternalOrder rows were `update`d on by the requested users. Returns
   * `undefined` when none requested (no narrowing) or `[]` when requested but
   * no audit rows match (forces an EMPTY result, not match-all). Mirror loss.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: InternalOrderFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedByIds?.length) return undefined;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'InternalOrder',
        userId: { in: filter.modifiedByIds },
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  /**
   * «Заказ поставщику с учётом доступно» — supply-shortfall basis for creating
   * a purchase order from this internal order. For every PRODUCT position,
   * compute what the order's (destination) store can't currently cover:
   *   available = max(0, Stock.qty − Stock.reservedQty)   (in the order's store)
   *   shortfall = orderedQty − available
   * and return only the rows with shortfall > 0, their quantity set to the
   * shortfall. Same {organization, store, positions} shape as the plain fetch
   * so purchase-orders/new consumes either uniformly. Mirrors
   * customer-order.service.getSupplyShortfall.
   */
  async getSupplyShortfall(accountId: string, id: string) {
    const order = await this.findById(accountId, id);
    const productPositions = order.positions.filter((p) => p.assortmentKind === 'product');
    const availByProduct = new Map<string, string>();
    if (productPositions.length > 0) {
      const stocks = await this.prisma.client.stock.findMany({
        where: {
          accountId,
          storeId: order.storeId,
          assortmentKind: 'product',
          assortmentId: { in: productPositions.map((p) => p.assortmentId) },
        },
        select: { assortmentId: true, qty: true, reservedQty: true },
      });
      for (const s of stocks) {
        availByProduct.set(
          s.assortmentId,
          availableOf({ qty: String(s.qty), reservedQty: String(s.reservedQty) }),
        );
      }
    }
    const positions = productPositions
      .map((p) => {
        const available = availByProduct.get(p.assortmentId) ?? '0';
        // Exact Decimal(20,6) — see customer-order.getSupplyShortfall (STK-12).
        const shortfall = subtractDecimals(String(p.quantity), available);
        return { p, shortfall };
      })
      .filter(({ shortfall }) => compareDecimals(shortfall, '0') > 0)
      .map(({ p, shortfall }) => ({
        assortmentId: p.assortmentId,
        quantity: shortfall,
        product: p.product ? { name: p.product.name } : null,
      }));
    return {
      organization: { id: order.organization.id, name: order.organization.name },
      store: order.store ? { id: order.store.id, name: order.store.name } : null,
      positions,
    };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.internalOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        store: true,
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        positions: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                uom: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException(`InternalOrder ${id} not found`);
    return row;
  }

  /** Compute header totals from positions — kept centralised so create + update agree. */
  private computeTotals(positions: InternalOrderPositionInput[]) {
    let sumMinor = 0n;
    let vatSumMinor = 0n;
    for (const p of positions) {
      const price = BigInt(p.priceMinor ?? '0');
      // price × qty via the shared 6-dp, round-half-up primitive — the
      // quantity column is Decimal(20,6), and /internal-orders/new computes the
      // preview the same way, so the stored total matches what the user sees.
      const lineMinor = scaleMinorByQty(price, String(p.quantity));
      sumMinor += lineMinor;
      if (p.vatEnabled && p.vat) {
        // VAT inclusive convention is handled by the doc's `vatIncluded`
        // flag at totals time; per-line we just stash the percent for
        // reporting and let the header aggregate decide. For simplicity
        // here we treat VAT as additive (matches `vatIncluded=false`
        // default) — refine on next iteration if needed.
        vatSumMinor += (lineMinor * BigInt(p.vat)) / 100n;
      }
    }
    return { sumMinor, vatSumMinor };
  }

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = CreateInternalOrderSchema.parse(raw);
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'internalorder',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.internalOrder.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          const m = r.name.match(/\d+$/);
          if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
        }
        return max;
      },
    );
    // moysklad-parity: the «№» header input overrides the auto number.
    const name = data.name?.trim() || String(n).padStart(5, '0');

    const moment = data.moment ? new Date(data.moment) : new Date();
    const deliveryPlannedMoment = data.deliveryPlannedMoment
      ? new Date(data.deliveryPlannedMoment)
      : null;
    const applicable = data.applicable ?? false;
    const state = applicable ? 'posted' : 'draft';
    const postedAt = applicable ? new Date() : null;
    const totals = this.computeTotals(data.positions);

    // «Владелец» popover refs come from the client — tenant-validate before use.
    await assertMassEditRefsInTenant(this.prisma, accountId, {
      ...(data.ownerId ? { ownerId: data.ownerId } : {}),
      ...(data.groupId ? { groupId: data.groupId } : {}),
    });

    const created = await this.prisma.client.$transaction(async (tx) => {
      const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);
      const row = await tx.internalOrder.create({
        data: {
          accountId,
          ownerId: data.ownerId ?? ownerId,
          groupId: data.groupId ?? creatorGroupId,
          shared: data.shared ?? false,
          organizationId: data.organizationId,
          storeId: data.storeId,
          projectId: data.projectId ?? null,
          name,
          moment,
          deliveryPlannedMoment,
          applicable,
          state,
          postedAt,
          sumMinor: totals.sumMinor,
          vatSumMinor: totals.vatSumMinor,
          vatEnabled: data.vatEnabled,
          vatIncluded: data.vatIncluded,
          currency: data.currency,
          rateValue: BigInt(data.rateValue),
          description: data.description,
          externalCode: data.externalCode,
        },
      });
      await tx.internalOrderPosition.createMany({
        data: data.positions.map((p, idx) => ({
          internalOrderId: row.id,
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.productId ?? (p.assortmentKind === 'product' ? p.assortmentId : null),
          quantity: p.quantity,
          priceMinor: p.priceMinor ? BigInt(p.priceMinor) : null,
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
        })),
      });
      return row;
    });
    await this.logAudit(accountId, ownerId, 'create', created.id, null);
    return created;
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = UpdateInternalOrderSchema.parse(raw);
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }
    try {
      // Optimistic-lock guard (lost-update). The version-filtered header update
      // runs FIRST inside the tx; if a concurrent edit bumped the version, it
      // touches zero rows → P2025 → the whole tx (incl. the destructive
      // position deleteMany) rolls back, so positions are NOT lost (Class A).
      // Single versioned update — totals are folded into it; there is no
      // second update.
      const result = await this.prisma.client.$transaction(async (tx) => {
        const totals = data.positions ? this.computeTotals(data.positions) : null;
        await tx.internalOrder.update({
          where: { id, accountId, version: data.version },
          data: {
            ...(data.organizationId ? { organizationId: data.organizationId } : {}),
            ...(data.storeId ? { storeId: data.storeId } : {}),
            ...(data.projectId !== undefined ? { projectId: data.projectId ?? null } : {}),
            ...(data.moment ? { moment: new Date(data.moment) } : {}),
            ...(data.deliveryPlannedMoment !== undefined
              ? {
                  deliveryPlannedMoment: data.deliveryPlannedMoment
                    ? new Date(data.deliveryPlannedMoment)
                    : null,
                }
              : {}),
            ...(data.vatEnabled !== undefined ? { vatEnabled: data.vatEnabled } : {}),
            ...(data.vatIncluded !== undefined ? { vatIncluded: data.vatIncluded } : {}),
            ...(data.currency ? { currency: data.currency } : {}),
            ...(data.rateValue ? { rateValue: BigInt(data.rateValue) } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.externalCode !== undefined ? { externalCode: data.externalCode } : {}),
            ...(totals ? { sumMinor: totals.sumMinor, vatSumMinor: totals.vatSumMinor } : {}),
            version: { increment: 1 },
          },
        });
        if (data.positions) {
          await tx.internalOrderPosition.deleteMany({ where: { internalOrderId: id } });
          if (data.positions.length > 0) {
            await tx.internalOrderPosition.createMany({
              data: data.positions.map((p, idx) => ({
                internalOrderId: id,
                accountId,
                position: idx + 1,
                assortmentKind: p.assortmentKind,
                assortmentId: p.assortmentId,
                productId: p.productId ?? (p.assortmentKind === 'product' ? p.assortmentId : null),
                quantity: p.quantity,
                priceMinor: p.priceMinor ? BigInt(p.priceMinor) : null,
                vat: p.vat ?? null,
                vatEnabled: p.vatEnabled,
              })),
            });
          }
        }
        return tx.internalOrder.findUniqueOrThrow({
          where: { id },
          include: { positions: { orderBy: { position: 'asc' } } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      return result;
    } catch (e) {
      mapVersionedUpdateError(e, 'InternalOrder');
      throw e;
    }
  }

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        "Provedeno hujjatni o'chirish mumkin emas — avval unpost yoki cancel qiling",
      );
    }
    await this.prisma.client.internalOrder.update({
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
    patch: {
      ownerId?: string | null;
      projectId?: string | null;
      description?: string | null;
      groupId?: string | null;
      shared?: boolean;
    },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    if ('groupId' in patch) data.groupId = patch.groupId;
    if ('shared' in patch && patch.shared !== undefined) data.shared = patch.shared;
    const updated = await this.prisma.client.internalOrder.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch as Record<string, unknown>);
    return updated;
  }

  async markPrinted(accountId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    return this.prisma.client.internalOrder.update({
      where: { id, accountId },
      data: { printed },
    });
  }

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    return this.create(accountId, ownerId, {
      organizationId: src.organizationId,
      storeId: src.storeId,
      projectId: src.projectId ?? undefined,
      vatEnabled: src.vatEnabled,
      vatIncluded: src.vatIncluded,
      currency: src.currency,
      rateValue: src.rateValue.toString(),
      description: src.description ?? undefined,
      externalCode: src.externalCode ?? undefined,
      applicable: false,
      positions: src.positions.map((p) => ({
        assortmentKind: p.assortmentKind as 'product' | 'variant' | 'bundle',
        assortmentId: p.assortmentId,
        productId: p.productId ?? undefined,
        quantity: p.quantity.toString(),
        priceMinor: p.priceMinor ? p.priceMinor.toString() : undefined,
        vat: p.vat,
        vatEnabled: p.vatEnabled,
      })),
    });
  }

  async transition(
    accountId: string,
    userId: string,
    id: string,
    target: 'post' | 'unpost' | 'cancel',
  ) {
    const row = await this.findById(accountId, id);
    if (target === 'post') {
      if (row.applicable) throw new BadRequestException('Already posted');
      await this.prisma.client.internalOrder.update({
        where: { id },
        data: { applicable: true, state: 'posted', postedAt: new Date() },
      });
      await this.logAudit(accountId, userId, 'transition:posted', id, {
        from: { before: row.state, after: 'posted' },
      });
    } else if (target === 'unpost') {
      if (!row.applicable) throw new BadRequestException('Not posted');
      await this.prisma.client.internalOrder.update({
        where: { id },
        data: { applicable: false, state: 'draft', postedAt: null },
      });
      await this.logAudit(accountId, userId, 'transition:unposted', id, {
        from: { before: row.state, after: 'draft' },
      });
    } else if (target === 'cancel') {
      await this.prisma.client.internalOrder.update({
        where: { id },
        data: { applicable: false, state: 'cancelled' },
      });
      await this.logAudit(accountId, userId, 'transition:cancelled', id, {
        from: { before: row.state, after: 'cancelled' },
      });
    }
    return this.findById(accountId, id);
  }

  /**
   * Write an audit-trail row for the document's «Tarix» / History tab.
   * The tab fetches /audit-logs?entity=InternalOrder (exact-match the web
   * page's auditEntity="InternalOrder"), so this `entity` string MUST stay
   * in sync or the tab renders empty. Non-transactional: InternalOrder has
   * NO balance/stock side effects (see the class doc-comment), so the audit
   * row needs no atomic delta (unlike prepayment's posted-balance path).
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
        entity: 'InternalOrder',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
