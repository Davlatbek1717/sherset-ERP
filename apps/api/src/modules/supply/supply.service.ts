import type { Prisma } from '@moysklad/db';
import { computePositionTotal, scaleMinorByQty } from '@moysklad/money';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';
import { HR_EVENT, type SupplyPostedEvent } from '../hr/hr-shared/hr-events.types.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { PurchaseReturnService } from '../purchase-return/purchase-return.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { runBulk } from '../shared/bulk.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant, assertStateInTenant } from '../shared/mass-edit.js';
import { combineMergePositions } from '../shared/merge-positions.util.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { searchTokenGroups } from '../shared/search-tokens.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import { type OverheadLineInput, distributeOverhead } from './overhead-distribution.js';
import {
  CreateFromPurchaseOrderSchema,
  type CreateSupplyInput,
  CreateSupplySchema,
  type SupplyFilterInput,
  SupplyFilterSchema,
  type SupplyOverheadDistribution,
  SupplyTransitionSchema,
  type SupplyTransitionTarget,
  type UpdateSupplyInput,
  UpdateSupplySchema,
} from './supply.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
  costSumMinor: bigint;
}

/**
 * SupplyService — inbound stock document.
 *
 * Posting contract (draft → posted):
 *   - Build positive StockDeltas from positions (with costDeltaMinor)
 *   - applyDeltas via StockService (creates StockOperation + Stock upsert)
 *   - Set SupplyPosition.costMinor (per-unit cost after discount)
 *   - Set SupplyPosition.remainingQty = quantity (available for FIFO)
 *   - Transition state → posted, applicable=true, postedAt=now
 *
 * Unpost reverses stock via negative deltas. FIFO consumption check is
 * deferred (would reject unpost if any Demand has consumed from this
 * supply's lots — needs future FifoConsumption ledger).
 */
@Injectable()
export class SupplyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(PurchaseOrderService) private readonly po: PurchaseOrderService,
    @Inject(PaymentOutService) private readonly paymentOut: PaymentOutService,
    @Inject(PurchaseReturnService) private readonly purchaseReturns: PurchaseReturnService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SupplyFilterSchema.parse(rawFilter);
    const returnClause = await this.resolveReturnStatusClause(accountId, filter.returnStatus);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, returnClause, extraIdFilter);

    // moysklad parity: relational sort for agent/organization/store.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : filter.sortBy === 'store'
            ? { store: { name: filter.sortDir } }
            : { [filter.sortBy]: filter.sortDir };
    const rows = await this.prisma.client.supply.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, name: true } },
        // «Статус» — account-defined custom status pill (moysklad #supply column).
        status: { select: { id: true, name: true, color: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.supply.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * Aggregate totals over the SAME WHERE the list uses, across ALL matching
   * rows (not just the page) — for the pinned «Итого» footer (Сумма + Оплачено,
   * moysklad #supply). Live-grounded 2026-06-27: moysklad's footer RAW-SUMS
   * sumMinor / payedSumMinor across the filtered set and shows a number even
   * when the set mixes доллар + сум (NOT «—»). We mirror that exactly — the
   * footer is formatted without a currency symbol on the FE.
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = SupplyFilterSchema.parse(rawFilter);
    const returnClause = await this.resolveReturnStatusClause(accountId, filter.returnStatus);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, returnClause, extraIdFilter);
    const agg = await this.prisma.client.supply.aggregate({
      where,
      _sum: { sumMinor: true, payedSumMinor: true },
      _count: { _all: true },
    });
    return {
      count: agg._count._all,
      sumMinor: (agg._sum.sumMinor ?? 0n).toString(),
      payedSumMinor: (agg._sum.payedSumMinor ?? 0n).toString(),
    };
  }

  /**
   * «Объединить» — merge N draft receipts into a fresh draft (moysklad parity,
   * mirrors purchase-order.merge). Positions are combined via
   * {@link combineMergePositions} (identical lines summed, others kept separate);
   * totals are RECOMPUTED from the combined set. The primary (earliest) source's
   * header is carried; the source receipts are left UNTOUCHED (the user lands on
   * the editable merged draft). Money-integrity guards: all sources must share
   * currency + VAT mode. Per-line import/cell fields (gtdNumber/cellId/…) are NOT
   * carried (combineMergePositions keeps only the price-bearing fields); they are
   * usually empty on a draft and re-entered on the editable merged draft.
   */
  async merge(accountId: string, userId: string, ids: string[]): Promise<{ id: string }> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Birlashtirish uchun kamida 2 ta приёмка tanlang');
    }
    const sources = await this.prisma.client.supply.findMany({
      where: { id: { in: uniqueIds }, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (sources.length !== uniqueIds.length) {
      throw new BadRequestException(
        "Tanlangan приёмкаlarning ba'zilari topilmadi yoki o'chirilgan",
      );
    }
    if (new Set(sources.map((s) => s.currency)).size > 1) {
      throw new BadRequestException("Turli valyutadagi приёмкаlarni birlashtirib bo'lmaydi");
    }
    if (new Set(sources.map((s) => `${s.vatEnabled}|${s.vatIncluded}`)).size > 1) {
      throw new BadRequestException(
        "Turli QQS sozlamalaridagi приёмкаlarni birlashtirib bo'lmaydi",
      );
    }

    // Primary = earliest receipt (id-tiebroken) — carry its whole header.
    const primary = sources.reduce((earliest, s) => {
      const d = s.moment.getTime() - earliest.moment.getTime();
      if (d < 0) return s;
      if (d === 0 && s.id < earliest.id) return s;
      return earliest;
    });
    const combined = combineMergePositions(sources);
    const totals = this.computeTotals(combined, primary.vatEnabled, primary.vatIncluded);

    try {
      const name = await this.nextSupplyName(accountId);
      const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
      const created = await this.prisma.client.supply.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: primary.agentId,
          organizationId: primary.organizationId,
          storeId: primary.storeId,
          purchaseOrderId: null,
          contractId: primary.contractId,
          projectId: primary.projectId,
          organizationAccountId: primary.organizationAccountId,
          agentAccountId: primary.agentAccountId,
          externalCode: null,
          moment: new Date(),
          incomingDate: null,
          incomingNumber: null,
          description: primary.description,
          attributes: (primary.attributes ?? {}) as Prisma.InputJsonValue,
          currency: primary.currency,
          rateValue: primary.rateValue,
          overheadSumMinor: 0n,
          overheadDistribution: primary.overheadDistribution,
          overheadCurrency: primary.overheadCurrency,
          vatEnabled: primary.vatEnabled,
          vatIncluded: primary.vatIncluded,
          state: 'draft',
          applicable: false,
          sumMinor: totals.sumMinor,
          vatSumMinor: totals.vatSumMinor,
          costSumMinor: totals.costSumMinor,
          positions: {
            create: combined.map((p, idx) => ({
              accountId,
              position: idx + 1,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              productId: p.productId,
              quantity: p.quantity,
              remainingQty: '0',
              priceMinor: p.priceMinor,
              discount: p.discount,
              vat: p.vat,
              vatEnabled: p.vatEnabled,
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'merge', created.id, { sourceIds: uniqueIds });
      this.webhookFire.fireForEvent(accountId, 'supply', 'CREATE', created.id);
      return { id: created.id };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * «Статус» — assign an account-defined custom status (State row,
   * entityType="supply") to a single receipt, or clear it (`statusId: null`).
   * The status is applied IMMEDIATELY (moysklad parity — the pill is a live
   * mutation, not a save-on-edit field). Mirror of purchase-order.setStatus.
   */
  async setStatus(accountId: string, userId: string, id: string, statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'supply', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    const supply = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { statusId: true },
    });
    if (!supply) throw new NotFoundException(`Supply ${id} not found`);
    await this.prisma.client.supply.update({
      where: { id, accountId },
      data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
    });
    await this.logAudit(accountId, userId, 'set-status', id, {
      status: { before: supply.statusId, after: statusId },
    });
    this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, ['statusId']);
    return this.findById(accountId, id);
  }

  /**
   * «Статус ▾» toolbar menu — set (or clear) the custom status on N selected
   * receipts at once. Validates the target State ONCE before fanning out so an
   * invalid id is a single 400, not a per-row 500 (mirror customer-order).
   */
  async bulkSetStatus(accountId: string, userId: string, ids: string[], statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'supply', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    return runBulk(ids, async (id) => {
      const supply = await this.prisma.client.supply.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { statusId: true },
      });
      if (!supply) throw new NotFoundException(`Supply ${id} not found`);
      await this.prisma.client.supply.update({
        where: { id, accountId },
        data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
      });
      await this.logAudit(accountId, userId, 'set-status', id, {
        status: { before: supply.statusId, after: statusId },
      });
      this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, ['statusId']);
      return id;
    });
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror payment-in.service so the
   * Supply filter panel reaches moysklad «Приёмки» parity (~16 backed
   * fields) without two-place drift. Keeps the accountId tenant guard +
   * deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: SupplyFilterInput,
    returnClause: Prisma.SupplyWhereInput | null = null,
    extraIdFilter?: string[],
  ): Prisma.SupplyWhereInput {
    // «Тип возврата» (returnClause) and «Кто изменил» (extraIdFilter) can BOTH
    // constrain `id` — keep them in an AND[] so neither overwrites the other's
    // `id` key (object last-key-wins would silently drop one). Mirror demand.
    const and: Prisma.SupplyWhereInput[] = [];
    // moysklad «содержит»: tokenized multi-word search merged INTO the AND array
    // (each word may match a different field), composing with the other AND clauses
    // instead of a colliding second top-level `AND` key.
    if (filter.search) {
      and.push(
        ...searchTokenGroups(filter.search, (tok): Prisma.SupplyWhereInput[] => [
          { name: { contains: tok, mode: 'insensitive' as const } },
          { description: { contains: tok, mode: 'insensitive' as const } },
          { incomingNumber: { contains: tok, mode: 'insensitive' as const } },
          { agent: { name: { contains: tok, mode: 'insensitive' as const } } },
        ]),
      );
    }
    if (returnClause) and.push(returnClause);
    if (extraIdFilter) and.push({ id: { in: extraIdFilter } });
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
    // «Входящая дата» — Supply.incomingDate range (mirror momentRange).
    const incomingDateRange =
      filter.incomingDateFrom || filter.incomingDateTo
        ? {
            incomingDate: tashkentRangeBounds(filter.incomingDateFrom, filter.incomingDateTo),
          }
        : {};

    // «Оплата» — payment progress (payedSumMinor vs sumMinor), mirrors
    // customer-order. Prisma field references give the cross-column compare.
    const fields = this.prisma.client.supply.fields;
    const paymentClause: Prisma.SupplyWhereInput | null = (() => {
      switch (filter.paymentStatus) {
        case 'unpaid':
          return { payedSumMinor: 0n };
        case 'partial':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gt: 0n, lt: fields.sumMinor } };
        case 'paid':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gte: fields.sumMinor } };
        default:
          return null;
      }
    })();

    // «Группа контрагента» (agent.groupId) + «Владелец контрагента»
    // (agent.ownerId), single OR multi, both narrow the SAME `agent` relation —
    // merge into one sub-object so a second `agent` key can't clobber the first
    // (last-key-wins). Mirror demand's agentSub.
    const agentSub: Prisma.CounterpartyWhereInput = {
      ...(filter.agentGroupIds
        ? { groupId: { in: filter.agentGroupIds } }
        : filter.agentGroupId
          ? { groupId: filter.agentGroupId }
          : {}),
      ...(filter.agentOwnerIds
        ? { ownerId: { in: filter.agentOwnerIds } }
        : filter.agentOwnerId
          ? { ownerId: filter.agentOwnerId }
          : {}),
    };

    // Each reference field accepts a single `*Id` OR a multi `*Ids` (CSV→array,
    // moysklad inline checkbox-dropdown). Collected into the same `AND[]` as the
    // returnClause / extraIdFilter (typed clauses, not inline spreads — the
    // multi `{ in }` forms would otherwise collide on the scalar key with the
    // single form). Mirror demand.service.
    if (filter.agentIds) and.push({ agentId: { in: filter.agentIds } });
    else if (filter.agentId) and.push({ agentId: filter.agentId });
    if (Object.keys(agentSub).length) and.push({ agent: agentSub });
    if (filter.agentAccountIds) and.push({ agentAccountId: { in: filter.agentAccountIds } });
    else if (filter.agentAccountId) and.push({ agentAccountId: filter.agentAccountId });
    if (filter.organizationIds) and.push({ organizationId: { in: filter.organizationIds } });
    else if (filter.organizationId) and.push({ organizationId: filter.organizationId });
    if (filter.organizationAccountIds)
      and.push({ organizationAccountId: { in: filter.organizationAccountIds } });
    else if (filter.organizationAccountId)
      and.push({ organizationAccountId: filter.organizationAccountId });
    if (filter.storeIds) and.push({ storeId: { in: filter.storeIds } });
    else if (filter.storeId) and.push({ storeId: filter.storeId });
    if (filter.projectIds) and.push({ projectId: { in: filter.projectIds } });
    else if (filter.projectId) and.push({ projectId: filter.projectId });
    if (filter.contractIds) and.push({ contractId: { in: filter.contractIds } });
    else if (filter.contractId) and.push({ contractId: filter.contractId });
    if (filter.groupIds) and.push({ groupId: { in: filter.groupIds } });
    else if (filter.groupId) and.push({ groupId: filter.groupId });
    if (filter.ownerIds) and.push({ ownerId: { in: filter.ownerIds } });
    else if (filter.ownerId) and.push({ ownerId: filter.ownerId });
    if (filter.productIds)
      and.push({ positions: { some: { assortmentId: { in: filter.productIds } } } });
    else if (filter.productId)
      and.push({ positions: { some: { assortmentId: filter.productId } } });

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.purchaseOrderId ? { purchaseOrderId: filter.purchaseOrderId } : {}),
      ...(paymentClause ?? {}),
      ...(and.length ? { AND: and } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.incomingNumber
        ? { incomingNumber: { contains: filter.incomingNumber, mode: 'insensitive' as const } }
        : {}),
      ...momentRange,
      ...updatedRange,
      ...incomingDateRange,
      ...sumRange,
      // «содержит» search is pushed into the `and` accumulator above so it composes
      // with the other AND clauses (no colliding top-level `AND` key).
    };
  }

  /**
   * «Тип возврата» — return progress of a receipt, computed from linked Возврат
   * поставщику (PurchaseReturn.supplyId) docs (active = applicable & not deleted)
   * summed vs the receipt sum. moysklad shows none/partial/full. Returns a Prisma
   * WHERE clause: `none` via a relation `none` filter (no active returns);
   * `partial`/`full` via a pre-query that sums active returns per receipt and
   * compares to that receipt's sum, yielding the matching ids. `null` = not
   * requested. An empty match yields `{ id: { in: [] } }` (empty set, not all).
   * Mirror of demand.resolveReturnStatusClause (SalesReturn → demandId).
   */
  private async resolveReturnStatusClause(
    accountId: string,
    returnStatus: 'none' | 'partial' | 'full' | undefined,
  ): Promise<Prisma.SupplyWhereInput | null> {
    if (!returnStatus) return null;
    if (returnStatus === 'none') {
      return { purchaseReturns: { none: { applicable: true, deletedAt: null } } };
    }
    // partial | full → sum active returns per receipt, compare to each receipt's sum.
    const grouped = await this.prisma.client.purchaseReturn.groupBy({
      by: ['supplyId'],
      where: { accountId, applicable: true, deletedAt: null, supplyId: { not: null } },
      _sum: { sumMinor: true },
    });
    if (grouped.length === 0) return { id: { in: [] } };
    const ids = grouped.map((g) => g.supplyId).filter((x): x is string => x !== null);
    const supplies = await this.prisma.client.supply.findMany({
      where: { accountId, id: { in: ids } },
      select: { id: true, sumMinor: true },
    });
    const sumById = new Map(supplies.map((s) => [s.id, s.sumMinor]));
    const matched: string[] = [];
    for (const g of grouped) {
      if (!g.supplyId) continue;
      const returned = g._sum.sumMinor ?? 0n;
      const supplySum = sumById.get(g.supplyId) ?? 0n;
      if (returned <= 0n) continue;
      if (returnStatus === 'full') {
        if (supplySum > 0n && returned >= supplySum) matched.push(g.supplyId);
      } else if (returned < supplySum) {
        matched.push(g.supplyId);
      }
    }
    return { id: { in: matched } };
  }

  /**
   * «Кто изменил» (modifiedById / modifiedByIds) — Supply has no modifiedById
   * column, so we approximate via the auditLog: the DISTINCT entityIds this
   * account's Supply rows were `update`d on by the requested user(s). Returns
   * `undefined` when none requested (no narrowing) or `[]` when requested but no
   * audit row matches (forces an EMPTY result, not match-all). Accepts the
   * single `modifiedById` OR the multi `modifiedByIds` (moysklad inline
   * checkbox-dropdown). Mirror demand / invoice-out / loss.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: SupplyFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedById && !filter.modifiedByIds?.length) return undefined;
    const userIds = filter.modifiedByIds ?? (filter.modifiedById ? [filter.modifiedById] : []);
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'Supply',
        userId: { in: userIds },
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  async findById(accountId: string, id: string) {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        owner: { select: { id: true, name: true, email: true } },
        purchaseOrder: { select: { id: true, name: true, state: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        // «Статус» — account-defined custom status pill (moysklad parity).
        status: { select: { id: true, name: true, color: true } },
        positions: {
          include: {
            // weightG / volumeML drive the «Накладные расходы» WEIGHT / VOLUME
            // distribution at post time.
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                uom: true,
                weightG: true,
                volumeML: true,
              },
            },
            // moysklad «Страна» — resolve country name for the position row.
            country: { select: { id: true, name: true, code: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!supply) throw new NotFoundException(`Supply ${id} not found`);
    // «Владелец-отдел» (groupId) has NO Prisma relation on Supply — only the
    // scalar FK column — so the owner popover's department LABEL can't come from
    // an `include`. Resolve its name here (tenant-scoped) and attach it as `group`
    // so the detail page can pre-fill the «Отдел» picker (mirrors PurchaseOrder/
    // CustomerOrder.findById). The `shared` scalar is already returned by default.
    const group = supply.groupId
      ? await this.prisma.client.group.findFirst({
          where: { id: supply.groupId, accountId },
          select: { id: true, name: true },
        })
      : null;
    return { ...supply, group };
  }

  /**
   * moysklad «Связанные документы» — every document linked to this receipt.
   * Drives the detail page's related-docs diagram. Mirror of
   * PurchaseOrder.findRelated, with the Supply's chain (only FKs that EXIST in
   * schema.prisma are queried — see notes):
   *   - Заказ поставщику → Supply.purchaseOrderId (the source PO this delivers)
   *   - Возвраты постав. → PurchaseReturn.supplyId (direct FK)
   *   - Платежи          → []  (PaymentOutOperation has no supplyId FK)
   *   - Счета постав.    → []  (InvoiceIn has no supplyId FK)
   * The two omitted types have no schema back-link to a Supply, so we return
   * empty arrays for them rather than invent a join.
   */
  async findRelated(accountId: string, id: string) {
    // Existence guard so we don't leak related docs from another tenant.
    const supply = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, purchaseOrderId: true },
    });
    if (!supply) throw new NotFoundException(`Supply ${id} not found`);

    const select = { id: true, name: true, moment: true, state: true, sumMinor: true } as const;

    const [purchaseReturns, purchaseOrder] = await Promise.all([
      // PurchaseReturn carries the direct supplyId back-link.
      this.prisma.client.purchaseReturn.findMany({
        where: { accountId, supplyId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      // The single source PurchaseOrder (Supply.purchaseOrderId), if set.
      supply.purchaseOrderId
        ? this.prisma.client.purchaseOrder.findFirst({
            where: { id: supply.purchaseOrderId, accountId, deletedAt: null },
            select,
          })
        : null,
    ]);

    const toDto = (d: {
      id: string;
      name: string;
      moment: Date;
      state: string;
      sumMinor: bigint;
    }) => ({
      id: d.id,
      name: d.name,
      moment: d.moment.toISOString(),
      state: d.state,
      sumMinor: d.sumMinor.toString(),
    });

    return {
      // FK exists → real data:
      purchaseReturns: purchaseReturns.map(toDto),
      purchaseOrder: purchaseOrder ? [toDto(purchaseOrder)] : [],
      // No supplyId FK on these models → no schema-backed link → empty:
      paymentsOut: [] as ReturnType<typeof toDto>[],
      invoicesIn: [] as ReturnType<typeof toDto>[],
    };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.purchaseOrderId) {
      await this.ensurePurchaseOrder(accountId, parsed.purchaseOrderId);
    }
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId,
    );
    // «Ячейка» cross-store guard — every picked cell must belong to this store.
    await this.stock.assertCellsInStore(
      accountId,
      parsed.storeId,
      parsed.positions.map((p) => p.cellId),
    );

    const name = await this.nextSupplyName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'Supply',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Статус» — validate the account custom status belongs to this tenant and
    // the supply entityType BEFORE create (mirror purchase-return.create) —
    // never trust the client-sent id to FK-connect a foreign-tenant state.
    if (parsed.statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: parsed.statusId, accountId, entityType: 'supply', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${parsed.statusId}`);
    }

    // «Владелец»/«Владелец-отдел»/«Общий доступ» from the owner popover — the
    // schema accepted these but create() silently dropped them (owner popover
    // was decorative on /supplies/new). Tenant-validate then honor, else the
    // creator + their department (mirror purchase-return / payment-out.create).
    if (parsed.ownerId) {
      await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
    }
    if (parsed.groupId) {
      const grp = await this.prisma.client.group.findFirst({
        where: { id: parsed.groupId, accountId },
        select: { id: true },
      });
      if (!grp) throw new BadRequestException("Bo'lim topilmadi");
    }

    try {
      const created = await this.prisma.client.supply.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          statusId: parsed.statusId ?? null,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          purchaseOrderId: parsed.purchaseOrderId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          incomingDate: parsed.incomingDate ? new Date(parsed.incomingDate) : null,
          incomingNumber: parsed.incomingNumber ?? null,
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          overheadSumMinor: BigInt(parsed.overheadSumMinor),
          overheadDistribution: parsed.overheadDistribution,
          overheadCurrency: parsed.overheadCurrency,
          vatEnabled: parsed.vatEnabled,
          vatIncluded: parsed.vatIncluded,
          attributes: attributes as Prisma.InputJsonValue,
          state: 'draft',
          positions: {
            create: parsed.positions.map((p, idx) => ({
              accountId,
              position: idx + 1,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              productId: p.assortmentKind === 'product' ? p.assortmentId : null,
              purchaseOrderPositionId: p.purchaseOrderPositionId ?? null,
              quantity: p.quantity,
              remainingQty: '0', // set to quantity on post
              priceMinor: BigInt(p.priceMinor),
              discount: p.discount ?? '0',
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
              gtdNumber: p.gtdNumber ?? null,
              gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
              countryId: p.countryId ?? null,
              cellId: p.cellId ?? null,
              cell: p.cell ?? null,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.supply.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'supply', 'CREATE', created.id);
      // «Проведено» on save — run the SAME verified posting path the detail
      // «Провести» uses (stock/cost booking + guards, Serializable tx). The
      // draft is already committed; a post failure surfaces its error with the
      // draft saved (moysklad parity — the doc is kept, not lost).
      if (parsed.applicable) {
        return await this.transition(accountId, userId, created.id, 'post');
      }
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * Sprint 4.4 helper: create a Supply pre-filled from a PurchaseOrder.
   * Mirrors Demand.createFromCustomerOrder. Each Supply position back-links
   * to the corresponding PO position via `purchaseOrderPositionId`. Default
   * quantity per line = (PO.quantity - PO.receivedQty) — what's still owed.
   */
  async createFromPurchaseOrder(
    accountId: string,
    userId: string,
    purchaseOrderId: string,
    raw: unknown,
  ) {
    const parsed = CreateFromPurchaseOrderSchema.parse(raw ?? {});
    const order = await this.po.findById(accountId, purchaseOrderId);

    const storeId = parsed.storeId ?? order.storeId;

    const positions = order.positions
      .map((pop) => {
        const remaining = Number(String(pop.quantity)) - Number(String(pop.receivedQty));
        const want = parsed.quantities?.[pop.id] ?? String(remaining);
        const wantNum = Number(want);
        if (wantNum > remaining) {
          throw new BadRequestException(
            `Position ${pop.id}: qabul qilinishi mumkin = ${remaining}, so'ralmoqda ${wantNum}`,
          );
        }
        if (wantNum <= 0) return null;
        return {
          assortmentKind: pop.assortmentKind as 'product',
          assortmentId: pop.assortmentId,
          purchaseOrderPositionId: pop.id,
          quantity: want,
          priceMinor: pop.priceMinor.toString(),
          discount: pop.discount.toString(),
          vat: pop.vat ?? null,
          vatEnabled: pop.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Qabul qilinadigan pozitsiyalar yo'q — hammasi qabul qilingan");
    }

    return this.create(accountId, userId, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      storeId,
      purchaseOrderId,
      incomingNumber: parsed.incomingNumber ?? null,
      incomingDate: parsed.incomingDate ?? null,
      vatEnabled: order.vatEnabled,
      vatIncluded: order.vatIncluded,
      currency: order.currency,
      rateValue: order.rateValue.toString(),
      positions,
    });
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno priyomkani o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.SupplyUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.incomingNumber !== undefined) data.incomingNumber = parsed.incomingNumber;
    if (parsed.incomingDate !== undefined) {
      data.incomingDate = parsed.incomingDate ? new Date(parsed.incomingDate) : null;
    }
    // moysklad allows changing currency/rate on a draft — the schema
    // accepts them (.partial of Create); without this they'd be silently
    // dropped (§39 sibling: clone preserves, update must edit).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.overheadSumMinor !== undefined) {
      data.overheadSumMinor = BigInt(parsed.overheadSumMinor);
    }
    if (parsed.overheadDistribution !== undefined) {
      data.overheadDistribution = parsed.overheadDistribution;
    }
    if (parsed.overheadCurrency !== undefined) {
      data.overheadCurrency = parsed.overheadCurrency;
    }
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Supply',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.purchaseOrderId !== undefined) {
      data.purchaseOrder = parsed.purchaseOrderId
        ? { connect: { id: parsed.purchaseOrderId } }
        : { disconnect: true };
    }
    if (parsed.contractId !== undefined) {
      data.contract = parsed.contractId
        ? { connect: { id: parsed.contractId } }
        : { disconnect: true };
    }
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.organizationAccountId !== undefined) {
      data.organizationAccount = parsed.organizationAccountId
        ? { connect: { id: parsed.organizationAccountId } }
        : { disconnect: true };
    }
    if (parsed.agentAccountId !== undefined) {
      data.agentAccount = parsed.agentAccountId
        ? { connect: { id: parsed.agentAccountId } }
        : { disconnect: true };
    }
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — editable on the detail form
    // (the create path stamps the creator; update() must persist popover edits or a
    // changed owner / department / shared flag silently vanishes — the rateValue
    // bug-class). Both refs are tenant-validated (mirror purchase-order.service.ts)
    // before the relation connect / scalar set.
    if (parsed.ownerId !== undefined) {
      // null ⇒ clear the owner (the popover's ✕); a non-null id is tenant-validated
      // before connect. owner has a relation, so disconnect/connect (not scalar).
      if (parsed.ownerId) {
        await assertMassEditRefsInTenant(this.prisma, accountId, { ownerId: parsed.ownerId });
        data.owner = { connect: { id: parsed.ownerId } };
      } else {
        data.owner = { disconnect: true };
      }
    }
    if (parsed.groupId !== undefined) {
      if (parsed.groupId) {
        const grp = await this.prisma.client.group.findFirst({
          where: { id: parsed.groupId, accountId },
          select: { id: true },
        });
        if (!grp) throw new BadRequestException("Bo'lim topilmadi");
      }
      // `group` has no Prisma relation field on Supply — only the scalar FK column
      // — so set it directly (owner does have a relation, used above). null clears
      // the «Владелец-отдел» (department), matching the popover's ✕.
      data.groupId = parsed.groupId ?? null;
    }
    if (parsed.shared !== undefined) {
      data.shared = parsed.shared;
    }

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so a
      // version conflict (409) rolls back the delete instead of leaving the
      // positions destroyed (Class A — data corruption guard).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          purchaseOrderPositionId: p.purchaseOrderPositionId ?? null,
          quantity: p.quantity,
          remainingQty: '0',
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
          gtdNumber: p.gtdNumber ?? null,
          gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
          countryId: p.countryId ?? null,
          cellId: p.cellId ?? null,
          cell: p.cell ?? null,
        })),
      };
    }

    const effectiveOrgId = parsed.organizationId ?? existing.organizationId;
    const effectiveAccountId =
      parsed.organizationAccountId !== undefined
        ? parsed.organizationAccountId
        : existing.organizationAccountId;
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      effectiveOrgId,
      effectiveAccountId,
    );
    // «Ячейка» cross-store guard — only when positions are being replaced.
    if (parsed.positions !== undefined) {
      await this.stock.assertCellsInStore(
        accountId,
        parsed.storeId ?? existing.storeId,
        parsed.positions.map((p) => p.cellId),
      );
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), update#1 touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. Only update#1
      // carries the version filter + increment; update#2 (totals) is keyed on
      // {id, accountId} with no version — update#1 already bumped the row to
      // N+1, so a version filter on update#2 would always false-409.
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.supplyPosition.deleteMany({ where: { supplyId: id, accountId } });
        }
        const updated = await tx.supply.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.supply.update({
          where: { id, accountId },
          data: totals,
        });
      });
      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'Supply');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = SupplyTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: SupplyTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: the state check + soft-delete are ONE atomic conditional
    // write, so a concurrent post() flipping draft→posted between a naive check
    // and the write can't slip a delete through — count 0 → rejected.
    const res = await this.prisma.client.supply.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi priyomkani o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'supply', 'DELETE', id);
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
      stateId?: string | null;
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
    if ('stateId' in patch) {
      if (patch.stateId) await assertStateInTenant(this.prisma, accountId, patch.stateId, 'supply');
      data.statusId = patch.stateId;
    }
    const updated = await this.prisma.client.supply.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.supply.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'supply', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.supply.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Priyomka topilmadi');
    }
    const name = await this.nextSupplyName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.supply.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        purchaseOrderId: source.purchaseOrderId,
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        incomingNumber: source.incomingNumber,
        incomingDate: source.incomingDate,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» keeps the document currency + rate (a
        // cloned USD/EUR doc must not silently reset to UZS) — §8.3.
        currency: source.currency,
        rateValue: source.rateValue,
        vatEnabled: source.vatEnabled,
        vatIncluded: source.vatIncluded,
        // moysklad Скопировать preserves the «Накладные расходы» setup too.
        overheadSumMinor: source.overheadSumMinor,
        overheadDistribution: source.overheadDistribution,
        overheadCurrency: source.overheadCurrency,
        state: 'draft',
        applicable: false,
        sumMinor: source.sumMinor,
        vatSumMinor: source.vatSumMinor,
        positions: {
          create: source.positions.map((p) => ({
            accountId,
            position: p.position,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            productId: p.productId,
            quantity: p.quantity,
            priceMinor: p.priceMinor,
            discount: p.discount,
            vat: p.vat,
            vatEnabled: p.vatEnabled,
            // moysklad «Скопировать» preserves the customs block too (§8.3).
            gtdNumber: p.gtdNumber,
            gtdSumMinor: p.gtdSumMinor,
            countryId: p.countryId,
            // moysklad «Скопировать» preserves the «Ячейка» (bin) too.
            cellId: p.cellId,
            cell: p.cell,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'supply', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SupplyService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }
    // Owner 2026-07-08: «Проведено» toggles freely — an empty doc may be posted
    // (0 positions ⇒ 0 stock delta; moysklad allows it). No position precondition.

    const posted = await this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 and
        // gets a clean 409 — never a second stock deduction / FIFO write. Inside
        // the tx, so a later failure (insufficient stock) rolls the claim back.
        const claim = await tx.supply.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException("Priyomka allaqachon o'tkazilgan yoki 'draft' holatida emas");
        }

        // ── «Накладные расходы» ──────────────────────────────────────
        // Per-unit FIFO cost = price-after-discount, optionally raised by a
        // distributed share of the document overhead. When overhead is 0
        // the helper is never called and this is byte-for-byte the original
        // behaviour, so existing supplies and the test suite are unaffected.
        const hasOverhead = existing.overheadSumMinor > 0n;

        const priceAfterDiscOf = (p: (typeof existing.positions)[number]): bigint => {
          const disc = Number(String(p.discount));
          return disc > 0
            ? (p.priceMinor * BigInt(Math.round((100 - disc) * 100))) / 10000n
            : p.priceMinor;
        };
        const baseLineOf = (p: (typeof existing.positions)[number]): bigint =>
          scaleMinorByQty(priceAfterDiscOf(p), String(p.quantity));

        // positionId → { perUnit cost, line cost that hits stock }.
        const costByPos = new Map<string, { perUnit: bigint; line: bigint }>();
        if (hasOverhead) {
          const inputs: OverheadLineInput[] = existing.positions.map((p, i) => ({
            index: i,
            quantity: String(p.quantity),
            baseLineMinor: baseLineOf(p),
            weightG: p.product?.weightG ?? null,
            volumeML: p.product?.volumeML ?? null,
          }));
          const dist = distributeOverhead(
            inputs,
            existing.overheadSumMinor,
            existing.overheadDistribution as SupplyOverheadDistribution,
          );
          // dist preserves input order; pair back via the carried index.
          for (const d of dist) {
            const p = existing.positions[d.index];
            if (!p) {
              throw new Error(
                `Overhead distribution index ${d.index} out of range (positions=${existing.positions.length})`,
              );
            }
            costByPos.set(p.id, { perUnit: d.costPerUnitMinor, line: d.lineCostMinor });
          }
        } else {
          for (const p of existing.positions) {
            costByPos.set(p.id, { perUnit: priceAfterDiscOf(p), line: baseLineOf(p) });
          }
        }

        // Cost-currency normalization: the goods price + overhead share are
        // computed in the supply's DOCUMENT currency. Convert per-unit + line
        // cost to the account base (валюта учёта) via the supply's rate so the
        // FIFO ledger, stock cost balance, and downstream COGS are uniformly
        // base. Overhead distribution above is scale-invariant (proportional),
        // so converting the final figures preserves the allocation.
        // Identity for single-currency supplies (rateValue=1e8 ⇒ ×1), so
        // existing data + the §117 baseline are byte-for-byte unaffected.
        if (existing.rateValue !== 100_000_000n) {
          const supplyRate: CurrencyRate = {
            rateValue: existing.rateValue,
            multiplicity: 1n,
            indirect: false,
          };
          for (const [posId, c] of costByPos) {
            costByPos.set(posId, {
              perUnit: toBaseMinor(c.perUnit, supplyRate),
              line: toBaseMinor(c.line, supplyRate),
            });
          }
        }

        // 1. Positive StockDeltas — cost = the (overhead-inclusive) line cost.
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          cellId: p.cellId ?? null,
          qtyDelta: String(p.quantity),
          costDeltaMinor: costByPos.get(p.id)?.line ?? 0n,
          docType: 'supply',
          docId: id,
          docPositionId: p.id,
          reason: 'post',
        }));

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // 2. Update each SupplyPosition with costMinor + remainingQty. The
        //    per-unit cost is the single source of truth — unpost/cancel
        //    reverse stock via (costMinor × qty) with the identical /1000n
        //    formula, so a post→unpost cycle is exactly zero-sum.
        for (const p of existing.positions) {
          await tx.supplyPosition.update({
            where: { id: p.id },
            data: {
              costMinor: costByPos.get(p.id)?.perUnit ?? 0n,
              remainingQty: String(Number(String(p.quantity))), // entire lot for FIFO
            },
          });
        }

        // 3. Transition supply. With overhead the goods cost aggregate rises
        //    by exactly the overhead total (Σ allocation === overheadSumMinor,
        //    proven). Recomputed from the clean VAT-correct goods base so the
        //    value is idempotent across post→unpost→post.
        const transitionData: Prisma.SupplyUpdateInput = {
          state: 'posted',
          applicable: true,
          postedAt: new Date(),
        };
        if (hasOverhead) {
          const cleanBase = this.computeTotals(
            existing.positions,
            existing.vatEnabled,
            existing.vatIncluded,
          );
          transitionData.costSumMinor = cleanBase.costSumMinor + existing.overheadSumMinor;
        }
        const updated = await tx.supply.update({
          where: { id, accountId },
          data: transitionData,
        });

        // 4. Sprint 4.4 cascade — if linked to a PurchaseOrder, increment its
        //    receivedSum + per-position receivedQty (only positions with a
        //    purchaseOrderPositionId back-link participate).
        if (existing.purchaseOrderId) {
          const poDeltas = existing.positions
            .filter((p) => p.purchaseOrderPositionId)
            .map((p) => {
              // PO receivedSum tracks the gross line value (incl VAT if
              // vatIncluded). Single-round it through the shared helper so the
              // accumulated receivedSum uses the SAME rounding as the PO header
              // sumMinor (computeTotals, b1eae7be) — a fully-received PO's
              // receivedSum equals sumMinor exactly instead of drifting ±1 tiyin.
              const { totalMinor } = computePositionTotal(
                {
                  quantity: String(p.quantity),
                  priceMinor: String(p.priceMinor),
                  discount: String(p.discount),
                  vat: p.vat,
                },
                existing.vatEnabled && p.vatEnabled,
                existing.vatIncluded,
              );
              return {
                positionId: p.purchaseOrderPositionId as string,
                qtyDelta: String(p.quantity),
                valueMinor: totalMinor,
              };
            });
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.purchaseOrderId,
              poDeltas,
              'receive',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Supply',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
              positions: existing.positions.map((p) => ({
                assortmentId: p.assortmentId,
                qty: String(p.quantity),
              })),
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );

    // Post-commit: HR Telegram bridge listener queues a "yetkazib beruvchi
    // sizdan tovar qabul qilindi" notification for the supplier counterparty.
    const payload: SupplyPostedEvent = {
      accountId,
      supplyId: posted.id,
      counterpartyId: posted.agentId,
      totalMinor: posted.sumMinor,
      postedAt: posted.postedAt ?? new Date(),
    };
    this.events.emit(HR_EVENT.SUPPLY_POSTED, payload);
    return posted;
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SupplyService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }

    // FIFO consumption guard: if any SupplyPosition.remainingQty < quantity,
    // some outbound Demand has consumed from this lot and we can't safely
    // reverse stock. Future sprint will add the actual consumption ledger;
    // for now, a remainingQty check suffices.
    for (const p of existing.positions) {
      if (Number(String(p.remainingQty)) < Number(String(p.quantity))) {
        throw new BadRequestException(
          `Pozitsiya ${p.position}: bu lot qisman iste'mol qilingan (${String(p.remainingQty)}/${String(p.quantity)}), snyat provedeno qilib bo'lmaydi`,
        );
      }
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A second concurrent
        // unpost/cancel blocks on the row lock, then sees count 0 → clean 409 —
        // never a second stock reversal.
        const claim = await tx.supply.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Priyomka 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = p.costMinor ?? 0n;
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -scaleMinorByQty(costPerUnit, String(p.quantity)),
            docType: 'supply_unpost',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          };
        });

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // Reset remainingQty and costMinor
        for (const p of existing.positions) {
          await tx.supplyPosition.update({
            where: { id: p.id },
            data: { remainingQty: '0', costMinor: null },
          });
        }

        const updated = await tx.supply.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null },
        });

        // Sprint 4.4 cascade revert — undo PO.receivedSum + per-position increments.
        if (existing.purchaseOrderId) {
          const poDeltas = existing.positions
            .filter((p) => p.purchaseOrderPositionId)
            .map((p) => {
              // Mirror of post: single-round the reverted line value through the
              // shared helper so receivedSum stays consistent with the header.
              const { totalMinor } = computePositionTotal(
                {
                  quantity: String(p.quantity),
                  priceMinor: String(p.priceMinor),
                  discount: String(p.discount),
                  vat: p.vat,
                },
                existing.vatEnabled && p.vatEnabled,
                existing.vatIncluded,
              );
              return {
                positionId: p.purchaseOrderPositionId as string,
                qtyDelta: String(p.quantity),
                valueMinor: totalMinor,
              };
            });
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.purchaseOrderId,
              poDeltas,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Supply',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: { from: { before: 'posted', after: 'draft' } } as Prisma.InputJsonValue,
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
    existing: Awaited<ReturnType<SupplyService['findById']>>,
  ) {
    if (existing.state !== 'posted' && existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → cancelled`);
    }

    // If posted, run unpost-style reversal first.
    if (existing.state === 'posted') {
      for (const p of existing.positions) {
        if (Number(String(p.remainingQty)) < Number(String(p.quantity))) {
          throw new BadRequestException(
            `Pozitsiya ${p.position}: bu lot qisman iste'mol qilingan, cancel qilib bo'lmaydi`,
          );
        }
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: claim the EXACT snapshotted state→cancelled. Claiming the
      // precise state means a concurrent unpost (posted→draft) that already ran
      // makes this count 0 → 409, so we never double-reverse stock.
      const claim = await tx.supply.updateMany({
        where: { id, accountId, state: existing.state },
        data: { state: 'cancelled' },
      });
      if (claim.count === 0) {
        throw new ConflictException("Priyomka holati o'zgargan (allaqachon o'zgartirilgan)");
      }

      const wasApplicable = existing.applicable;
      if (wasApplicable) {
        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = p.costMinor ?? 0n;
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -scaleMinorByQty(costPerUnit, String(p.quantity)),
            docType: 'supply_cancel',
            docId: id,
            docPositionId: p.id,
            reason: 'cancel',
          };
        });
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        for (const p of existing.positions) {
          await tx.supplyPosition.update({
            where: { id: p.id },
            data: { remainingQty: '0', costMinor: null },
          });
        }
      }

      const updated = await tx.supply.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      // Sprint 4.4 cascade revert — only if was applicable AND linked to PO.
      if (wasApplicable && existing.purchaseOrderId) {
        const poDeltas = existing.positions
          .filter((p) => p.purchaseOrderPositionId)
          .map((p) => {
            // Mirror of post: single-round the reverted line value through the
            // shared helper so receivedSum stays consistent with the header.
            const { totalMinor } = computePositionTotal(
              {
                quantity: String(p.quantity),
                priceMinor: String(p.priceMinor),
                discount: String(p.discount),
                vat: p.vat,
              },
              existing.vatEnabled && p.vatEnabled,
              existing.vatIncluded,
            );
            return {
              positionId: p.purchaseOrderPositionId as string,
              qtyDelta: String(p.quantity),
              valueMinor: totalMinor,
            };
          });
        if (poDeltas.length > 0) {
          await this.po.applyReceipt(
            tx,
            accountId,
            userId,
            existing.purchaseOrderId,
            poDeltas,
            'revert',
          );
        }
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'Supply',
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
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateSupplyInput {
    const r = CreateSupplySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateSupplyInput {
    const r = UpdateSupplySchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const [agent, org, store] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: storeId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async ensurePurchaseOrder(accountId: string, purchaseOrderId: string): Promise<void> {
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new BadRequestException('PurchaseOrder topilmadi');
  }

  private async nextSupplyName(accountId: string): Promise<string> {
    // moysklad-parity: 5-digit zero-padded «00772», no «ПР-YYYY-» prefix
    // (grounded on climart #supply). Year-less counter key 'supply' (the old
    // «ПР-YYYY-» key also collided with payment-out's «ПР-»); the 2026-06-18
    // renumber migration pre-seeds it for the demo account.
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'supply', async () => {
      const rows = await this.prisma.client.supply.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
      }
      return max;
    });
    return String(n).padStart(5, '0');
  }

  private computeTotals(
    positions: Array<{
      quantity: unknown;
      priceMinor: bigint;
      discount: unknown;
      vat: number | null;
      vatEnabled: boolean;
    }>,
    docVatEnabled: boolean,
    vatIncluded: boolean,
  ): ComputedTotals {
    let sumMinor = 0n;
    let vatSumMinor = 0n;
    let costSumMinor = 0n;

    for (const p of positions) {
      // Single-round per-line totals; baseMinor is the post-discount pre-VAT
      // amount (= cost basis, VAT-exclusive) that costSumMinor tracks.
      const { totalMinor, vatAmountMinor, baseMinor } = computePositionTotal(
        {
          quantity: String(p.quantity),
          priceMinor: String(p.priceMinor),
          discount: String(p.discount ?? '0'),
          vat: p.vat ?? null,
        },
        docVatEnabled && p.vatEnabled,
        vatIncluded,
      );
      sumMinor += totalMinor;
      vatSumMinor += vatAmountMinor;
      costSumMinor += baseMinor;
    }
    return { sumMinor, vatSumMinor, costSumMinor };
  }

  /**
   * moysklad-parity «Создать → Исходящие платежи» — for a single supply,
   * creates one PaymentOut draft covering the remaining unpaid balance.
   * PaymentOutOperation has no supply target yet (only invoicein /
   * purchaseorder), so the draft is created WITHOUT a linking operation —
   * posting it won't auto-increment Supply.payedSumMinor; the audit entry
   * flags the missing linkage (same deferred-linkage contract as
   * PurchaseOrderService.createCashOutFor).
   */
  async createPaymentOutFor(accountId: string, userId: string, supplyId: string) {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sumMinor: true,
        payedSumMinor: true,
        agentId: true,
        organizationId: true,
        currency: true,
        rateValue: true,
      },
    });
    if (!supply) throw new NotFoundException(`Supply ${supplyId} not found`);
    const remaining = supply.sumMinor - supply.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException(
        "Приёмка to'liq to'langan — yangi PaymentOut yaratib bo'lmaydi",
      );
    }
    const created = await this.paymentOut.create(accountId, userId, {
      agentId: supply.agentId,
      organizationId: supply.organizationId,
      sumMinor: remaining.toString(),
      currency: supply.currency,
      rateValue: supply.rateValue.toString(),
      paymentPurpose: `Оплата приемки ${supply.name}`,
    });
    await this.logAudit(accountId, userId, 'create:paymentout', created.id, {
      sourceSupplyId: supplyId,
      sumMinor: remaining.toString(),
      missingOperationLink: true,
    });
    return created;
  }

  /**
   * moysklad-parity «Создать → Расходные ордера» — for a single supply,
   * creates one CashOut draft covering the remaining unpaid balance. Mirror
   * of PurchaseOrderService.createCashOutFor: no CashOutOperation linkage
   * back to the supply yet (schema has no supply target), so posting won't
   * auto-increment Supply.payedSumMinor — flagged in the audit entry.
   */
  async createCashOutFor(accountId: string, userId: string, supplyId: string) {
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        sumMinor: true,
        payedSumMinor: true,
        agentId: true,
        organizationId: true,
      },
    });
    if (!supply) throw new NotFoundException(`Supply ${supplyId} not found`);
    const remaining = supply.sumMinor - supply.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException("Приёмка to'liq to'langan — yangi CashOut yaratib bo'lmaydi");
    }

    // Default CashDesk heuristic — first cash desk on the account (mirror
    // PurchaseOrderService.createCashOutFor / money-import).
    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId },
      select: { id: true },
    });
    if (!cashDesk) {
      throw new BadRequestException('Hech qanday Kassa topilmadi — avval Kassa yarating');
    }

    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'cashout', async () => {
      const rows = await this.prisma.client.cashOut.findMany({
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
    const name = String(n).padStart(5, '0');

    const cashOut = await this.prisma.client.cashOut.create({
      data: {
        accountId,
        ownerId: userId,
        name,
        agentId: supply.agentId,
        organizationId: supply.organizationId,
        cashDeskId: cashDesk.id,
        sumMinor: remaining,
        moment: new Date(),
        state: 'draft',
        applicable: false,
        paymentPurpose: `Оплата приемки ${supply.name}`,
      },
    });
    await this.logAudit(accountId, userId, 'create:cashout', cashOut.id, {
      sourceSupplyId: supplyId,
      sumMinor: remaining.toString(),
      missingOperationLink: true,
    });
    return cashOut;
  }

  /**
   * moysklad-parity «Создать → Возвраты поставщикам» — one PurchaseReturn
   * draft per supply with every position's still-returnable quantity.
   * Delegates to PurchaseReturnService.createFromSupply, which enforces the
   * posted-only rule and the cumulative return cap per supply line.
   */
  async createPurchaseReturnFor(accountId: string, userId: string, supplyId: string) {
    return this.purchaseReturns.createFromSupply(accountId, userId, supplyId, {});
  }

  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (
        k === 'createdAt' ||
        k === 'updatedAt' ||
        k === 'positions' ||
        k === 'agent' ||
        k === 'organization' ||
        k === 'store' ||
        k === 'owner'
      ) {
        continue;
      }
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
        entity: 'Supply',
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
        `Bu qiymat bilan priyomka allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
