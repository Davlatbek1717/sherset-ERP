import type { Prisma } from '@moysklad/db';
import { computePositionTotal } from '@moysklad/money';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { PaymentOutService } from '../payment-out/payment-out.service.js';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { MONEY_TX_OPTS, transitionWithClaim } from '../shared/transition-with-claim.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromPurchaseOrderSchema,
  type CreateInvoiceInInput,
  CreateInvoiceInSchema,
  type InvoiceInFilterInput,
  InvoiceInFilterSchema,
  type InvoiceInState,
  InvoiceInTransitionSchema,
  type InvoiceInTransitionTarget,
  type UpdateInvoiceInInput,
  UpdateInvoiceInSchema,
} from './invoice-in.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

@Injectable()
export class InvoiceInService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    // forwardRef breaks the longer cycle introduced by PurchaseOrder
    // → PaymentOut → InvoiceIn → PurchaseOrder. Without this the ESM
    // loader hits "Cannot access PurchaseOrderService before
    // initialization" at module-graph evaluation time.
    @Inject(forwardRef(() => PurchaseOrderService))
    private readonly po: PurchaseOrderService,
    // forwardRef on the InvoiceIn ↔ PaymentOut edge of the tri-cycle —
    // PaymentOutService already forwardRef-injects InvoiceInService, so the
    // reverse is symmetric. Used by «Создать → Исходящие платежи».
    @Inject(forwardRef(() => PaymentOutService))
    private readonly paymentOut: PaymentOutService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = InvoiceInFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    // moysklad parity: relational sort for agent/organization. The «№» column
    // (sortBy='name') sorts by the document SEQUENCE — our names mix formats
    // («00001» legacy + «СФ-2026-00045»), so a raw string sort would misorder
    // them. Map a 'name' sort to (moment, id) like purchase-orders: a stable
    // newest-first sequence shown under the «№» sort arrow.
    const orderBy:
      | Prisma.InvoiceInOrderByWithRelationInput
      | Prisma.InvoiceInOrderByWithRelationInput[] =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : filter.sortBy === 'name'
            ? [{ moment: filter.sortDir }, { id: filter.sortDir }]
            : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.invoiceIn.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        // moysklad «На склад» list column — the warehouse the linked Supply
        // would receive into (optional; null = picked at posting time).
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        purchaseOrder: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.invoiceIn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad-parity pinned «Итого» footer totals — sums ALL filtered records
   * (not just the visible page), over the SAME WHERE the list uses so the
   * footer and the grid always agree on which rows are in scope. The footer
   * cells are Сумма / Оплачено / Принято (shippedSumMinor = received). Returns
   * the distinct document currencies so a mixed-currency set renders «—»
   * instead of a meaningless cross-currency sum (mirror purchase-order /
   * customer-order — sumMinor is stored in each doc's OWN currency).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = InvoiceInFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.invoiceIn.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          payedSumMinor: true,
          shippedSumMinor: true,
        },
      }),
      this.prisma.client.invoiceIn.groupBy({ by: ['currency'], where }),
    ]);

    // moysklad parity (LIVE-GROUND 2026-06-28 #invoicein): a MIXED-currency
    // footer shows the BASE (UZS) sum — every doc converted via its stored
    // rateValue (scale 1e8) then summed — NOT a «—» dash. Prisma's aggregate
    // can't multiply two columns, so for the (rare) mixed set fetch the
    // (sum, payed, shipped, rate) tuples and reduce with BigInt (no float drift,
    // exact: 1 150,80 USD @12 300 + 327 000 сум = 14 481 840,00). Single-currency
    // sets don't need this — the raw per-currency sum already equals the base.
    const RATE_SCALE = 100000000n; // rateValue is the doc→base ratio × 1e8
    let baseSumMinor = '0';
    let basePayedSumMinor = '0';
    let baseShippedSumMinor = '0';
    if (currencyGroups.length > 1) {
      const rows = await this.prisma.client.invoiceIn.findMany({
        where,
        select: { sumMinor: true, payedSumMinor: true, shippedSumMinor: true, rateValue: true },
      });
      let bs = 0n;
      let bp = 0n;
      let bsh = 0n;
      for (const r of rows) {
        bs += (r.sumMinor * r.rateValue) / RATE_SCALE;
        bp += (r.payedSumMinor * r.rateValue) / RATE_SCALE;
        bsh += (r.shippedSumMinor * r.rateValue) / RATE_SCALE;
      }
      baseSumMinor = bs.toString();
      basePayedSumMinor = bp.toString();
      baseShippedSumMinor = bsh.toString();
    }

    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      shippedSumMinor: toStr(agg._sum.shippedSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
      // Base-currency (UZS) converted totals — populated only for mixed sets;
      // the FE footer shows these instead of «—» (footerMoneyCells baseValuesMinor).
      baseSumMinor,
      basePayedSumMinor,
      baseShippedSumMinor,
    };
  }

  /**
   * Shared WHERE builder for `list`. Extracted to mirror supply.service so
   * the InvoiceIn filter panel reaches moysklad «Счета поставщиков» parity
   * (~15 backed fields) without two-place drift. Keeps the accountId tenant
   * guard + deletedAt/includeDeleted soft-delete handling.
   */
  private buildListWhere(
    accountId: string,
    filter: InvoiceInFilterInput,
    // «Кто изменил» — InvoiceIn has NO modifiedById column, so list()/
    // aggregateTotals() pre-query the auditLog and pass the matched entityIds
    // here. When undefined the clause is absent. When the caller resolved
    // modifiedByIds to ZERO matches it passes `[]` so the result is forced
    // empty (id IN [] = nothing) rather than accidentally matching everything.
    extraIdFilter?: string[],
  ): Prisma.InvoiceInWhereInput {
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
    // «Входящая дата» period — filters on the supplier's document date.
    const incomingDateRange =
      filter.incomingDateFrom || filter.incomingDateTo
        ? {
            incomingDate: tashkentRangeBounds(filter.incomingDateFrom, filter.incomingDateTo),
          }
        : {};
    // «План. дата оплаты» period — filters on the planned payment date.
    const paymentPlannedRange =
      filter.paymentPlannedFrom || filter.paymentPlannedTo
        ? {
            paymentPlannedMoment: tashkentRangeBounds(
              filter.paymentPlannedFrom,
              filter.paymentPlannedTo,
            ),
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

    // moysklad-parity «Оплата» — cross-column compare via Prisma field
    // references (`fields.sumMinor`). sumMinor>0 is required so zero-amount
    // docs don't trivially match `paid`. Mirrors purchase-order.buildListWhere.
    const fields = this.prisma.client.invoiceIn.fields;
    const paymentClause: Prisma.InvoiceInWhereInput | null = (() => {
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

    // «Приемка» — cross-column on shippedSumMinor (received) vs sumMinor.
    // No `overdue` variant — InvoiceIn has no delivery-date concept.
    const receiveClause: Prisma.InvoiceInWhereInput | null = (() => {
      if (!filter.receiveState) return null;
      switch (filter.receiveState) {
        case 'shipped':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gte: fields.sumMinor } };
        case 'partiallyshipped':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gt: 0n, lt: fields.sumMinor } };
        case 'unshipped':
          return { shippedSumMinor: 0n };
      }
    })();

    // «Группа контрагента» (agent.groupId) + «Владелец контрагента»
    // (agent.ownerId), single AND multi, all narrow the SAME `agent` relation.
    // Merge them into ONE `agent:{}` clause — separate `...(x ? { agent: {…} }
    // : {})` spreads would collide on the `agent` key (object-literal
    // last-key-wins), silently dropping a predicate. Single + Ids on the same
    // sub-field are merged via spread (last-wins within the sub-object, which
    // is fine — the FE only ever sends one form per field).
    const agentSub = {
      ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
      ...(filter.agentGroupIds ? { groupId: { in: filter.agentGroupIds } } : {}),
      ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
      ...(filter.agentOwnerIds ? { ownerId: { in: filter.agentOwnerIds } } : {}),
    };
    const agentRelation = Object.keys(agentSub).length ? { agent: agentSub } : {};

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.agentIds
        ? { agentId: { in: filter.agentIds } }
        : filter.agentId
          ? { agentId: filter.agentId }
          : {}),
      ...agentRelation,
      ...(filter.agentAccountIds
        ? { agentAccountId: { in: filter.agentAccountIds } }
        : filter.agentAccountId
          ? { agentAccountId: filter.agentAccountId }
          : {}),
      ...(filter.organizationIds
        ? { organizationId: { in: filter.organizationIds } }
        : filter.organizationId
          ? { organizationId: filter.organizationId }
          : {}),
      ...(filter.organizationAccountIds
        ? { organizationAccountId: { in: filter.organizationAccountIds } }
        : filter.organizationAccountId
          ? { organizationAccountId: filter.organizationAccountId }
          : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.storeIds ? { storeId: { in: filter.storeIds } } : {}),
      ...(filter.purchaseOrderId ? { purchaseOrderId: filter.purchaseOrderId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.contractIds ? { contractId: { in: filter.contractIds } } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.projectIds ? { projectId: { in: filter.projectIds } } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.groupIds ? { groupId: { in: filter.groupIds } } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.ownerIds ? { ownerId: { in: filter.ownerIds } } : {}),
      ...(filter.productIds
        ? { positions: { some: { productId: { in: filter.productIds } } } }
        : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.incomingNumber
        ? { incomingNumber: { contains: filter.incomingNumber, mode: 'insensitive' } }
        : {}),
      ...(paymentClause ?? {}),
      ...(receiveClause ?? {}),
      ...momentRange,
      ...updatedRange,
      ...incomingDateRange,
      ...paymentPlannedRange,
      ...sumRange,
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { incomingNumber: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  /**
   * «Кто изменил» (modifiedByIds) — InvoiceIn has no modifiedById column, so we
   * approximate "last/ever modified by employee X" via the auditLog: find the
   * DISTINCT entityIds this account's InvoiceIn rows were `update`d on by any of
   * the requested users, and narrow the list to those ids. Returns `undefined`
   * when no modifiedByIds were requested (no narrowing), or `[]` when requested
   * but no audit rows match (forces an EMPTY result instead of match-all).
   * Remove this approximation once a real modifiedById column lands.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: InvoiceInFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedByIds?.length) return undefined;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'InvoiceIn',
        userId: { in: filter.modifiedByIds },
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  async findById(accountId: string, id: string) {
    const invoice = await this.prisma.client.invoiceIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        purchaseOrder: { select: { id: true, name: true, state: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!invoice) throw new NotFoundException(`InvoiceIn ${id} not found`);
    // «Владелец-отдел» (groupId) has NO Prisma relation on InvoiceIn — only the
    // scalar FK column — so the owner popover's department LABEL can't come from an
    // `include`. Resolve its name here (tenant-scoped) and attach it as `group` so the
    // detail page can pre-fill the «Отдел» picker (mirrors purchase-order.findById).
    const group = invoice.groupId
      ? await this.prisma.client.group.findFirst({
          where: { id: invoice.groupId, accountId },
          select: { id: true, name: true },
        })
      : null;
    return { ...invoice, group };
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the invoice's 1-based
   * position in the DEFAULT newest-first list (moment desc, id desc tiebreak) +
   * its neighbour ids, so the detail toolbar shows the REAL total and the arrows
   * walk the whole set even on a direct-URL visit (no list cache). Mirrors
   * purchase-order.findPosition.
   */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.invoiceIn.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`InvoiceIn ${id} not found`);

    // Default list WHERE (no filters), exactly as list() composes it.
    const where = this.buildListWhere(accountId, InvoiceInFilterSchema.parse({}));

    // Tuple comparisons for the default (moment desc, id desc) order.
    const aboveCurrent: Prisma.InvoiceInWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.InvoiceInWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.invoiceIn.count({ where }),
      this.prisma.client.invoiceIn.count({ where: { AND: [where, aboveCurrent] } }),
      // prevId = the row immediately ABOVE (position − 1): smallest tuple still
      // greater than current → ascending order, first row.
      this.prisma.client.invoiceIn.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      // nextId = the row immediately BELOW (position + 1): largest tuple still
      // smaller than current → descending order, first row.
      this.prisma.client.invoiceIn.findFirst({
        where: { AND: [where, belowCurrent] },
        orderBy: [{ moment: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return { current: above + 1, total, prevId: prev?.id ?? null, nextId: next?.id ?? null };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId);
    if (parsed.purchaseOrderId) {
      await this.ensurePurchaseOrder(accountId, parsed.purchaseOrderId);
    }
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );

    const name = await this.nextInvoiceName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'InvoiceIn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else fall back to the
    // creator + their dept). Tenant-validate the refs so a hand-crafted request
    // can't point ownerId/groupId at another account (mirrors the mass-edit guard
    // + purchase-order.create).
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
      const created = await this.prisma.client.invoiceIn.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          purchaseOrderId: parsed.purchaseOrderId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          storeId: parsed.storeId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          paymentPlannedMoment: parsed.paymentPlannedMoment
            ? new Date(parsed.paymentPlannedMoment)
            : null,
          incomingNumber: parsed.incomingNumber ?? null,
          incomingDate: parsed.incomingDate ? new Date(parsed.incomingDate) : null,
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
              purchaseOrderPositionId: p.purchaseOrderPositionId ?? null,
              quantity: p.quantity,
              priceMinor: BigInt(p.priceMinor),
              discount: p.discount ?? '0',
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.invoiceIn.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'invoicein', 'CREATE', created.id);
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async createFromPurchaseOrder(
    accountId: string,
    userId: string,
    purchaseOrderId: string,
    raw: unknown,
  ) {
    const parsed = CreateFromPurchaseOrderSchema.parse(raw ?? {});
    const order = await this.po.findById(accountId, purchaseOrderId);

    const positions = order.positions
      .map((pop) => {
        const want = parsed.quantities?.[pop.id] ?? String(pop.quantity);
        const wantNum = Number(want);
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
      throw new BadRequestException("Pozitsiyalar yo'q");
    }

    return this.create(accountId, userId, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      purchaseOrderId,
      paymentPlannedMoment: parsed.paymentPlannedMoment ?? null,
      incomingNumber: parsed.incomingNumber ?? null,
      incomingDate: parsed.incomingDate ?? null,
      vatEnabled: order.vatEnabled,
      vatIncluded: order.vatIncluded,
      currency: order.currency,
      rateValue: order.rateValue.toString(),
      positions,
    } satisfies CreateInvoiceInInput);
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    // moysklad keeps a POSTED («Проведено») supplier invoice fully editable (it
    // re-derives the mutual-settlement balance + PO invoiced-total on save). We do
    // the same: no hard posted-lock — the $transaction below REVERSES the old posting
    // side-effects and RE-APPLIES them with the new values (see the `existing.applicable`
    // branches). A CANCELLED invoice is the only non-editable state (mirrors FE `editable`).
    if (existing.state === 'cancelled') {
      throw new BadRequestException("Bekor qilingan fakturani o'zgartirib bo'lmaydi");
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

    const data: Prisma.InvoiceInUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    // moysklad allows changing currency/rate on a draft — schema accepts
    // them (.partial of Create); else silently dropped (§39 sibling).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.paymentPlannedMoment !== undefined) {
      data.paymentPlannedMoment = parsed.paymentPlannedMoment
        ? new Date(parsed.paymentPlannedMoment)
        : null;
    }
    if (parsed.incomingNumber !== undefined) data.incomingNumber = parsed.incomingNumber;
    if (parsed.incomingDate !== undefined) {
      data.incomingDate = parsed.incomingDate ? new Date(parsed.incomingDate) : null;
    }
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'InvoiceIn',
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
    if (parsed.storeId !== undefined) {
      data.store = parsed.storeId ? { connect: { id: parsed.storeId } } : { disconnect: true };
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

    // «Владелец» / «Владелец-отдел» / «Общий доступ» from the owner popover —
    // tenant-validate the refs (mirror purchase-order.update + the create guard) so
    // a hand-crafted request can't point ownerId/groupId at another account.
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
    if (parsed.shared !== undefined) data.shared = parsed.shared;

    if (parsed.positions !== undefined) {
      // Read-only data-building here; the destructive deleteMany is deferred
      // into the $transaction below so a version conflict (409) rolls back the
      // delete instead of leaving the positions destroyed (data corruption).
      // (Pre-existing bug: the deleteMany used to commit unconditionally
      // before the try block — moving it into the tx fixes that too.)
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          purchaseOrderPositionId: p.purchaseOrderPositionId ?? null,
          quantity: p.quantity,
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), update#1 touches zero rows → P2025
      // → the deleteMany rolls back, so the positions are NOT lost. ONLY
      // update#1 carries the version filter + increment; update#2 (totals)
      // stays keyed on {id, accountId} because update#1 already bumped the
      // row to N+1 (a version filter there would always miss → false-409).
      const saved = await this.prisma.client.$transaction(async (tx) => {
        // moysklad keeps a POSTED invoice editable. Posting applied two side-effects:
        // a balance delta (we owe the supplier) and, if linked, +PO.invoicedSumMinor.
        // REVERSE them with the OLD agent/currency/PO/sum so the recompute below can
        // RE-APPLY the NEW ones — keeping the agent balance + PO invoiced-total exact
        // for ANY change (sum, agent, currency, PO link). All inside the tx, so a
        // version conflict (409) rolls the reversal back too.
        if (existing.applicable) {
          await this.balance.applyDelta(
            tx,
            accountId,
            existing.agentId,
            existing.currency,
            existing.sumMinor, // undo the "we owe them" delta (post() applied -sum)
            { docType: 'invoiceIn', docId: id, organizationId: existing.organizationId },
          );
          if (existing.purchaseOrderId) {
            await this.po.applyInvoice(
              tx,
              accountId,
              existing.purchaseOrderId,
              existing.sumMinor,
              'revert',
            );
          }
        }

        if (parsed.positions !== undefined) {
          await tx.invoiceInPosition.deleteMany({ where: { invoiceInId: id, accountId } });
        }
        const updated = await tx.invoiceIn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );

        const finalData: Prisma.InvoiceInUpdateInput = { ...totals };
        if (existing.applicable) {
          const newAgentId = parsed.agentId ?? existing.agentId;
          const newCurrency = parsed.currency ?? existing.currency;
          const newPoId =
            parsed.purchaseOrderId !== undefined
              ? parsed.purchaseOrderId
              : existing.purchaseOrderId;
          await this.balance.applyDelta(tx, accountId, newAgentId, newCurrency, -totals.sumMinor, {
            docType: 'invoiceIn',
            docId: id,
            organizationId: effectiveOrgId,
          });
          if (newPoId) {
            await this.po.applyInvoice(tx, accountId, newPoId, totals.sumMinor, 'invoice');
          }
          // Re-derive the payment state from the unchanged payments vs the NEW sum
          // (mirrors recordPayment): paid / partially_paid / posted.
          const payed = existing.payedSumMinor;
          finalData.state =
            payed >= totals.sumMinor && totals.sumMinor > 0n
              ? 'paid'
              : payed > 0n
                ? 'partially_paid'
                : 'posted';
        }
        return tx.invoiceIn.update({ where: { id, accountId }, data: finalData });
      });
      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'invoicein', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'InvoiceIn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = InvoiceInTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: InvoiceInTransitionTarget = r.data;

    // M-01/DUP-01 — see payment-in.transition: Serializable + retry, and
    // `findById` re-read inside the closure so a retry never re-posts a
    // document a rival transaction already posted.
    const result = await withSerializationRetry(async () => {
      const existing = await this.findById(accountId, id);
      return target === 'post'
        ? this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? this.unpost(accountId, userId, id, existing)
          : this.cancel(accountId, userId, id, existing);
    });
    this.webhookFire.fireForEvent(accountId, 'invoicein', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    const invoice = await this.findById(accountId, id);
    if (invoice.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagi fakturani o'chirish mumkin");
    }
    await this.prisma.client.invoiceIn.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'invoicein', 'DELETE', id);
    return { ok: true };
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.invoiceIn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Faktura topilmadi');
    }
    const name = await this.nextInvoiceName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.invoiceIn.create({
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
        paymentPlannedMoment: null,
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
    this.webhookFire.fireForEvent(accountId, 'invoicein', 'CREATE', created.id);
    return created;
  }

  /**
   * moysklad «Создать → Исходящие платежи» (per selected invoice) — delegates
   * to PaymentOutService.createFromInvoiceIn, which builds a draft PaymentOut
   * pre-allocated against the invoice's unpaid remainder (with the operation
   * link so posting reduces the invoice debt). createFromInvoiceIn requires the
   * invoice to be posted / partially_paid — draft invoices throw (you can't pay
   * an un-posted invoice), and runBulk reports those as per-id failures.
   */
  async createPaymentOutFor(accountId: string, userId: string, invoiceInId: string) {
    return this.paymentOut.createFromInvoiceIn(accountId, userId, invoiceInId, {});
  }

  /**
   * moysklad «Создать → Расходные ордера» (per selected invoice) — creates one
   * draft CashOut covering the invoice's remaining balance. Mirrors
   * purchase-order.createCashOutFor: a bare draft (NO CashOutOperation link yet —
   * CashOutOperation.invoiceInId linkage is deferred), so posting it won't
   * auto-decrement InvoiceIn.payedSumMinor; the user links it from the CashOut
   * detail page. An audit entry flags the missing linkage.
   */
  async createCashOutFor(accountId: string, userId: string, invoiceInId: string) {
    const invoice = await this.prisma.client.invoiceIn.findFirst({
      where: { id: invoiceInId, accountId, deletedAt: null },
      select: {
        id: true,
        sumMinor: true,
        payedSumMinor: true,
        agentId: true,
        organizationId: true,
      },
    });
    if (!invoice) throw new NotFoundException(`InvoiceIn ${invoiceInId} not found`);
    const remaining = invoice.sumMinor - invoice.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException("Faktura to'liq to'langan — yangi RKO yaratib bo'lmaydi");
    }

    // Default CashDesk for the account (same heuristic as money-import / PO).
    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId },
      select: { id: true },
    });
    if (!cashDesk) {
      throw new BadRequestException('Hech qanday Kassa topilmadi — avval Kassa yarating');
    }

    const year = new Date().getFullYear();
    const prefix = `РО-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.cashOut.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;

    const cashOut = await this.prisma.client.cashOut.create({
      data: {
        accountId,
        ownerId: userId,
        name,
        agentId: invoice.agentId,
        organizationId: invoice.organizationId,
        cashDeskId: cashDesk.id,
        sumMinor: remaining,
        moment: new Date(),
        state: 'draft',
        applicable: false,
        paymentPurpose: `Счёт поставщика оплата (${invoice.id.slice(0, 8)})`,
      },
    });
    await this.logAudit(accountId, userId, 'create:cashout', cashOut.id, {
      sourceInvoiceInId: invoiceInId,
      sumMinor: remaining.toString(),
      missingOperationLink: true,
    });
    return cashOut;
  }

  /**
   * Apply a payment delta from PaymentOut.post / unpost / cancel (Sprint 4.3).
   *
   * Mirrors InvoiceOutService.applyPayment contract. Called from
   * PaymentOutService inside its $transaction.
   *
   * Contract:
   *   - Increments/decrements InvoiceIn.payedSumMinor
   *   - Auto-transitions state:
   *       payed >= sum           → paid
   *       0 < payed < sum        → partially_paid
   *       payed == 0 (full revert) → posted
   *   - Writes audit entry on state change
   *   - Cascades to PurchaseOrder.applyPayment when InvoiceIn is linked to
   *     a PO (purchaseOrderId set) — matches InvoiceOut→CO cascade chain.
   *     This keeps PO.payedSumMinor in sync even when the money flows
   *     through an InvoiceIn allocation rather than a direct PO advance.
   *
   * M-09 (Faza 3): atomic `{ increment }` + read-after — see the contract note
   * on `InvoiceOutService.applyPayment` for why the unlocked pre-read must not
   * feed the write.
   */
  async applyPayment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    invoiceInId: string,
    amountMinor: bigint,
    direction: 'apply' | 'revert',
  ): Promise<void> {
    const exists = await tx.invoiceIn.findFirst({
      where: { id: invoiceInId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`InvoiceIn ${invoiceInId} not found`);

    const sign = direction === 'apply' ? 1n : -1n;
    const invoice = await tx.invoiceIn.update({
      where: { id: invoiceInId, accountId },
      data: { payedSumMinor: { increment: amountMinor * sign } },
      select: {
        name: true,
        state: true,
        sumMinor: true,
        payedSumMinor: true,
        purchaseOrderId: true,
      },
    });

    const applicableStates = ['posted', 'partially_paid', 'paid'];
    if (!applicableStates.includes(invoice.state)) {
      throw new BadRequestException(
        `InvoiceIn ${invoice.name} holatida to'lovni qabul qilib bo'lmaydi (state=${invoice.state}). Oldin provedeno qiling.`,
      );
    }

    const newPayed = invoice.payedSumMinor;
    if (newPayed < 0n) {
      throw new BadRequestException("To'langan summa manfiy bo'la olmaydi");
    }
    const prevPayed = newPayed - amountMinor * sign;

    const currentState = invoice.state;
    let newState: string = currentState;
    if (newPayed >= invoice.sumMinor && invoice.sumMinor > 0n) {
      newState = 'paid';
    } else if (newPayed > 0n) {
      newState = 'partially_paid';
    } else {
      newState = 'posted';
    }

    if (newState !== currentState) {
      await tx.invoiceIn.update({
        where: { id: invoiceInId, accountId },
        data: { state: newState },
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceIn',
          entityId: invoiceInId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
            payedSumMinor: { before: prevPayed.toString(), after: newPayed.toString() },
          } as Prisma.InputJsonValue,
        },
      });
    }

    // Cascade to linked PurchaseOrder — PO owns its own payedSumMinor aggregate
    // and may auto-transition to `closed` once invoiced+received+paid triple
    // is complete (full closure activates when Sprint 4.4 lands the Supply
    // back-link for receivedSum).
    if (invoice.purchaseOrderId) {
      await this.po.applyPayment(
        tx,
        accountId,
        userId,
        invoice.purchaseOrderId,
        amountMinor,
        direction,
      );
    }
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceInService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }
    // Owner 2026-07-08: «Проведено» toggles freely — an empty doc may be posted
    // (0 positions ⇒ 0 stock delta; moysklad allows it). No position precondition.

    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard (M-01/DUP-01): atomically claim draft→posted as the FIRST
      // op — the loser of a double-«Провести» sees count 0 → 409, never a
      // second −sumMinor payable + PO.invoicedSum bump.
      await transitionWithClaim(tx.invoiceIn, {
        id,
        accountId,
        fromStates: ['draft'],
        toState: 'posted',
        message: "Faktura allaqachon o'tkazilgan yoki 'draft' holatida emas",
      });

      const updated = await tx.invoiceIn.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      // Supplier billed us → we owe them → -delta on balance (we're the debtor).
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        -existing.sumMinor,
        {
          source: 'invoiceIn',
          docType: 'invoiceIn',
          docId: id,
          organizationId: existing.organizationId,
        },
      );

      if (existing.purchaseOrderId) {
        await this.po.applyInvoice(
          tx,
          accountId,
          existing.purchaseOrderId,
          existing.sumMinor,
          'invoice',
        );
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceIn',
          entityId: id,
          action: 'transition:posted',
          fieldChanges: { from: { before: 'draft', after: 'posted' } } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceInService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }
    if (existing.payedSumMinor > 0n) {
      throw new BadRequestException("To'lov qilingan fakturani draft'ga qaytarib bo'lmaydi");
    }

    return this.prisma.client.$transaction(async (tx) => {
      await transitionWithClaim(tx.invoiceIn, {
        id,
        accountId,
        fromStates: ['posted'],
        toState: 'draft',
        message: "Faktura 'posted' holatida emas (allaqachon o'zgartirilgan)",
      });

      const updated = await tx.invoiceIn.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      // Revert: we no longer owe them.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
        { docType: 'invoiceIn', docId: id, organizationId: existing.organizationId },
      );

      if (existing.purchaseOrderId) {
        await this.po.applyInvoice(
          tx,
          accountId,
          existing.purchaseOrderId,
          existing.sumMinor,
          'revert',
        );
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceIn',
          entityId: id,
          action: 'transition:unposted',
          fieldChanges: {
            from: { before: 'posted', after: 'draft' },
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceInService['findById']>>,
  ) {
    if (existing.state === 'cancelled' || existing.state === 'paid') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → cancelled. Oldin cancel qilingan yoki to'liq to'langan`,
      );
    }
    if (existing.payedSumMinor > 0n) {
      throw new BadRequestException(
        "To'lov qilingan fakturani cancel qilib bo'lmaydi — avval refund kerak",
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      // cancel claims the EXACT snapshotted state so a concurrent unpost that
      // already flipped posted→draft can't be double-reversed here.
      await transitionWithClaim(tx.invoiceIn, {
        id,
        accountId,
        fromStates: [existing.state],
        toState: 'cancelled',
        message: "Faktura holati o'zgargan (allaqachon o'zgartirilgan)",
      });

      const wasApplicable = existing.applicable;
      const updated = await tx.invoiceIn.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      // Revert balance + PO.invoicedSumMinor only if we were applicable.
      if (wasApplicable) {
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          existing.sumMinor,
          { docType: 'invoiceIn', docId: id, organizationId: existing.organizationId },
        );
        if (existing.purchaseOrderId) {
          await this.po.applyInvoice(
            tx,
            accountId,
            existing.purchaseOrderId,
            existing.sumMinor,
            'revert',
          );
        }
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceIn',
          entityId: id,
          action: 'transition:cancelled',
          fieldChanges: {
            from: { before: existing.state, after: 'cancelled' },
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    }, MONEY_TX_OPTS);
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreateInvoiceInInput {
    const r = CreateInvoiceInSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateInvoiceInInput {
    const r = UpdateInvoiceInSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    agentId: string,
    organizationId: string,
  ): Promise<void> {
    const [agent, org] = await Promise.all([
      this.prisma.client.counterparty.findFirst({ where: { id: agentId, accountId } }),
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
    ]);
    if (!agent) throw new BadRequestException("Ta'minlovchi topilmadi");
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
  }

  private async ensurePurchaseOrder(accountId: string, purchaseOrderId: string): Promise<void> {
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new BadRequestException('PurchaseOrder topilmadi');
  }

  private async nextInvoiceName(accountId: string): Promise<string> {
    // moysklad-parity: documents carry a plain, continuous integer «Номер» — no
    // «СФ-YYYY-» prefix, no leading zeros — e.g. 1, 2, … (mirror purchase-order /
    // customer-order; the user flagged «СФ-2026-00056» as un-moysklad). The counter
    // key is year-less so the sequence never resets annually.
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'invoicein', async () => {
      // Lazy seed: highest existing TRAILING number across BOTH the new plain format
      // AND the legacy «СФ-YYYY-NNNNN» names, so the sequence CONTINUES (not restarts).
      const rows = await this.prisma.client.invoiceIn.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        // m[0] = the matched trailing digits (always a string); covers padded
        // «00001» and legacy «СФ-2026-00056».
        const m = r.name.match(/\d+$/);
        if (m) max = Math.max(max, Number.parseInt(m[0], 10) || 0);
      }
      return max;
    });
    // moysklad pads the «Номер» to 5 digits — «00001», «00877» (user-confirmed).
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
        k === 'owner' ||
        k === 'purchaseOrder'
      ) {
        continue;
      }
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        d[k] = { before: before[k], after: after[k] };
      }
    }
    return d;
  }

  /**
   * moysklad "Массовое редактирование" — patch ownerId / projectId /
   * description across selected rows. Metadata-only fields, editable even
   * when posted. Mirrors invoice-out.service.massEditApply. Tenant-guarded.
   */
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
    const updated = await this.prisma.client.invoiceIn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'invoicein', 'UPDATE', id, Object.keys(data));
    return updated;
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
        entity: 'InvoiceIn',
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
        `Bu qiymat bilan faktura allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}

// Type guard (unused re-export); keeps InvoiceInState import live.
export type { InvoiceInState };
