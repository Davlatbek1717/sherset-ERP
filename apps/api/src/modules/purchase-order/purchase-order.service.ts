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
import { PaymentOutService } from '../payment-out/payment-out.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { combineMergePositions } from '../shared/merge-positions.util.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreatePurchaseOrderInput,
  CreatePurchaseOrderSchema,
  type PurchaseOrderFilterInput,
  PurchaseOrderFilterSchema,
  type PurchaseOrderState,
  PurchaseOrderTransitionSchema,
  type PurchaseOrderTransitionTarget,
  type UpdatePurchaseOrderInput,
  UpdatePurchaseOrderSchema,
} from './purchase-order.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

@Injectable()
export class PurchaseOrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    // forwardRef breaks the PurchaseOrder ↔ PaymentOut module cycle
    // — PaymentOutService.applyPayment cascades back into
    // PurchaseOrderService.applyPayment, so they need each other at
    // construction time.
    @Inject(forwardRef(() => PaymentOutService))
    private readonly paymentOut: PaymentOutService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = PurchaseOrderFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // Map UI sort keys → Prisma orderBy expressions. Relational fields
    // need nested `{ agent: { name: dir } }`; everything else maps to
    // a direct column. A trailing `{ id: dir }` is a deterministic
    // tie-breaker: it stabilises cursor pagination AND — because the
    // 2026-06-18 «Номер» renumber walked rows in (moment, id) order — keeps
    // same-date rows in clean descending «Номер» order under the default
    // `moment desc` view (moysklad-parity: the list reads 2143, 2142, …).
    const orderBy = (() => {
      const dir = filter.sortDir;
      switch (filter.sortBy) {
        case 'agent':
          return [{ agent: { name: dir } }, { id: dir }];
        case 'organization':
          return [{ organization: { name: dir } }, { id: dir }];
        // «Номер» sort (the moysklad-default, arrow on the № header): `name` is
        // a plain-integer STRING, so a direct sort lexicographically misorders
        // «999» above «2143». The 2026-06-18 renumber assigned «Номер» in
        // (moment, id) order, so ordering by [moment, id] reproduces the exact
        // numeric «Номер» order without a raw cast or a denormalised int column.
        case 'name':
          return [{ moment: dir }, { id: dir }];
        // `state` lives directly on the PurchaseOrder row as an enum
        // string, NOT a relation, so direct field sort is correct.
        default:
          return [{ [filter.sortBy]: dir }, { id: dir }];
      }
    })();

    const rows = await this.prisma.client.purchaseOrder.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.purchaseOrder.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the order's 1-based
   * position in the default (newest-first) list plus its neighbour ids, so the
   * detail toolbar shows the REAL total and the arrows walk the WHOLE set even on
   * a direct-URL visit (no list cache). Mirrors CustomerOrder.findPosition.
   *
   * The ordering must match the list EXACTLY: the default sort is `name`/«Номер»
   * which the orderBy switch maps to `[{ moment: 'desc' }, { id: 'desc' }]` over
   * the default WHERE (`accountId`, `deletedAt: null`) — so the count the user
   * sees in the list and the position here never disagree. (PO has no H4
   * record-scope, unlike CustomerOrder — the tenant `accountId` is the only
   * scope.) In a descending (moment, id) order a row is ABOVE the current one (a
   * SMALLER position number) iff its tuple is strictly GREATER — hence
   * `position = count(tuple > current) + 1`; prev/next are the immediate neighbours.
   */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`PurchaseOrder ${id} not found`);

    // Default list WHERE (no filters), exactly as list() composes it.
    const filter = PurchaseOrderFilterSchema.parse({});
    const where = this.buildListWhere(accountId, filter);

    // Tuple comparisons for the default (moment desc, id desc) order.
    const aboveCurrent: Prisma.PurchaseOrderWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.PurchaseOrderWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.purchaseOrder.count({ where }),
      this.prisma.client.purchaseOrder.count({ where: { AND: [where, aboveCurrent] } }),
      // prevId = the row immediately ABOVE (position − 1): smallest tuple still
      // greater than current → ascending order, first row.
      this.prisma.client.purchaseOrder.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      // nextId = the row immediately BELOW (position + 1): largest tuple still
      // smaller than current → descending order, first row.
      this.prisma.client.purchaseOrder.findFirst({
        where: { AND: [where, belowCurrent] },
        orderBy: [{ moment: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return {
      current: above + 1,
      total,
      prevId: prev?.id ?? null,
      nextId: next?.id ?? null,
    };
  }

  /**
   * Build the list WHERE clause from a parsed filter. Shared by `list()`
   * and `aggregateTotals()` so the visible page and the all-pages totals
   * always agree on exactly which rows are in scope (search + date range +
   * sum range + every facet). Pure — no I/O.
   */
  private buildListWhere(
    accountId: string,
    filter: PurchaseOrderFilterInput,
  ): Prisma.PurchaseOrderWhereInput {
    const now = new Date();

    // moysklad-parity «Оплата» — cross-column compare via Prisma 5
    // field references (`fields.sumMinor`). Each derived state collapses
    // to a portable WHERE expression; sumMinor>0 is required to skip
    // zero-amount docs (which would all match `paid` trivially otherwise).
    const fields = this.prisma.client.purchaseOrder.fields;
    const paymentClause: Prisma.PurchaseOrderWhereInput | null = (() => {
      if (!filter.paymentState) return null;
      switch (filter.paymentState) {
        case 'paid':
          return {
            sumMinor: { gt: 0n },
            payedSumMinor: { gte: fields.sumMinor },
          };
        case 'partlyPaid':
          return {
            sumMinor: { gt: 0n },
            payedSumMinor: { gt: 0n, lt: fields.sumMinor },
          };
        case 'unpaid':
          return { payedSumMinor: 0n };
      }
    })();

    // «Приемка» — cross-column on receivedSumMinor vs sumMinor.
    const receiveClause: Prisma.PurchaseOrderWhereInput | null = (() => {
      if (!filter.receiveState) return null;
      switch (filter.receiveState) {
        case 'shipped':
          return {
            sumMinor: { gt: 0n },
            receivedSumMinor: { gte: fields.sumMinor },
          };
        case 'partiallyshipped':
          return {
            sumMinor: { gt: 0n },
            receivedSumMinor: { gt: 0n, lt: fields.sumMinor },
          };
        case 'unshipped':
          return { receivedSumMinor: 0n };
        case 'overdue':
          // Unshipped AND delivery date in the past
          return {
            receivedSumMinor: 0n,
            deliveryPlannedMoment: { lt: now, not: null },
          };
      }
    })();

    // moysklad-parity «Тип возврата» — depends on linked Supply →
    // PurchaseReturn. We approximate via a JOIN to supplies.
    //   noReturn → no Supply with linked PurchaseReturn
    //   return   → exists Supply linked to a PurchaseReturn
    //   mixed    → reserved for partial; same WHERE shape as 'return'
    //              for now (the differentiation needs a sum compare
    //              across the return chain that we don't track yet —
    //              follow-up sprint will refine).
    const returnClause: Prisma.PurchaseOrderWhereInput | null = (() => {
      if (!filter.returnState) return null;
      switch (filter.returnState) {
        case 'noReturn':
          // PO has supplies but none of them have PurchaseReturn rows.
          return {
            supplies: {
              none: { purchaseReturns: { some: {} } },
            },
          };
        case 'return':
        case 'mixed':
          return {
            supplies: {
              some: { purchaseReturns: { some: {} } },
            },
          };
      }
    })();

    const where: Prisma.PurchaseOrderWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.states ? { state: { in: filter.states } } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.agentGroupIds ? { agent: { groupId: { in: filter.agentGroupIds } } } : {}),
      ...(filter.agentOwnerId ? { agent: { ownerId: filter.agentOwnerId } } : {}),
      ...(filter.agentOwnerIds ? { agent: { ownerId: { in: filter.agentOwnerIds } } } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.storeIds ? { storeId: { in: filter.storeIds } } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.ownerIds ? { ownerId: { in: filter.ownerIds } } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.groupIds ? { groupId: { in: filter.groupIds } } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.projectIds ? { projectId: { in: filter.projectIds } } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.contractIds ? { contractId: { in: filter.contractIds } } : {}),
      ...(filter.modifiedById ? { modifiedById: filter.modifiedById } : {}),
      ...(filter.modifiedByIds ? { modifiedById: { in: filter.modifiedByIds } } : {}),
      ...(filter.productId ? { positions: { some: { productId: filter.productId } } } : {}),
      ...(filter.productIds
        ? { positions: { some: { productId: { in: filter.productIds } } } }
        : {}),
      ...(paymentClause ?? {}),
      ...(receiveClause ?? {}),
      ...(returnClause ?? {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
          }
        : {}),
      ...(filter.deliveryFrom || filter.deliveryTo
        ? {
            deliveryPlannedMoment: tashkentRangeBounds(filter.deliveryFrom, filter.deliveryTo),
          }
        : {}),
      ...(filter.updatedFrom || filter.updatedTo
        ? {
            updatedAt: tashkentRangeBounds(filter.updatedFrom, filter.updatedTo),
          }
        : {}),
      ...(filter.sumMinorFrom !== undefined || filter.sumMinorTo !== undefined
        ? {
            sumMinor: {
              ...(filter.sumMinorFrom !== undefined ? { gte: BigInt(filter.sumMinorFrom) } : {}),
              ...(filter.sumMinorTo !== undefined ? { lte: BigInt(filter.sumMinorTo) } : {}),
            },
          }
        : {}),
    };

    return where;
  }

  /**
   * Compute aggregate totals over the same WHERE clause the list uses,
   * but across ALL matching rows (not just the current page). Returns
   * the money-column sums + the row count — the list footer renders
   * them as the «Показать итоги» panel.
   *
   * Reuses the parsed filter (via buildListWhere) so totals always match
   * exactly what the user is currently viewing (search + date + sum range).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = PurchaseOrderFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.purchaseOrder.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          invoicedSumMinor: true,
          payedSumMinor: true,
          receivedSumMinor: true,
          shippedSumMinor: true,
          waitSumMinor: true,
        },
      }),
      // Distinct document currencies in the filtered set — lets the pinned
      // footer show «—» instead of a meaningless mixed-currency sum (sumMinor
      // is stored in each doc's OWN currency, never normalised to a base).
      // Mirrors customer-order; single currency (the common case) → exact total.
      this.prisma.client.purchaseOrder.groupBy({ by: ['currency'], where }),
    ]);

    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      invoicedSumMinor: toStr(agg._sum.invoicedSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      receivedSumMinor: toStr(agg._sum.receivedSumMinor),
      shippedSumMinor: toStr(agg._sum.shippedSumMinor),
      waitSumMinor: toStr(agg._sum.waitSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  async findById(accountId: string, id: string) {
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        owner: { select: { id: true, name: true, email: true } },
        // moysklad «Статус» — account-defined custom status (State row). null
        // until the admin defines statuses + assigns one (grey «Статус» pill).
        status: { select: { id: true, name: true, color: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    // «Владелец-отдел» (groupId) has NO Prisma relation on PurchaseOrder — only the
    // scalar FK column — so the owner popover's department LABEL can't come from an
    // `include`. Resolve its name here (tenant-scoped) and attach it as `group` so the
    // detail page can pre-fill the «Отдел» picker (mirrors CustomerOrder.findById).
    const group = order.groupId
      ? await this.prisma.client.group.findFirst({
          where: { id: order.groupId, accountId },
          select: { id: true, name: true },
        })
      : null;
    return { ...order, group };
  }

  /**
   * moysklad «Связанные документы» — every document created from this purchase
   * order. Used by the detail page's related-docs diagram. Mirror of
   * CustomerOrder.findRelated, with the PO's downstream chain:
   *   - Приёмки      → Supply.purchaseOrderId (direct FK)
   *   - Счета постав. → InvoiceIn.purchaseOrderId (direct FK)
   *   - Платежи      → PaymentOut via PaymentOutOperation.purchaseOrderId
   *   - Возвраты     → PurchaseReturn via its Supply's purchaseOrderId
   * Each type is fetched in parallel; an error on one doesn't poison the others.
   */
  async findRelated(accountId: string, id: string) {
    // Existence guard so we don't leak related docs from another tenant.
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundException(`PurchaseOrder ${id} not found`);

    const select = { id: true, name: true, moment: true, state: true, sumMinor: true } as const;

    const [supplies, invoicesIn, paymentOps, purchaseReturns] = await Promise.all([
      this.prisma.client.supply.findMany({
        where: { accountId, purchaseOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      this.prisma.client.invoiceIn.findMany({
        where: { accountId, purchaseOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      // PaymentOut links through PaymentOutOperation (no direct FK on PaymentOut).
      this.prisma.client.paymentOutOperation.findMany({
        where: { accountId, purchaseOrderId: id },
        select: { paymentOutId: true },
      }),
      // PurchaseReturn links to a Supply, which carries the purchaseOrderId.
      this.prisma.client.purchaseReturn.findMany({
        where: { accountId, deletedAt: null, supply: { purchaseOrderId: id } },
        select,
        orderBy: { moment: 'asc' },
      }),
    ]);

    const paymentOutIds = [...new Set(paymentOps.map((o) => o.paymentOutId))];
    const paymentsOut = paymentOutIds.length
      ? await this.prisma.client.paymentOut.findMany({
          where: { id: { in: paymentOutIds }, accountId, deletedAt: null },
          select,
          orderBy: { moment: 'asc' },
        })
      : [];

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
      supplies: supplies.map(toDto),
      invoicesIn: invoicesIn.map(toDto),
      paymentsOut: paymentsOut.map(toDto),
      purchaseReturns: purchaseReturns.map(toDto),
    };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );

    // Editable «№» from the create form — auto-generate only when left blank.
    const name = parsed.name?.trim() || (await this.nextOrderName(accountId));

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'PurchaseOrder',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else fall back to the
    // creator + their dept). Tenant-validate the refs so a hand-crafted request
    // can't point ownerId/groupId at another account (mirrors the mass-edit guard).
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
    // «Статус» — tenant-validate the custom status (mirrors setStatus) so a bad id
    // is a 400, not a silent miss. Orthogonal to the FSM state («Проведён»).
    if (parsed.statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: parsed.statusId, accountId, entityType: 'purchaseorder', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${parsed.statusId}`);
    }

    // «Проведён» checkbox (default ON in the create form): create the order
    // already posted so «Создать документ» is usable immediately. Confirming a PO
    // has NO stock side-effects (only state/applicable/postedAt — mirrors confirm()),
    // so it is safe to set directly on create. Positions are guaranteed ≥1 by schema.
    const posted = parsed.applicable === true;

    try {
      const created = await this.prisma.client.purchaseOrder.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          deliveryPlannedMoment: parsed.deliveryPlannedMoment
            ? new Date(parsed.deliveryPlannedMoment)
            : null,
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          vatEnabled: parsed.vatEnabled,
          vatIncluded: parsed.vatIncluded,
          waiting: parsed.waiting,
          attributes: attributes as Prisma.InputJsonValue,
          state: posted ? 'confirmed' : 'draft',
          applicable: posted,
          postedAt: posted ? new Date() : null,
          // Scalar FK (unchecked create — mirrors accountId/agentId/ownerId above);
          // the status is tenant-validated just above.
          ...(parsed.statusId ? { statusId: parsed.statusId } : {}),
          positions: {
            create: parsed.positions.map((p, idx) => ({
              accountId,
              position: idx + 1,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              productId: p.assortmentKind === 'product' ? p.assortmentId : null,
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
      const saved = await this.prisma.client.purchaseOrder.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'CREATE', created.id);
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    // moysklad keeps a posted («Проведено») order fully editable — posting a PO
    // only flips a flag (confirm() sets applicable=true, NO stock/reservation), so
    // editing is safe. Block only a cancelled order, and an order that already has
    // Приёмки (receivedSumMinor>0): positions are delete+recreated below and
    // SupplyPosition links to the position id (onDelete SetNull) + carries a
    // per-position receivedQty, so re-linking received goods is a separate task.
    if (existing.state === 'cancelled') {
      throw new BadRequestException("Bekor qilingan zakazni o'zgartirib bo'lmaydi");
    }
    if (existing.receivedSumMinor > 0n) {
      throw new BadRequestException(
        "Qabul boshlangan zakazni o'zgartirib bo'lmaydi — avval Priyomkani bekor qiling",
      );
    }

    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    // moysklad allows changing currency/rate on a draft — schema accepts
    // them (.partial of Create); else silently dropped (§39 sibling).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.waiting !== undefined) data.waiting = parsed.waiting;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.deliveryPlannedMoment !== undefined) {
      data.deliveryPlannedMoment = parsed.deliveryPlannedMoment
        ? new Date(parsed.deliveryPlannedMoment)
        : null;
    }
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
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
    // Editable document «№» on the detail form. Apply only a non-empty value (the
    // column is NOT nullable + autogenerated on create). A duplicate number hits
    // @@unique([accountId, name]) → P2002 → 409 via the global PrismaExceptionFilter,
    // so no pre-check is needed here (mirrors CustomerOrder.update).
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      data.name = parsed.name.trim();
    }
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — editable on the detail form
    // too. The create path already persists them, but update() never wrote them even
    // though the (partial) schema accepts them — so a changed owner / department /
    // shared flag silently vanished (the rateValue bug-class). Both refs are
    // tenant-validated (mirror create) before the relation connect / scalar set.
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
      // `group` has no Prisma relation field on PurchaseOrder — only the scalar FK
      // column — so set it directly (owner does have a relation, used above). null
      // clears the «Владелец-отдел» (department), matching the popover's ✕.
      data.groupId = parsed.groupId ?? null;
    }
    if (parsed.shared !== undefined) {
      data.shared = parsed.shared;
    }
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'PurchaseOrder',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so
      // a version conflict (409) rolls back the delete instead of leaving the
      // positions destroyed (data corruption) — Class A optimistic-lock.
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          quantity: p.quantity,
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
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

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), update#1 touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. Update#1
      // bumps version to N+1; update#2 (totals) is keyed on {id,accountId}
      // with NO version filter — the row is already at N+1 so a version filter
      // would always miss and false-409.
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.purchaseOrderPosition.deleteMany({ where: { purchaseOrderId: id, accountId } });
        }
        const updated = await tx.purchaseOrder.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.purchaseOrder.update({
          where: { id, accountId },
          data: totals,
        });
      });
      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'PurchaseOrder');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = PurchaseOrderTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: confirm | unconfirm | cancel`,
      );
    }
    const target: PurchaseOrderTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'confirm'
        ? await this.confirm(accountId, userId, id, existing)
        : target === 'unconfirm'
          ? await this.unconfirm(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    const order = await this.findById(accountId, id);
    if (order.applicable) {
      throw new BadRequestException("Provedeno zakazni o'chirib bo'lmaydi");
    }
    await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'DELETE', id);
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
    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Zakaz topilmadi');
    }
    const name = await this.nextOrderName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.purchaseOrder.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        moment: new Date(),
        deliveryPlannedMoment: null,
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
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'CREATE', created.id);
    return created;
  }

  /**
   * moysklad-parity «Изменить ▸ Объединить» — combine N selected orders into one
   * NEW purchase order. Live-grounded 2026-06-18 (online.moysklad.uz): selecting
   * ≥2 orders → «Объединить» opens a draft holding every selected order's
   * positions; the originals are untouched.
   *
   * Compromise vs moysklad (user-approved): moysklad opens an UNSAVED draft in
   * the /new editor; we PERSIST a draft and return its id so the FE lands the
   * user on its detail page (the /new editor is owned by a parallel work-stream).
   * Behaviour is otherwise 1:1 — draft state, originals untouched, positions
   * combined.
   *
   * The header is taken WHOLE from the primary order (earliest by moment) so the
   * FK set stays internally consistent (org-account ↔ org, agent-account ↔
   * agent); the user adjusts the counterparty on the detail page, mirroring
   * moysklad which blanks it when sources differ. Positions are combined via
   * {@link combineMergePositions} (identical lines summed, others kept separate).
   * Totals are RECOMPUTED from the combined set — never summed from headers.
   *
   * Money-integrity guards (a PO header is single-valued): all sources must share
   * currency + VAT mode (vatEnabled/vatIncluded). Mixed sets are rejected — the
   * same priceMinor would mean different things under a different mode, so the
   * combined totals could not be represented faithfully.
   */
  async merge(accountId: string, userId: string, ids: string[]): Promise<{ id: string }> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Birlashtirish uchun kamida 2 ta buyurtma tanlang');
    }
    const sources = await this.prisma.client.purchaseOrder.findMany({
      where: { id: { in: uniqueIds }, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    // TOCTOU: a source deleted between selection and merge → fewer rows → reject
    // rather than silently merge a partial set.
    if (sources.length !== uniqueIds.length) {
      throw new BadRequestException(
        "Tanlangan buyurtmalarning ba'zilari topilmadi yoki o'chirilgan",
      );
    }
    if (new Set(sources.map((s) => s.currency)).size > 1) {
      throw new BadRequestException("Turli valyutadagi buyurtmalarni birlashtirib bo'lmaydi");
    }
    if (new Set(sources.map((s) => `${s.vatEnabled}|${s.vatIncluded}`)).size > 1) {
      throw new BadRequestException(
        "Turli QQS sozlamalaridagi buyurtmalarni birlashtirib bo'lmaydi",
      );
    }

    // Primary = earliest order (deterministic, id-tiebroken); carry its whole
    // header. `reduce` over the (guaranteed ≥2) sources yields a non-nullable
    // row — no empty-array / non-null-assertion concerns.
    const primary = sources.reduce((earliest, s) => {
      const d = s.moment.getTime() - earliest.moment.getTime();
      if (d < 0) return s;
      if (d === 0 && s.id < earliest.id) return s;
      return earliest;
    });
    const combined = combineMergePositions(sources);
    const totals = this.computeTotals(combined, primary.vatEnabled, primary.vatIncluded);

    try {
      const name = await this.nextOrderName(accountId);
      const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
      const created = await this.prisma.client.purchaseOrder.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: primary.agentId,
          organizationId: primary.organizationId,
          storeId: primary.storeId,
          contractId: primary.contractId,
          projectId: primary.projectId,
          organizationAccountId: primary.organizationAccountId,
          agentAccountId: primary.agentAccountId,
          externalCode: null,
          moment: new Date(),
          deliveryPlannedMoment: null,
          description: primary.description,
          // Carry the primary order's custom attributes (доп.поля) — they were
          // already validated/normalized when the primary was created, so a
          // required attribute stays satisfied (unlike a blank {}). We do NOT
          // re-validate here: that could throw if the metadata changed and block
          // the merge outright; the user lands on the editable draft, and
          // posting (draft→confirm) re-enforces required attributes.
          attributes: (primary.attributes ?? {}) as Prisma.InputJsonValue,
          currency: primary.currency,
          rateValue: primary.rateValue,
          vatEnabled: primary.vatEnabled,
          vatIncluded: primary.vatIncluded,
          state: 'draft',
          applicable: false,
          sumMinor: totals.sumMinor,
          vatSumMinor: totals.vatSumMinor,
          positions: {
            create: combined.map((p, idx) => ({
              accountId,
              position: idx + 1,
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
      await this.logAudit(accountId, userId, 'merge', created.id, { sourceIds: uniqueIds });
      this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'CREATE', created.id);
      return { id: created.id };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * moysklad-parity «Поставить в ожидание» / «Снять ожидание» —
   * flips the manual `waiting` flag on a PurchaseOrder. Distinct from
   * waitSumMinor (auto-derived from PaymentOutOperations); this is a
   * UI-driven on-hold marker the user toggles via bulk action.
   *
   * No FSM-state side-effects — the row stays in whatever state it
   * was; only the `waiting` boolean changes. Audit log captures the
   * flip so we can trace bulk overrides.
   */
  async setWaiting(accountId: string, userId: string, id: string, waiting: boolean) {
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, waiting: true },
    });
    if (!order) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    if (order.waiting === waiting) {
      // No-op — return the existing row to keep bulk responses uniform
      return this.prisma.client.purchaseOrder.findFirst({ where: { id, accountId } });
    }
    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { waiting, modifiedById: userId },
    });
    await this.logAudit(accountId, userId, waiting ? 'set:waiting' : 'clear:waiting', id, {
      from: { before: order.waiting, after: waiting },
    });
    this.webhookFire.fireForEvent(accountId, 'purchaseorder', 'UPDATE', id, ['waiting']);
    return updated;
  }

  /**
   * moysklad-parity «Создать → Исходящие платежи» bulk action — for a
   * single PO, creates one PaymentOut covering the remaining unpaid
   * balance (sumMinor − payedSumMinor). Throws if balance is zero or
   * negative (over-paid). Caller (controller bulk endpoint) wraps
   * this in `runBulk` for partial-success reporting.
   */
  async createPaymentOutFor(accountId: string, userId: string, purchaseOrderId: string) {
    const po = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: { id: true, sumMinor: true, payedSumMinor: true, state: true },
    });
    if (!po) throw new NotFoundException(`PurchaseOrder ${purchaseOrderId} not found`);
    const remaining = po.sumMinor - po.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException("PO to'liq to'langan — yangi PaymentOut yaratib bo'lmaydi");
    }
    return this.paymentOut.createFromPurchaseOrderAdvance(accountId, userId, purchaseOrderId, {
      sumMinor: remaining.toString(),
    });
  }

  /**
   * moysklad-parity «Создать → Расходные ордера» — for a single PO,
   * creates one CashOut covering the remaining balance. The CashOut
   * is created without a CashOutOperation linkage to the PO (because
   * CashOutOperation.purchaseOrderId is not yet wired in the schema —
   * deferred to a follow-up sprint). Until that lands, posting the
   * CashOut won't auto-decrement PO.payedSumMinor; user must manually
   * link it from the CashOut detail page.
   *
   * Returns a partial draft so the bulk action still produces visible
   * documents; an audit-log entry flags the missing linkage.
   */
  async createCashOutFor(accountId: string, userId: string, purchaseOrderId: string) {
    const po = await this.prisma.client.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: {
        id: true,
        sumMinor: true,
        payedSumMinor: true,
        agentId: true,
        organizationId: true,
        state: true,
      },
    });
    if (!po) throw new NotFoundException(`PurchaseOrder ${purchaseOrderId} not found`);
    const remaining = po.sumMinor - po.payedSumMinor;
    if (remaining <= 0n) {
      throw new BadRequestException("PO to'liq to'langan — yangi CashOut yaratib bo'lmaydi");
    }

    // Pick a default CashDesk for the org (same heuristic as the
    // money-import: first non-archived CashDesk on the account).
    const cashDesk = await this.prisma.client.cashDesk.findFirst({
      where: { accountId },
      select: { id: true },
    });
    if (!cashDesk) {
      throw new BadRequestException('Hech qanday Kassa topilmadi — avval Kassa yarating');
    }

    // Generate the CashOut name via the existing sequence pattern. We
    // delegate the heavy lifting (name allocation, audit, webhook) to
    // the standard CashOut.create flow by emitting a minimal payload.
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'cashout', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
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
        agentId: po.agentId,
        organizationId: po.organizationId,
        cashDeskId: cashDesk.id,
        sumMinor: remaining,
        moment: new Date(),
        state: 'draft',
        applicable: false,
        paymentPurpose: `Заказ поставщику оплата (${po.id.slice(0, 8)})`,
      },
    });
    await this.logAudit(accountId, userId, 'create:cashout', cashOut.id, {
      sourcePurchaseOrderId: purchaseOrderId,
      sumMinor: remaining.toString(),
      // Flag for follow-up sprint: this CashOut has no operation
      // linking it back to the PO. Manual linkage required.
      missingOperationLink: true,
    });
    return cashOut;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async confirm(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseOrderService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → confirmed. Faqat draft'dan`,
      );
    }
    if (existing.positions.length === 0) {
      throw new BadRequestException("Pozitsiyalar yo'q — provedeno qilib bo'lmaydi");
    }

    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { state: 'confirmed', applicable: true, postedAt: new Date() },
    });

    await this.logAudit(accountId, userId, 'transition:confirmed', id, {
      from: { before: 'draft', after: 'confirmed' },
    });
    return updated;
  }

  private async unconfirm(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseOrderService['findById']>>,
  ) {
    if (existing.state !== 'confirmed') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → draft. Faqat confirmed'dan`,
      );
    }
    if (existing.receivedSumMinor > 0n) {
      throw new BadRequestException(
        "Qismi qabul qilingan zakazni draft'ga qaytarib bo'lmaydi — avval Priyomka bekor qilinsin",
      );
    }

    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { state: 'draft', applicable: false, postedAt: null },
    });

    await this.logAudit(accountId, userId, 'transition:draft', id, {
      from: { before: 'confirmed', after: 'draft' },
    });
    return updated;
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<PurchaseOrderService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }
    if (existing.receivedSumMinor > 0n || existing.payedSumMinor > 0n) {
      throw new BadRequestException("Qabul yoki to'lov bor zakazni cancel qilib bo'lmaydi");
    }
    if (existing.invoicedSumMinor > 0n) {
      throw new BadRequestException(
        "Faktura yozilgan zakazni cancel qilib bo'lmaydi — avval InvoiceIn'larni cancel qiling",
      );
    }

    const updated = await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { state: 'cancelled', applicable: false },
    });

    await this.logAudit(accountId, userId, 'transition:cancelled', id, {
      from: { before: existing.state, after: 'cancelled' },
    });
    return updated;
  }

  /**
   * Apply an invoice delta from InvoiceIn.post / unpost / cancel.
   *
   * Contract (called from InvoiceInService, inside its $transaction):
   *   - tx: caller's transaction client
   *   - direction: 'invoice' adds amount to PO.invoicedSumMinor,
   *                'revert'  subtracts
   *   - amountMinor: invoice gross sum to add/remove
   *
   * Sprint 4.2 scope: updates only `invoicedSumMinor` on the linked PurchaseOrder.
   * State transitions to `closed` require the full triple (invoiced AND received
   * AND paid), which activates once PaymentOut (Sprint 4.3) and
   * Supply.purchaseOrderId back-link (Sprint 4.x) land. Until then, we keep the
   * aggregate correct so those later sprints can flip the state with accurate
   * data.
   */
  async applyInvoice(
    tx: Prisma.TransactionClient,
    accountId: string,
    purchaseOrderId: string,
    amountMinor: bigint,
    direction: 'invoice' | 'revert',
  ): Promise<void> {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: { id: true, invoicedSumMinor: true },
    });
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${purchaseOrderId} not found`);
    }
    const sign = direction === 'invoice' ? 1n : -1n;
    const newInvoiced = order.invoicedSumMinor + amountMinor * sign;
    if (newInvoiced < 0n) {
      throw new BadRequestException(
        "PO fakturlashtirilgan summasi manfiy bo'la olmaydi — revert qiymati ortiqcha",
      );
    }
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId, accountId },
      data: { invoicedSumMinor: { increment: amountMinor * sign } },
    });
  }

  /**
   * Apply a payment delta to PurchaseOrder.payedSumMinor (Sprint 4.3).
   *
   * Called either:
   *   - From InvoiceInService.applyPayment (cascade through linked InvoiceIn)
   *   - Directly from PaymentOutService (advance payment against the PO,
   *     before an InvoiceIn has been issued)
   *
   * Sprint 4.3 scope: updates only `payedSumMinor` on the linked PurchaseOrder.
   * Auto-transition to `closed` requires the full triple
   * (invoicedSum >= sum AND receivedSum >= sum AND payedSum >= sum), which
   * activates when Sprint 4.4 (Supply.purchaseOrderId back-link) lands. Until
   * then, we keep the aggregate accurate so 4.4 can flip state correctly.
   *
   * Bookkeeping-only: no money ledger write here. That belongs to
   * Sprint 5 (OrganizationAccount / CashDesk balance tracking).
   */
  async applyPayment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    purchaseOrderId: string,
    amountMinor: bigint,
    direction: 'apply' | 'revert',
  ): Promise<void> {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      select: {
        id: true,
        state: true,
        sumMinor: true,
        payedSumMinor: true,
        invoicedSumMinor: true,
        receivedSumMinor: true,
      },
    });
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${purchaseOrderId} not found`);
    }

    const sign = direction === 'apply' ? 1n : -1n;
    const newPayed = order.payedSumMinor + amountMinor * sign;
    if (newPayed < 0n) {
      throw new BadRequestException(
        "PO to'langan summasi manfiy bo'la olmaydi — revert qiymati ortiqcha",
      );
    }

    // Evaluate auto-transition to `closed`. Requires the full triple:
    //   invoicedSum >= sum AND receivedSum >= sum AND payedSum >= sum.
    // Sprint 4.3: receivedSum is always 0 until Supply.purchaseOrderId lands
    // (Sprint 4.4), so `closed` will not fire yet even with perfect invoice+
    // payment match. This is intentional — we don't want to close a PO whose
    // goods haven't arrived. When 4.4 lands, this same code path will start
    // closing POs automatically.
    const fullyPaid = newPayed >= order.sumMinor && order.sumMinor > 0n;
    const fullyInvoiced = order.invoicedSumMinor >= order.sumMinor && order.sumMinor > 0n;
    const fullyReceived = order.receivedSumMinor >= order.sumMinor && order.sumMinor > 0n;

    const currentState = order.state;
    let newState: string | null = null;
    if (fullyPaid && fullyInvoiced && fullyReceived) {
      const closeableFrom = ['confirmed', 'partially_received', 'fully_received'];
      if (closeableFrom.includes(currentState)) newState = 'closed';
    } else if (!fullyPaid && currentState === 'closed') {
      // revert: was closed, now not fully paid
      newState = fullyReceived ? 'fully_received' : 'confirmed';
    }

    const updateData: Prisma.PurchaseOrderUpdateInput = { payedSumMinor: newPayed };
    if (newState && newState !== currentState) {
      updateData.state = newState;
    }

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId, accountId },
      data: updateData,
    });

    if (newState && newState !== currentState) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PurchaseOrder',
          entityId: purchaseOrderId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
            trigger: 'payment',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  /**
   * Apply a receipt delta from Supply (Sprint 4.4).
   *
   * Called from SupplyService.post when the supply has a `purchaseOrderId`
   * back-link. Increments PO.receivedSumMinor + per-position receivedQty,
   * then re-evaluates state. Direction='receive' adds; 'revert' subtracts
   * (called from Supply unpost / cancel).
   *
   * Auto-state-transitions:
   *   - all positions receivedQty >= quantity → fully_received
   *   - any received but not all → partially_received
   *   - additionally, fully_received + invoicedSum >= sum + payedSum >= sum
   *     → closed (full triple, matching applyPayment logic)
   *   - revert that empties everything → confirmed
   *
   * Audit on state change with `trigger: 'receipt'`.
   */
  async applyReceipt(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    purchaseOrderId: string,
    deltas: Array<{ positionId: string; qtyDelta: string; valueMinor: bigint }>,
    direction: 'receive' | 'revert',
  ): Promise<void> {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, accountId, deletedAt: null },
      include: { positions: true },
    });
    if (!order) {
      throw new NotFoundException(`PurchaseOrder ${purchaseOrderId} not found`);
    }

    const sign = direction === 'receive' ? 1 : -1;
    const signBig = direction === 'receive' ? 1n : -1n;

    // 1. Per-position receivedQty deltas
    for (const d of deltas) {
      const pos = order.positions.find((p) => p.id === d.positionId);
      if (!pos) {
        throw new BadRequestException(
          `Position ${d.positionId} not found on PurchaseOrder ${purchaseOrderId}`,
        );
      }
      const delta = Number(d.qtyDelta) * sign;
      await tx.purchaseOrderPosition.update({
        where: { id: d.positionId },
        data: { receivedQty: { increment: delta } },
      });
    }

    // 2. Aggregate header receivedSum
    const totalDelta = deltas.reduce((acc, d) => acc + d.valueMinor, 0n) * signBig;
    const newReceived = order.receivedSumMinor + totalDelta;
    if (newReceived < 0n) {
      throw new BadRequestException(
        "PO qabul qilingan summasi manfiy bo'la olmaydi — revert qiymati ortiqcha",
      );
    }

    // 3. Re-evaluate state
    const freshPositions = await tx.purchaseOrderPosition.findMany({
      where: { purchaseOrderId, accountId },
    });
    const allReceived = freshPositions.every((p) => {
      const qty = Number(String(p.quantity));
      const got = Number(String(p.receivedQty));
      return qty > 0 && got >= qty;
    });
    const anyReceived = freshPositions.some((p) => Number(String(p.receivedQty)) > 0);

    const fullyReceived = allReceived && anyReceived;
    const fullyInvoiced = order.invoicedSumMinor >= order.sumMinor && order.sumMinor > 0n;
    const fullyPaid = order.payedSumMinor >= order.sumMinor && order.sumMinor > 0n;

    const currentState = order.state;
    let newState: string | null = null;

    if (fullyReceived && fullyInvoiced && fullyPaid) {
      const closeableFrom = ['confirmed', 'partially_received', 'fully_received'];
      if (closeableFrom.includes(currentState)) newState = 'closed';
    } else if (fullyReceived) {
      const transitableFrom = ['confirmed', 'partially_received'];
      if (transitableFrom.includes(currentState)) newState = 'fully_received';
    } else if (anyReceived) {
      const transitableFrom = ['confirmed'];
      if (transitableFrom.includes(currentState)) newState = 'partially_received';
    } else {
      // revert: nothing received anymore
      if (currentState === 'partially_received' || currentState === 'fully_received') {
        newState = 'confirmed';
      } else if (currentState === 'closed') {
        newState = 'confirmed';
      }
    }

    const updateData: Prisma.PurchaseOrderUpdateInput = { receivedSumMinor: newReceived };
    if (newState && newState !== currentState) {
      updateData.state = newState;
    }

    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId, accountId },
      data: updateData,
    });

    if (newState && newState !== currentState) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'PurchaseOrder',
          entityId: purchaseOrderId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
            trigger: 'receipt',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private parseCreate(raw: unknown): CreatePurchaseOrderInput {
    const r = CreatePurchaseOrderSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdatePurchaseOrderInput {
    const r = UpdatePurchaseOrderSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
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

  private async nextOrderName(accountId: string): Promise<string> {
    // moysklad-parity: documents carry a plain, continuous integer «Номер» —
    // no «ЗК-2026-» prefix, no leading zeros — e.g. 1, 2, … 2143. (We used to
    // emit `ЗК-${year}-NNNNN`, which the user flagged as un-moysklad: moysklad
    // shows «999», not «ЗК-2026-00062».) The counter key is year-less so the
    // sequence never resets annually — moysklad keeps one running number.
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'purchaseorder',
      async () => {
        // Lazy seed (only when the counter row is absent — the 2026-06-18
        // renumber migration pre-seeds it for existing accounts, so this runs
        // only for fresh accounts → 0 → first name "1"): highest existing
        // pure-integer name.
        const rows = await this.prisma.client.purchaseOrder.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          const v = Number.parseInt(r.name, 10);
          if (Number.isInteger(v) && String(v) === r.name) max = Math.max(max, v);
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

  /**
   * moysklad «Статус» — set the account-defined custom status (State row,
   * entityType="purchaseorder") on a single PO. Orthogonal to the FSM `state`
   * + «Проведено»: it touches NEITHER, so — unlike {@link update} — it works on
   * a POSTED order too (moysklad lets you re-label a posted document's status,
   * and applies it immediately, not on save). `statusId: null` clears the pill.
   * The target is validated against the account's State table (tenant +
   * entityType + non-archived) so a bad id is a 400, not a silent miss. Returns
   * the refreshed document (with the resolved `status`) for the FE cache.
   */
  async setStatus(accountId: string, userId: string, id: string, statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'purchaseorder', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    const order = await this.prisma.client.purchaseOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { statusId: true },
    });
    if (!order) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    await this.prisma.client.purchaseOrder.update({
      where: { id, accountId },
      data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
    });
    await this.logAudit(accountId, userId, 'set-status', id, {
      status: { before: order.statusId, after: statusId },
    });
    return this.findById(accountId, id);
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
        entity: 'PurchaseOrder',
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
        `Bu qiymat bilan zakaz allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}

// Export state type for external consumers
export type { PurchaseOrderState };
