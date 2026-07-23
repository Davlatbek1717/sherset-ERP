import type { Prisma } from '@moysklad/db';
import { computePositionTotal, scaleMinorByQty } from '@moysklad/money';
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
import { computePerUnitCost } from '../demand/fifo-consumer.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { runBulk } from '../shared/bulk.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant, assertStateInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  assertAgentAccountMatchesAgent,
  assertOrgAccountMatchesOrg,
} from '../shared/org-account.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromSupplySchema,
  type CreatePurchaseReturnInput,
  CreatePurchaseReturnSchema,
  type PurchaseReturnFilterInput,
  PurchaseReturnFilterSchema,
  PurchaseReturnTransitionSchema,
  type PurchaseReturnTransitionTarget,
  type UpdatePurchaseReturnInput,
  UpdatePurchaseReturnSchema,
} from './purchase-return.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

/**
 * PurchaseReturnService — outbound stock side (goods back to supplier).
 *
 * post() contract (Serializable tx):
 *   1. Cumulative-return cap — Σ(posted returns for each linked Приёмка line, incl.
 *      this one) must not exceed the RECEIVED qty, else ConflictException. Prevents
 *      returning a supply line N× (which would remove N× stock + revert the PO N×).
 *   2. Sufficiency (lockBalances + assertAvailable), then NEGATIVE StockDeltas (goods
 *      leave inventory) at the store's weighted-average unit cost (NOT the doc price).
 *   3. If the linked Supply came from a PO → cascade applyReceipt(tx, ..., 'revert').
 *   4. Audit event 'transition:posted'.
 */
@Injectable()
export class PurchaseReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(PurchaseOrderService) private readonly po: PurchaseOrderService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PurchaseReturnFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    // moysklad parity: relational sort for agent/organization.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.purchaseReturn.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        supply: { select: { id: true, name: true } },
        // «Статус» — account-defined custom status pill (moysklad #purchasereturn).
        status: { select: { id: true, name: true, color: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.purchaseReturn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad-parity pinned «Итого» footer total — sums the «Сумма» column over
   * ALL filtered records (the SAME WHERE the list uses). moysklad shows ONE money
   * total here (purchasereturn list has no Оплачено/Принято columns). For a
   * MIXED-currency set it shows the BASE (UZS) sum — each doc converted via its
   * stored rateValue (scale 1e8) — not a «—» dash (mirror invoice-in.aggregateTotals).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = PurchaseReturnFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.purchaseReturn.aggregate({
        where,
        _count: true,
        _sum: { sumMinor: true },
      }),
      this.prisma.client.purchaseReturn.groupBy({ by: ['currency'], where }),
    ]);

    // Base-currency (UZS) total — only for mixed sets (the dashed case). Prisma's
    // aggregate can't multiply columns, so fetch (sum, rate) tuples and reduce in
    // BigInt (no float drift). rateValue is the doc->base ratio × 1e8.
    const RATE_SCALE = 100000000n;
    let baseSumMinor = '0';
    if (currencyGroups.length > 1) {
      const rows = await this.prisma.client.purchaseReturn.findMany({
        where,
        select: { sumMinor: true, rateValue: true },
      });
      let bs = 0n;
      for (const r of rows) bs += (r.sumMinor * r.rateValue) / RATE_SCALE;
      baseSumMinor = bs.toString();
    }

    return {
      count: agg._count,
      sumMinor: (agg._sum.sumMinor ?? 0n).toString(),
      currencies: currencyGroups.map((g) => g.currency),
      baseSumMinor,
    };
  }

  /**
   * «Статус» — assign an account-defined custom status (State row,
   * entityType="purchasereturn") to a single return, or clear it
   * (`statusId: null`). Applied IMMEDIATELY (moysklad parity — the pill is a live
   * mutation, not a save-on-edit field). Mirror of supply / purchase-order.setStatus.
   */
  async setStatus(accountId: string, userId: string, id: string, statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'purchasereturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    const pr = await this.prisma.client.purchaseReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { statusId: true },
    });
    if (!pr) throw new NotFoundException(`PurchaseReturn ${id} not found`);
    await this.prisma.client.purchaseReturn.update({
      where: { id, accountId },
      data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
    });
    await this.logAudit(accountId, userId, 'set-status', id, {
      status: { before: pr.statusId, after: statusId },
    });
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['statusId']);
    return this.findById(accountId, id);
  }

  /**
   * «Статус ▾» toolbar menu — set (or clear) the custom status on N selected
   * returns at once. Validates the target State ONCE before fanning out so an
   * invalid id is a single 400, not a per-row 500 (mirror supply.bulkSetStatus).
   */
  async bulkSetStatus(accountId: string, userId: string, ids: string[], statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'purchasereturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    return runBulk(ids, async (id) => {
      const pr = await this.prisma.client.purchaseReturn.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { statusId: true },
      });
      if (!pr) throw new NotFoundException(`PurchaseReturn ${id} not found`);
      await this.prisma.client.purchaseReturn.update({
        where: { id, accountId },
        data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
      });
      await this.logAudit(accountId, userId, 'set-status', id, {
        status: { before: pr.statusId, after: statusId },
      });
      this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['statusId']);
      return id;
    });
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror invoice-in.service so
   * the PurchaseReturn filter panel reaches moysklad «Возвраты поставщикам»
   * parity (~15 backed fields) without two-place drift. Keeps the accountId
   * tenant guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: PurchaseReturnFilterInput,
    // «Кто изменил» — PurchaseReturn has no modifiedById column, so list()/
    // aggregateTotals() pre-query the auditLog and pass the matched entityIds
    // here. undefined = no narrowing; [] = forced-empty (id IN [] = nothing).
    extraIdFilter?: string[],
  ): Prisma.PurchaseReturnWhereInput {
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
    // «Дата приемки» — date range over the LINKED supply's receipt date (moment).
    const receiptDateRange =
      filter.receiptDateFrom || filter.receiptDateTo
        ? {
            supply: {
              moment: tashkentRangeBounds(filter.receiptDateFrom, filter.receiptDateTo),
            },
          }
        : {};
    // «Оплата» — cross-column payed vs sum (mirror supply / invoice-in). sumMinor>0
    // so a zero-amount doc doesn't trivially match `paid`.
    const fields = this.prisma.client.purchaseReturn.fields;
    const paymentClause: Prisma.PurchaseReturnWhereInput | null = (() => {
      if (!filter.paymentState) return null;
      switch (filter.paymentState) {
        case 'paid':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gte: fields.sumMinor } };
        case 'partlyPaid':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gt: 0n, lt: fields.sumMinor } };
        case 'unpaid':
          return { payedSumMinor: 0n };
      }
    })();
    // «Группа контрагента» + «Владелец контрагента» both narrow the SAME `agent`
    // relation — merge into ONE clause so the object keys don't collide (last-wins
    // would silently drop a predicate). Mirror invoice-in.buildListWhere.
    const agentSub = {
      ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
      ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
    };
    const agentRelation = Object.keys(agentSub).length ? { agent: agentSub } : {};

    // «Оплата» and the «Сумма» range BOTH constrain `sumMinor`; spread side-by-side the
    // later key would silently overwrite the earlier (e.g. paymentState='paid' sets
    // `sumMinor:{gt:0}` and a sumMinor range would clobber it, or vice-versa). Combine
    // them under AND so both predicates survive. (mirror the agentRelation merge above.)
    const rangeAnd = [paymentClause, sumRange].filter(
      (c): c is Prisma.PurchaseReturnWhereInput => !!c && Object.keys(c).length > 0,
    );

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      ...agentRelation,
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.supplyId ? { supplyId: filter.supplyId } : {}),
      ...(filter.productId ? { positions: { some: { assortmentId: filter.productId } } } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...momentRange,
      ...updatedRange,
      ...receiptDateRange,
      ...(rangeAnd.length ? { AND: rangeAnd } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { reason: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  /**
   * «Кто изменил» (modifiedById) — PurchaseReturn has no modifiedById column, so
   * approximate "modified by employee X" via the auditLog: the DISTINCT entityIds
   * this account's returns were `update`d on by the requested user. Returns
   * `undefined` when no modifiedById is requested (no narrowing), or `[]` when
   * requested but no audit rows match (forces an EMPTY result, not match-all).
   * Mirror of invoice-in / supply. Remove once a real modifiedById column lands.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: PurchaseReturnFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedById) return undefined;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'PurchaseReturn',
        userId: filter.modifiedById,
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  async findById(accountId: string, id: string) {
    const pr = await this.prisma.client.purchaseReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        owner: { select: { id: true, name: true, email: true } },
        supply: { select: { id: true, name: true, state: true, purchaseOrderId: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        // «Статус» — account-defined custom status pill (moysklad parity).
        status: { select: { id: true, name: true, color: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!pr) throw new NotFoundException(`PurchaseReturn ${id} not found`);
    return pr;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    // Owner 2026-07-08: «Проведено» toggles freely — an empty return may be
    // created+posted (0 positions ⇒ 0 stock delta; moysklad allows it). No
    // position precondition on the applicable flag.
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.supplyId) await this.ensureSupply(accountId, parsed.supplyId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );
    // «Ячейка» — every picked bin must belong to the document's store (mirror supply).
    await this.stock.assertCellsInStore(
      accountId,
      parsed.storeId,
      parsed.positions.map((p) => p.cellId),
    );
    // «Счёт контрагента» must belong to THIS tenant + agent (else a crafted payload
    // routes money to a foreign account). Mirror customer-order / org-account guard.
    await assertAgentAccountMatchesAgent(
      this.prisma.client,
      accountId,
      parsed.agentId,
      parsed.agentAccountId ?? null,
    );
    // «Основание» (Приёмка) integrity: a linked return must match the supply
    // (контрагент / организация / валюта) and every supplyPositionId must belong to
    // THAT supply — else a crafted payload could revert an unrelated PO / supply line.
    if (parsed.supplyId) {
      const supply = await this.prisma.client.supply.findFirst({
        where: { id: parsed.supplyId, accountId, deletedAt: null },
        select: {
          agentId: true,
          organizationId: true,
          currency: true,
          positions: { select: { id: true } },
        },
      });
      if (!supply) throw new BadRequestException('Приёмка topilmadi');
      if (
        supply.agentId !== parsed.agentId ||
        supply.organizationId !== parsed.organizationId ||
        supply.currency !== parsed.currency
      ) {
        throw new BadRequestException(
          'Возврат Приёмка bilan mos kelmaydi (контрагент / организация / валюта)',
        );
      }
      const supplyPosIds = new Set(supply.positions.map((p) => p.id));
      for (const p of parsed.positions) {
        if (p.supplyPositionId && !supplyPosIds.has(p.supplyPositionId)) {
          throw new BadRequestException('Pozitsiya boshqa Приёмка-ga tegishli');
        }
      }
    } else {
      for (const p of parsed.positions) {
        if (p.supplyPositionId) {
          throw new BadRequestException('supplyPositionId талаб қилади: supplyId');
        }
      }
    }

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'PurchaseReturn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Статус» — validate the account custom status belongs to this tenant and the
    // purchasereturn entityType BEFORE create (mirror setStatus) — never trust the
    // client-sent id to FK-connect a foreign-tenant / wrong-type state.
    if (parsed.statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: parsed.statusId, accountId, entityType: 'purchasereturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${parsed.statusId}`);
    }

    try {
      const created = await this.prisma.client.purchaseReturn.create({
        data: {
          accountId,
          // «Владелец» — owner override from the editor's owner popover, else the creator.
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          statusId: parsed.statusId ?? null,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          supplyId: parsed.supplyId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          reason: parsed.reason,
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
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
              supplyPositionId: p.supplyPositionId ?? null,
              quantity: p.quantity,
              priceMinor: BigInt(p.priceMinor),
              discount: p.discount ?? '0',
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
              cellId: p.cellId ?? null,
              cell: p.cell ?? null,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.purchaseReturn.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'CREATE', created.id);
      // «Проведено» on save — run the SAME verified posting path the detail
      // «Провести» uses (deduction + Supply/PO revert + guards, Serializable tx).
      // The draft is already committed; a post failure surfaces its error with
      // the draft saved (moysklad parity — the doc is kept, not lost).
      if (parsed.applicable) {
        return await this.transition(accountId, userId, created.id, 'post');
      }
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async createFromSupply(accountId: string, userId: string, supplyId: string, raw: unknown) {
    const parsed = CreateFromSupplySchema.parse(raw ?? {});
    const supply = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      include: { positions: true },
    });
    if (!supply) throw new BadRequestException('Supply topilmadi');
    if (supply.state !== 'posted') {
      throw new BadRequestException(
        `Supply '${supply.state}' holatida — faqat 'posted'dan qaytarish mumkin`,
      );
    }

    const storeId = parsed.storeId ?? supply.storeId;

    // Cumulative return cap (moysklad `_purchase_return.md:583`): a supply line may be
    // returned at most the RECEIVED qty across ALL returns — NOT the original qty each
    // time. Subtract qty already returned by other active returns (draft+posted both
    // claim the remaining; the authoritative stock-affecting re-check is in post()).
    const supplyPosIds = supply.positions.map((sp) => sp.id);
    const returnedAgg = await this.prisma.client.purchaseReturnPosition.groupBy({
      by: ['supplyPositionId'],
      where: {
        supplyPositionId: { in: supplyPosIds },
        accountId,
        purchaseReturn: { deletedAt: null, state: { not: 'cancelled' } },
      },
      _sum: { quantity: true },
    });
    const returnedBySp = new Map(
      returnedAgg.map((g) => [g.supplyPositionId, Number(g._sum.quantity ?? 0)]),
    );

    const positions = supply.positions
      .map((sp) => {
        const alreadyReturned = returnedBySp.get(sp.id) ?? 0;
        const remaining = Number(String(sp.quantity)) - alreadyReturned;
        const want = parsed.quantities?.[sp.id] ?? String(remaining > 0 ? remaining : 0);
        const wantNum = Number(want);
        if (wantNum <= 0) return null;
        if (wantNum > remaining + 1e-7) {
          throw new BadRequestException(
            `Position ${sp.id}: qaytarish mumkin = ${remaining} (qabul ${String(sp.quantity)} − qaytarilgan ${alreadyReturned}), so'ralmoqda ${wantNum}`,
          );
        }
        return {
          assortmentKind: sp.assortmentKind as 'product',
          assortmentId: sp.assortmentId,
          supplyPositionId: sp.id,
          quantity: want,
          priceMinor: sp.priceMinor.toString(),
          discount: sp.discount.toString(),
          vat: sp.vat ?? null,
          vatEnabled: sp.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Qaytariladigan pozitsiyalar yo'q");
    }

    return this.create(accountId, userId, {
      agentId: supply.agentId,
      organizationId: supply.organizationId,
      storeId,
      supplyId: supply.id,
      reason: parsed.reason ?? null,
      vatEnabled: supply.vatEnabled,
      vatIncluded: supply.vatIncluded,
      currency: supply.currency,
      rateValue: supply.rateValue.toString(),
      positions,
    });
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    // moysklad parity: a POSTED «Возврат поставщику» stays fully editable (Контрагент /
    // Склад / Валюта / позиции). Saving re-books stock — reverse the current posting,
    // apply the edit, then re-post, REUSING the exact tested unpost → updateDraft → post
    // transactions (no duplicated stock math, the working post/unpost engine untouched).
    // Each step is its own Serializable tx; a mid-way failure (e.g. the edit oversells
    // the store) leaves a valid DRAFT with stock fully restored — no corruption — which
    // the user can fix and re-post. Concurrency is guarded by unpost's TOCTOU state-claim
    // (a parallel unpost/cancel makes our unpost 409 before any stock moves).
    if (existing.state === 'posted') {
      await this.unpost(accountId, userId, id, existing);
      const draft = await this.findById(accountId, id);
      await this.updateDraft(accountId, userId, id, { ...parsed, version: draft.version }, draft);
      const edited = await this.findById(accountId, id);
      return this.post(accountId, userId, id, edited);
    }
    if (existing.applicable) {
      // applicable but not 'posted' = cancelled-from-posted → terminal, stays locked.
      throw new BadRequestException("Bekor qilingan qaytarishni o'zgartirib bo'lmaydi");
    }
    return this.updateDraft(accountId, userId, id, parsed, existing);
  }

  /**
   * The draft-only field/position update (the original `update` body). Called directly
   * for a draft, and as the middle step of the posted re-post orchestration above.
   */
  private async updateDraft(
    accountId: string,
    userId: string,
    id: string,
    parsed: UpdatePurchaseReturnInput,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
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
    // «Счёт контрагента» tenant + agent guard on edit too (create-path parity).
    const effectiveAgentId = parsed.agentId ?? existing.agentId;
    const effectiveAgentAccountId =
      parsed.agentAccountId !== undefined ? parsed.agentAccountId : existing.agentAccountId;
    await assertAgentAccountMatchesAgent(
      this.prisma.client,
      accountId,
      effectiveAgentId,
      effectiveAgentAccountId,
    );
    // «Ячейка» — re-validate every picked bin against the (possibly changed) store
    // when positions are replaced (else an edit could attach a foreign-store bin).
    if (parsed.positions !== undefined) {
      await this.stock.assertCellsInStore(
        accountId,
        parsed.storeId ?? existing.storeId,
        parsed.positions.map((p) => p.cellId),
      );
    }

    const data: Prisma.PurchaseReturnUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.reason !== undefined) data.reason = parsed.reason;
    // moysklad allows changing currency/rate on a draft — schema accepts
    // them (.partial of Create); else silently dropped (§39 sibling).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'PurchaseReturn',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.supplyId !== undefined) {
      data.supply = parsed.supplyId ? { connect: { id: parsed.supplyId } } : { disconnect: true };
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
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — the schema accepts them (a
    // .partial of Create) but update() dropped them, so a changed owner / department /
    // shared flag silently vanished (the rateValue bug-class). Mirror supply: both refs
    // tenant-validated before the connect / scalar set.
    if (parsed.ownerId !== undefined) {
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
      data.groupId = parsed.groupId ?? null;
    }
    if (parsed.shared !== undefined) {
      data.shared = parsed.shared;
    }

    if (parsed.positions !== undefined) {
      // Read-only build here; the destructive deleteMany is deferred into the
      // $transaction below so a version conflict (409) rolls back the delete
      // instead of leaving the positions destroyed (data corruption).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          supplyPositionId: p.supplyPositionId ?? null,
          quantity: p.quantity,
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
          cellId: p.cellId ?? null,
          cell: p.cell ?? null,
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), update#1 touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. update#1
      // carries the version filter + increment; update#2 (totals) is keyed on
      // {id, accountId} only — update#1 already bumped the row to N+1, so a
      // version filter there would always miss and false-409.
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.purchaseReturnPosition.deleteMany({
            where: { purchaseReturnId: id, accountId },
          });
        }
        const updated = await tx.purchaseReturn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.purchaseReturn.update({
          where: { id, accountId },
          data: totals,
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id);
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'PurchaseReturn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PurchaseReturnTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: PurchaseReturnTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: state check + soft-delete are ONE atomic conditional write,
    // so a concurrent post() flipping draft→posted can't slip a delete through.
    const res = await this.prisma.client.purchaseReturn.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi qaytarishni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'DELETE', id);
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
      if (patch.stateId)
        await assertStateInTenant(this.prisma, accountId, patch.stateId, 'purchasereturn');
      data.statusId = patch.stateId;
    }
    const updated = await this.prisma.client.purchaseReturn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.purchaseReturn.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.purchaseReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Qaytarish topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.purchaseReturn.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        supplyId: source.supplyId,
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        reason: source.reason,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» keeps the document currency + rate (a
        // cloned USD/EUR doc must not silently reset to UZS) — §8.3.
        currency: source.currency,
        rateValue: source.rateValue,
        vatEnabled: source.vatEnabled,
        vatIncluded: source.vatIncluded,
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
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'purchasereturn', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted allowed (current: ${existing.state})`);
    }

    const store = await this.prisma.client.store.findFirst({
      where: { id: existing.storeId, accountId },
      select: { id: true, allowNegativeStock: true },
    });
    if (!store) throw new NotFoundException('Ombor topilmadi');

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 →
        // clean 409 — never a second stock deduction.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Qaytarish allaqachon o'tkazilgan yoki 'draft' holatida emas",
          );
        }

        // «Основание» qty integrity (authoritative, in-tx). Σ(POSTED returns for each
        // linked Приёмка line, incl. this one) must not exceed the RECEIVED qty
        // (moysklad `_purchase_return.md:583`). Without this, two full-remaining drafts
        // would both post → 2× stock removed + PO reverted 2×. Serializable isolation
        // makes the concurrent two-post race abort one of the pair (rw-conflict on the
        // applicable=true predicate).
        const linkedSpIds = [
          ...new Set(
            existing.positions.map((p) => p.supplyPositionId).filter((x): x is string => x != null),
          ),
        ];
        if (linkedSpIds.length > 0) {
          const supplyPositions = await tx.supplyPosition.findMany({
            where: { id: { in: linkedSpIds }, accountId },
            select: { id: true, quantity: true },
          });
          const supplyQtyById = new Map(
            supplyPositions.map((sp) => [sp.id, Number(String(sp.quantity))]),
          );
          const otherPosted = await tx.purchaseReturnPosition.groupBy({
            by: ['supplyPositionId'],
            where: {
              supplyPositionId: { in: linkedSpIds },
              accountId,
              purchaseReturn: { applicable: true, deletedAt: null, id: { not: id } },
            },
            _sum: { quantity: true },
          });
          const otherById = new Map(
            otherPosted.map((g) => [g.supplyPositionId, Number(g._sum.quantity ?? 0)]),
          );
          const thisById = new Map<string, number>();
          for (const p of existing.positions) {
            if (p.supplyPositionId) {
              thisById.set(
                p.supplyPositionId,
                (thisById.get(p.supplyPositionId) ?? 0) + Number(String(p.quantity)),
              );
            }
          }
          for (const spId of linkedSpIds) {
            const cap = supplyQtyById.get(spId) ?? 0;
            const total = (otherById.get(spId) ?? 0) + (thisById.get(spId) ?? 0);
            if (total > cap + 1e-7) {
              throw new ConflictException(
                `Приёмка позицияси: qaytarilgan jami (${total}) qabul qilingan (${cap}) dan oshib ketdi`,
              );
            }
          }
        }

        // Lock + sufficiency check (same pattern as Demand post)
        const assortments = existing.positions.map((p) => ({
          kind: p.assortmentKind,
          id: p.assortmentId,
        }));
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          existing.storeId,
          assortments,
        );
        this.stock.assertAvailable(
          store.allowNegativeStock,
          existing.positions.map((p) => ({
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            name: p.product?.name,
            requested: String(p.quantity),
          })),
          balances,
        );

        // Cost-of-goods basis for the supplier return: goods LEAVE inventory,
        // so the value removed is the store's current WEIGHTED-AVERAGE unit
        // cost (Stock.costBalanceMinor ÷ qty-on-hand) — NOT the document price.
        // Using the price (the old code did `priceAfterDisc`) corrupted
        // Stock.costBalanceMinor whenever return price ≠ carrying cost (could
        // even drive it negative). Same basis as Loss (3add5a13) and the
        // `balances` already locked above. Frozen onto p.costMinor so unpost/
        // cancel reverse the identical value (cost zero-sum).
        const perUnitByPos = new Map<string, bigint>();
        for (const p of existing.positions) {
          const bal = balances.get(p.assortmentId);
          const onHand = bal?.qty ?? '0';
          const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
          perUnitByPos.set(p.id, costBal > 0n ? computePerUnitCost(costBal, onHand) : 0n);
        }

        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = perUnitByPos.get(p.id) ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -valueMinor,
            docType: 'purchasereturn',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          };
        });

        // Freeze the per-unit cost so unpost/cancel reverse the exact value.
        for (const p of existing.positions) {
          await tx.purchaseReturnPosition.update({
            where: { id: p.id },
            data: { costMinor: perUnitByPos.get(p.id) ?? 0n },
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'posted', applicable: true, postedAt: new Date() },
        });

        // Cascade to PO through linked Supply
        if (existing.supply?.purchaseOrderId) {
          const poDeltas = await this.buildPoDeltas(tx, existing);
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.supply.purchaseOrderId,
              poDeltas,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft allowed (current: ${existing.state})`);
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A concurrent unpost/cancel
        // blocks on the row lock, then sees count 0 → clean 409 — never a second
        // stock reversal.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Qaytarish 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        const deltas: StockDelta[] = existing.positions.map((p) => {
          // Reverse the WEIGHTED-AVERAGE cost frozen at post-time (p.costMinor),
          // not the document price — cost zero-sum with post().
          const costPerUnit = p.costMinor ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: String(p.quantity),
            costDeltaMinor: valueMinor,
            docType: 'purchasereturn_unpost',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          };
        });

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null },
        });

        if (existing.supply?.purchaseOrderId) {
          const poDeltas = await this.buildPoDeltas(tx, existing);
          if (poDeltas.length > 0) {
            await this.po.applyReceipt(
              tx,
              accountId,
              userId,
              existing.supply.purchaseOrderId,
              poDeltas,
              'receive',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:unposted',
            fieldChanges: {
              from: { before: 'posted', after: 'draft' },
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
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: claim the EXACT snapshotted state→cancelled so a
        // concurrent unpost (posted→draft) that already ran makes this count 0 →
        // 409, never a double stock reversal.
        const claim = await tx.purchaseReturn.updateMany({
          where: { id, accountId, state: existing.state },
          data: { state: 'cancelled' },
        });
        if (claim.count === 0) {
          throw new ConflictException("Qaytarish holati o'zgargan (allaqachon o'zgartirilgan)");
        }

        const wasApplicable = existing.applicable;

        if (wasApplicable) {
          const deltas: StockDelta[] = existing.positions.map((p) => {
            // Reverse the frozen weighted-average cost (cost zero-sum with post).
            const costPerUnit = p.costMinor ?? 0n;
            const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
            return {
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              cellId: p.cellId ?? null,
              qtyDelta: String(p.quantity),
              costDeltaMinor: valueMinor,
              docType: 'purchasereturn_cancel',
              docId: id,
              docPositionId: p.id,
              reason: 'cancel',
            };
          });
          await this.stock.applyDeltas(tx, accountId, userId, deltas);

          if (existing.supply?.purchaseOrderId) {
            const poDeltas = await this.buildPoDeltas(tx, existing);
            if (poDeltas.length > 0) {
              await this.po.applyReceipt(
                tx,
                accountId,
                userId,
                existing.supply.purchaseOrderId,
                poDeltas,
                'receive',
              );
            }
          }
        }

        const updated = await tx.purchaseReturn.update({
          where: { id, accountId },
          data: { state: 'cancelled', applicable: false },
        });

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'PurchaseReturn',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: existing.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  // =====================================================================
  // helpers
  // =====================================================================

  /**
   * Build per-PO-position deltas for a PurchaseReturn, resolving
   * supplyPositionId → PO position via each linked SupplyPosition's
   * purchaseOrderPositionId.
   */
  private async buildPoDeltas(
    tx: Prisma.TransactionClient,
    existing: Awaited<ReturnType<PurchaseReturnService['findById']>>,
  ): Promise<Array<{ positionId: string; qtyDelta: string; valueMinor: bigint }>> {
    const linkedPositions = existing.positions.filter((p) => p.supplyPositionId);
    if (linkedPositions.length === 0) return [];

    const supplyPositions = await tx.supplyPosition.findMany({
      where: { id: { in: linkedPositions.map((p) => p.supplyPositionId as string) } },
      select: { id: true, purchaseOrderPositionId: true },
    });
    const spMap = new Map(
      supplyPositions.map((sp) => [sp.id, sp.purchaseOrderPositionId] as const),
    );

    return linkedPositions
      .map((p) => {
        const poPositionId = spMap.get(p.supplyPositionId as string);
        if (!poPositionId) return null;
        // Single-round the reverted line value through the shared helper so the
        // PO.receivedSum revert matches the same rounding as the PO header
        // sumMinor (b1eae7be) — consistent with supply's receive/revert cascade.
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
        return { positionId: poPositionId, qtyDelta: String(p.quantity), valueMinor: totalMinor };
      })
      .filter((d): d is { positionId: string; qtyDelta: string; valueMinor: bigint } => d != null);
  }

  private parseCreate(raw: unknown): CreatePurchaseReturnInput {
    const r = CreatePurchaseReturnSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdatePurchaseReturnInput {
    const r = UpdatePurchaseReturnSchema.safeParse(raw);
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
    if (!agent) throw new BadRequestException("Ta'minlovchi topilmadi");
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async ensureSupply(accountId: string, supplyId: string): Promise<void> {
    const s = await this.prisma.client.supply.findFirst({
      where: { id: supplyId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!s) throw new BadRequestException('Supply topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'purchasereturn',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.purchaseReturn.findMany({
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

    for (const p of positions) {
      const { totalMinor, vatAmountMinor } = computePositionTotal(
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
    }
    return { sumMinor, vatSumMinor };
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
        entity: 'PurchaseReturn',
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
        `Bu qiymat bilan qaytarish allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
