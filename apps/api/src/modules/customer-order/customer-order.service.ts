import { Prisma } from '@moysklad/db';
import { computePositionTotal } from '@moysklad/money';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AttributeType } from '../attribute-metadata/attribute-metadata.schema.js';
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { type CustomerOrderCreatedEvent, HR_EVENT } from '../hr/hr-shared/hr-events.types.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { runBulk } from '../shared/bulk.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant, assertStateInTenant } from '../shared/mass-edit.js';
import { combineMergePositions } from '../shared/merge-positions.util.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  assertAgentAccountMatchesAgent,
  assertOrgAccountMatchesOrg,
} from '../shared/org-account.js';
import { StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type AttrFilterClause,
  type CreateCustomerOrderInput,
  CreateCustomerOrderSchema,
  type CustomerOrderFilter,
  CustomerOrderFilterSchema,
  type OrderState,
  type UpdateCustomerOrderInput,
  UpdateCustomerOrderSchema,
} from './customer-order.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

@Injectable()
export class CustomerOrderService {
  private readonly logger = new Logger(CustomerOrderService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  async list(accountId: string, userId: string, rawFilter: unknown) {
    const filter = CustomerOrderFilterSchema.parse(rawFilter);
    const attrTypes = await this.attrTypeMap(accountId, filter.attrs);
    const taskDueOrderIds = await this.resolveTaskDueOrderIds(accountId, filter);
    const returnStatusOrderIds = await this.resolveReturnStatusOrderIds(accountId, filter);
    const baseWhere = this.buildListWhere(
      accountId,
      filter,
      attrTypes,
      taskDueOrderIds,
      returnStatusOrderIds,
    );
    // H4 record-scope (RFC W4): AND the per-record visibility filter. No-op until
    // the account opts in — recordScopeWhere returns {} when the flag is off (or
    // the actor's scope is ALL), so today's behaviour is unchanged.
    const scoped = await this.permissions.recordScopeWhere(
      accountId,
      userId,
      'customerorder',
      'view',
    );
    const where =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;

    // Map UI sort keys → Prisma orderBy expressions. Relational fields
    // need nested `{ agent: { name: dir } }`; everything else maps to a
    // direct column. Mirrors purchase-order.service so the sortable
    // `agent` / `organization` headers don't 400 the request.
    const orderBy = (() => {
      const dir = filter.sortDir;
      // trailing `{ id: dir }` — deterministic tie-breaker (stable cursor
      // pagination + clean descending «Номер» for same-date rows, since the
      // 2026-06-18 renumber walked rows in (moment, id) order). Mirrors PO.
      switch (filter.sortBy) {
        case 'agent':
          return [{ agent: { name: dir } }, { id: dir }];
        case 'organization':
          return [{ organization: { name: dir } }, { id: dir }];
        default:
          return [{ [filter.sortBy]: dir }, { id: dir }];
      }
    })();

    const rows = await this.prisma.client.customerOrder.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        // Account-defined custom «Статус» — drives the list's status column
        // (else the cell falls back to the FSM `state` badge). Matches
        // findById's include so the column renders identically everywhere.
        status: { select: { id: true, name: true, color: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.customerOrder.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad «Столбцы» (new-design kanban) — the customer-order list grouped
   * into one column per account custom «Статус». Each column carries the status
   * meta (id/name/color), the total order count in that status (respecting the
   * SAME filter/search + record-scope as the flat list), and the first page of
   * cards. Orders with no custom status are omitted — matching moysklad's
   * status-grouped board, which only renders the defined statuses as columns.
   *
   * The WHERE is composed exactly like list() (buildListWhere + record-scope)
   * so switching «Список ↔ Столбцы» never changes which orders are in scope;
   * each column just ANDs `{ statusId }` on top. Cards select only what the
   * board renders (№/date/Контрагент/Сумма/Валюта/owner + a positions count
   * for the 📦 badge) — lighter than the full list include.
   */
  async kanban(accountId: string, userId: string, rawFilter: unknown) {
    const filter = CustomerOrderFilterSchema.parse(rawFilter);
    const attrTypes = await this.attrTypeMap(accountId, filter.attrs);
    const taskDueOrderIds = await this.resolveTaskDueOrderIds(accountId, filter);
    const returnStatusOrderIds = await this.resolveReturnStatusOrderIds(accountId, filter);
    const baseWhere = this.buildListWhere(
      accountId,
      filter,
      attrTypes,
      taskDueOrderIds,
      returnStatusOrderIds,
    );
    const scoped = await this.permissions.recordScopeWhere(
      accountId,
      userId,
      'customerorder',
      'view',
    );
    const where =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;

    // Columns = the account's custom order statuses, ordered exactly like the
    // board: by the status' own `position` (moysklad's status sort order), with
    // createdAt as a stable tiebreaker for statuses left at the default
    // position 0. NB: ordering by `id` would be random here — ids are UUIDs.
    const statuses = await this.prisma.client.state.findMany({
      where: { accountId, entityType: 'customerorder', archived: false },
      select: { id: true, name: true, color: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    const CARDS_PER_COLUMN = 25;
    const columns = await Promise.all(
      statuses.map(async (status) => {
        const columnWhere = { AND: [where, { statusId: status.id }] };
        const [total, rows] = await Promise.all([
          this.prisma.client.customerOrder.count({ where: columnWhere }),
          this.prisma.client.customerOrder.findMany({
            where: columnWhere,
            // Newest-first, matching the board (05.07 17:23 above 05.07 16:56)
            // and the flat list's default (moment, id) descending order.
            orderBy: [{ moment: 'desc' }, { id: 'desc' }],
            take: CARDS_PER_COLUMN,
            select: {
              id: true,
              name: true,
              moment: true,
              sumMinor: true,
              currency: true,
              agent: { select: { id: true, name: true } },
              owner: { select: { id: true, name: true } },
              _count: { select: { positions: true } },
            },
          }),
        ]);
        return {
          status,
          total,
          items: rows.map((r) => ({
            id: r.id,
            name: r.name,
            moment: r.moment,
            // BigInt → string for JSON (sumMinor is in the doc's OWN currency).
            sumMinor: r.sumMinor.toString(),
            currency: r.currency,
            agent: r.agent ? { id: r.agent.id, name: r.agent.name } : null,
            owner: r.owner ? { id: r.owner.id, name: r.owner.name } : null,
            positionsCount: r._count.positions,
          })),
        };
      }),
    );
    return { columns };
  }

  async findById(accountId: string, id: string) {
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        salesChannel: { select: { id: true, name: true } },
        status: { select: { id: true, name: true, color: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        owner: { select: { id: true, name: true, email: true } },
        positions: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                article: true,
                uom: true,
                weightG: true,
                volumeML: true,
                // Main image id only (not the bytes) → «Изображение» thumbnail via
                // GET /images/:id/raw. Main first, else lowest position.
                images: {
                  orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!order) throw new NotFoundException(`CustomerOrder ${id} not found`);
    // «Владелец-отдел» (groupId) has NO Prisma relation on CustomerOrder — only
    // the scalar FK column — so the owner popover's department LABEL can't come
    // from an `include`. Resolve its name here (tenant-scoped) and attach it as
    // `group` so the detail page can pre-fill the «Отдел» picker.
    const group = order.groupId
      ? await this.prisma.client.group.findFirst({
          where: { id: order.groupId, accountId },
          select: { id: true, name: true },
        })
      : null;
    return { ...order, group };
  }

  /**
   * Lightweight per-record visibility gate (H4 record-scope, RFC W4) — loads
   * only the {ownerId, groupId, shared} triple and asserts the actor may see
   * this order. Out-of-scope (or non-existent) rows are hidden as 404 (no
   * existence leak). No-op until the account opts in (assertRecordAccess returns
   * true when the flag is off or the actor's scope is ALL). Gates the
   * single-record read endpoints (GET, /related, /supply-shortfall, bulk-print).
   */
  async assertReadable(accountId: string, userId: string, id: string): Promise<void> {
    const row = await this.prisma.client.customerOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { ownerId: true, groupId: true, shared: true },
    });
    if (!row) throw new NotFoundException(`CustomerOrder ${id} not found`);
    const allowed = await this.permissions.assertRecordAccess(
      accountId,
      userId,
      'customerorder',
      'view',
      { ownerId: row.ownerId, groupId: row.groupId, shared: row.shared },
    );
    if (!allowed) throw new NotFoundException(`CustomerOrder ${id} not found`);
  }

  /**
   * Read-path findById WITH record-scope enforcement (RFC W4) — used by the GET
   * detail endpoint. Asserts visibility first (404 on deny), then returns the
   * full order. Internal write-path loads keep using the plain findById above
   * (write-scope enforcement is a later RFC phase).
   */
  async findByIdScoped(accountId: string, userId: string, id: string) {
    await this.assertReadable(accountId, userId, id);
    return this.findById(accountId, id);
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the document's 1-based
   * position in the default list order plus the neighbouring ids, so the detail
   * page shows the REAL total (e.g. «1 из 31023») and the ‹ › walk the WHOLE
   * ordered set, not just a cached list page. Computed entirely server-side so it
   * works even when the user lands via a direct URL (no list cache).
   *
   * The ordering must match the list EXACTLY: default `[{ moment: 'desc' },
   * { id: 'desc' }]` over the same default WHERE (`accountId`, `deletedAt: null`)
   * + H4 record-scope — so the count the user sees in the list and the position
   * here never disagree. In a descending (moment, id) order, a row is ABOVE the
   * current one (a SMALLER position number) iff its tuple is strictly GREATER —
   * hence `position = count(tuple > current) + 1`. prev/next are the immediate
   * neighbours in that order.
   */
  async findPosition(accountId: string, userId: string, id: string) {
    const current = await this.prisma.client.customerOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`CustomerOrder ${id} not found`);

    // Replicate the list's DEFAULT where (no filters) + record-scope, exactly as
    // list() composes it — so «N из TOTAL» mirrors the unfiltered, newest-first
    // list the navigator implies.
    const filter = CustomerOrderFilterSchema.parse({});
    const baseWhere = this.buildListWhere(accountId, filter, new Map());
    const scoped = await this.permissions.recordScopeWhere(
      accountId,
      userId,
      'customerorder',
      'view',
    );
    const where: Prisma.CustomerOrderWhereInput =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;

    // Tuple comparisons for the default (moment desc, id desc) order.
    const aboveCurrent: Prisma.CustomerOrderWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.CustomerOrderWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.customerOrder.count({ where }),
      this.prisma.client.customerOrder.count({ where: { AND: [where, aboveCurrent] } }),
      // prevId = the row immediately ABOVE (position − 1): the smallest tuple
      // still greater than current → ascending order, first row.
      this.prisma.client.customerOrder.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      // nextId = the row immediately BELOW (position + 1): the largest tuple
      // still smaller than current → descending order, first row.
      this.prisma.client.customerOrder.findFirst({
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
   * «Заказ поставщику с учётом доступно» — supply-shortfall basis for creating
   * a purchase order from this customer order. For every PRODUCT position,
   * compute what the order's store can't currently cover:
   *   available = max(0, Stock.qty − Stock.reservedQty)   (in the order's store)
   *   shortfall = orderedQty − available
   * and return only the rows with shortfall > 0, their quantity set to the
   * shortfall. Services/bundles/variants aren't stocked here, so they're
   * dropped. Same {organization, store, positions} shape as the plain order
   * fetch so the /new pre-fill consumes either uniformly.
   */
  async getSupplyShortfall(accountId: string, id: string) {
    const order = await this.findById(accountId, id);
    const productPositions = order.positions.filter((p) => p.assortmentKind === 'product');
    const availByProduct = new Map<string, number>();
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
        availByProduct.set(s.assortmentId, Math.max(0, Number(s.qty) - Number(s.reservedQty)));
      }
    }
    const positions = productPositions
      .map((p) => {
        const available = availByProduct.get(p.assortmentId) ?? 0;
        const shortfall = Number(p.quantity) - available;
        return { p, shortfall };
      })
      .filter(({ shortfall }) => shortfall > 0)
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

  /**
   * Reverse-lookup of docs that point at this order via a nullable
   * `customerOrderId` FK. Used by the detail page's "Связанные
   * документы" tab. Each doc type is fetched in parallel; errors on
   * one type don't poison the others.
   *
   * Returns the doc summaries (id / name / moment / state / sumMinor)
   * the RelatedDocsTab card needs — full details are reachable via
   * the per-entity GET endpoints when the user clicks a card.
   */
  /**
   * Compute aggregate totals over the same WHERE clause the list
   * uses, but across ALL matching rows (not just the current page).
   * Returns the sum of money columns + the row count — the UI
   * displays them as a "Показать итоги" panel below the list.
   *
   * The query reuses the parsed filter so totals match exactly what
   * the user is currently viewing (including search + date range +
   * sum range).
   */
  async aggregateTotals(accountId: string, userId: string, rawFilter: unknown) {
    const filter = CustomerOrderFilterSchema.parse(rawFilter);
    // Reuse the exact same WHERE the list uses so totals match the
    // visible filter set (the two were previously hand-duplicated and
    // could drift — now they share buildListWhere). Record-scope is ANDed
    // in identically so the footer never sums orders the user can't see.
    const attrTypes = await this.attrTypeMap(accountId, filter.attrs);
    const taskDueOrderIds = await this.resolveTaskDueOrderIds(accountId, filter);
    const returnStatusOrderIds = await this.resolveReturnStatusOrderIds(accountId, filter);
    const baseWhere = this.buildListWhere(
      accountId,
      filter,
      attrTypes,
      taskDueOrderIds,
      returnStatusOrderIds,
    );
    const scoped = await this.permissions.recordScopeWhere(
      accountId,
      userId,
      'customerorder',
      'view',
    );
    const where =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;

    const [result, currencyGroups] = await Promise.all([
      this.prisma.client.customerOrder.aggregate({
        where,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          payedSumMinor: true,
          invoicedSumMinor: true,
          shippedSumMinor: true,
          reservedSumMinor: true,
        },
        _count: { _all: true },
      }),
      // Distinct document currencies in the filtered set — lets the pinned
      // footer show «—» instead of a meaningless USD+UZS sum (sumMinor is in
      // each doc's OWN currency). Single-currency (the common case) → exact total.
      this.prisma.client.customerOrder.groupBy({ by: ['currency'], where }),
    ]);

    return {
      count: result._count._all,
      sumMinor: (result._sum.sumMinor ?? 0n).toString(),
      vatSumMinor: (result._sum.vatSumMinor ?? 0n).toString(),
      payedSumMinor: (result._sum.payedSumMinor ?? 0n).toString(),
      invoicedSumMinor: (result._sum.invoicedSumMinor ?? 0n).toString(),
      shippedSumMinor: (result._sum.shippedSumMinor ?? 0n).toString(),
      reservedSumMinor: (result._sum.reservedSumMinor ?? 0n).toString(),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  async findRelated(accountId: string, id: string) {
    // Existence guard so we don't leak related docs from another tenant.
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundException(`CustomerOrder ${id} not found`);

    const select = {
      id: true,
      name: true,
      moment: true,
      state: true,
      sumMinor: true,
    } as const;

    // moysklad «Связанные документы»: every doc created from this order via
    // «Создать документ». demands/invoicesOut link via the backend conversion;
    // prepayments/moves link via the customerOrderId set on create-from-order.
    // (payment-in/cash-in have no customerOrder FK yet — future sprint.)
    const [demands, invoicesOut, prepayments, moves] = await Promise.all([
      this.prisma.client.demand.findMany({
        where: { accountId, customerOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      this.prisma.client.invoiceOut.findMany({
        where: { accountId, customerOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      this.prisma.client.prepayment.findMany({
        where: { accountId, customerOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
      this.prisma.client.move.findMany({
        where: { accountId, customerOrderId: id, deletedAt: null },
        select,
        orderBy: { moment: 'asc' },
      }),
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
      demands: demands.map(toDto),
      invoicesOut: invoicesOut.map(toDto),
      prepayments: prepayments.map(toDto),
      moves: moves.map(toDto),
    };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const name = parsed.name ?? (await this.nextOrderName(accountId));

    // Validate references + scope to account
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    await this.ensureAssortmentsInTenant(accountId, parsed.positions);
    await this.ensureOptionalRefs(accountId, {
      contractId: parsed.contractId,
      projectId: parsed.projectId,
      salesChannelId: parsed.salesChannelId,
      statusId: parsed.statusId,
    });

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'CustomerOrder',
      parsed.attributes,
    );

    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId ?? null,
    );
    // Same money-routing guard for the counterparty bank account (was an
    // unguarded scalar FK — a cross-counterparty/cross-tenant account could persist).
    await assertAgentAccountMatchesAgent(
      this.prisma.client,
      accountId,
      parsed.agentId,
      parsed.agentAccountId ?? null,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    // moysklad assigns every new order the account's DEFAULT custom «Статус»
    // (the first by position, e.g. «Текширилмаган») so the list column is never
    // blank — replicate that when the form didn't pick one explicitly.
    const statusId = parsed.statusId ?? (await this.resolveDefaultStatusId(accountId));

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

    try {
      const created = await this.prisma.client.customerOrder.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          externalCode: parsed.externalCode,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
          statusId,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          ...(parsed.currency ? { currency: parsed.currency } : {}),
          // Persist the document FX rate the form sent (else the DB default rate
          // 1.0 silently applies → non-UZS orders mis-valued in base currency).
          ...(parsed.rateValue !== undefined ? { rateValue: parsed.rateValue } : {}),
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          deliveryPlannedMoment: parsed.deliveryPlannedMoment
            ? new Date(parsed.deliveryPlannedMoment)
            : null,
          // «Адрес доставки» — the create schema accepts both the single-line and
          // the structured address, but create() never wrote them, so the address
          // the user filled on /new silently vanished on save (the same
          // drop-on-create bug-class as rateValue/owner). update() already
          // persists them; mirror that here.
          shipmentAddress: parsed.shipmentAddress ?? null,
          shipmentAddressFull:
            (parsed.shipmentAddressFull as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
          description: parsed.description,
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
              quantity: p.quantity,
              priceMinor: p.priceMinor,
              discount: p.discount,
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.customerOrder.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      // Per-line «Зарезерв.» the form requested (editable reserve column). No-op
      // unless a line asked for >0, so plain saves don't touch stock. Reads the
      // just-created positions fresh + reserves atomically (own Serializable tx).
      await this.reserveRequestedLines(accountId, userId, created.id, parsed.positions);

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'customerorder', 'CREATE', created.id);
      // Post-commit: HR Telegram bridge listener renders + queues a buyurtma
      // qabul qilindi notification for the counterparty.
      const payload: CustomerOrderCreatedEvent = {
        accountId,
        customerOrderId: saved.id,
        counterpartyId: saved.agentId,
        totalMinor: saved.sumMinor,
        createdAt: saved.createdAt ?? new Date(),
      };
      this.events.emit(HR_EVENT.CUSTOMER_ORDER_CREATED, payload);
      // «Проведено» on save — confirm the order (state→confirmed, applicable=true)
      // via the SAME verified transition path the detail «Провести» uses. The
      // draft is already committed; a failed confirm surfaces its error with the
      // draft saved (moysklad parity). Was a silent no-op before this.
      if (parsed.applicable) {
        return await this.transition(accountId, userId, created.id, 'confirmed');
      }
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    // moysklad parity: a posted («Проведён») order stays EDITABLE — you change
    // fields/positions and save, and it remains posted (no «Snyat provedeno» step).
    // Safe here because the wholesale position replace below re-runs in a single
    // transaction and `reserveRequestedLines({always:true})` re-applies the hold
    // (release-then-reapply), so the reserve never desyncs. (We previously blocked
    // agent/org/store/positions edits on a posted order; moysklad does not.)

    // Same tenant guard as create for the optional header refs (each is a
    // relation connect below with no accountId scoping). No-op for absent refs.
    await this.ensureOptionalRefs(accountId, {
      contractId: parsed.contractId,
      projectId: parsed.projectId,
      salesChannelId: parsed.salesChannelId,
      statusId: parsed.statusId,
    });

    const data: Prisma.CustomerOrderUpdateInput = {};
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    // Editable document «№» on the detail form. Apply only a non-empty value
    // (the column is NOT nullable + autogenerated on create). A duplicate
    // number hits @@unique([accountId, name]) → P2002 → 409 via the global
    // PrismaExceptionFilter, so no pre-check is needed here.
    if (typeof parsed.name === 'string' && parsed.name.trim() !== '') {
      data.name = parsed.name.trim();
    }
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
    if (parsed.salesChannelId !== undefined) {
      data.salesChannel = parsed.salesChannelId
        ? { connect: { id: parsed.salesChannelId } }
        : { disconnect: true };
    }
    if (parsed.statusId !== undefined) {
      data.status = parsed.statusId ? { connect: { id: parsed.statusId } } : { disconnect: true };
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
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — editable on the detail
    // form too. The create path already persists them, but update() never wrote
    // them even though the (partial) schema accepts them — so a changed owner /
    // department / shared flag silently vanished (the rateValue bug-class). Both
    // refs are tenant-validated (mirror create) before the relation connect.
    if (parsed.ownerId !== undefined) {
      // null ⇒ clear the owner (the popover's ✕); a non-null id is tenant-validated
      // before the connect. owner has a relation, so disconnect/connect (not scalar).
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
      // `group` has no Prisma relation field on CustomerOrder — only the scalar
      // FK column — so set it directly (owner does have a relation, used above).
      // null clears the «Владелец-отдел» (department), matching the popover's ✕.
      data.groupId = parsed.groupId ?? null;
    }
    if (parsed.shared !== undefined) {
      data.shared = parsed.shared;
    }
    if (parsed.currency !== undefined) {
      data.currency = parsed.currency;
    }
    if (parsed.rateValue !== undefined) {
      data.rateValue = parsed.rateValue;
    }
    if (parsed.shipmentAddress !== undefined) {
      data.shipmentAddress = parsed.shipmentAddress;
    }
    if (parsed.shipmentAddressFull !== undefined) {
      data.shipmentAddressFull =
        (parsed.shipmentAddressFull as Prisma.InputJsonValue | null) ?? Prisma.JsonNull;
    }
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'CustomerOrder',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    if (parsed.positions !== undefined) {
      // Same tenant guard as create — a replaced position set must not smuggle in
      // a cross-tenant / nonexistent service/bundle/variant id (no FK on those).
      await this.ensureAssortmentsInTenant(accountId, parsed.positions);
      // Position writes happen as a DIFF-UPSERT inside the $transaction below
      // (see there) — NOT a nested wholesale create here.
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
    // Counterparty bank-account money-routing guard (mirror of the org check),
    // against the effective agent + agent-account after this patch.
    const effectiveAgentId = parsed.agentId ?? existing.agentId;
    const effectiveAgentAccountId =
      parsed.agentAccountId !== undefined ? parsed.agentAccountId : existing.agentAccountId;
    await assertAgentAccountMatchesAgent(
      this.prisma.client,
      accountId,
      effectiveAgentId,
      effectiveAgentAccountId,
    );

    try {
      // Class A: all child-row writes + the version-guarded header update run
      // in ONE Serializable tx. Write order is POSITIONS FIRST, header LAST —
      // the same order every other CO writer uses (applyShipment,
      // runReservationSet, adjustReservationForShipment), so no AB-BA lock
      // cycle against a concurrent Отгрузка post/unpost (adversarial review).
      // An optimistic-lock miss on the final header update (P2025) rolls the
      // whole tx back, so positions are never lost on a version conflict.
      // Serializable read-check-write conflicts (P2034, incl. PG deadlocks)
      // are retried like the reservation txs.
      const runUpdateTx = () =>
        this.prisma.client.$transaction(
          async (tx) => {
            if (parsed.positions !== undefined) {
              // DIFF-UPSERT (adversarial review, pre-existing CRIT class): the
              // old wholesale delete+recreate reset every line's shippedQty to
              // 0 and dangled DemandPosition.customerOrderPositionId (onDelete
              // SetNull) — after which a linked demand could never be un-posted
              // and the reservation invariant over-held re-posted orders.
              // Payload lines carrying `id` update their existing row IN PLACE
              // (identity, shippedQty and doc links survive); id-less lines are
              // created; existing rows absent from the payload are deleted.
              // Guards: a line cannot be removed while ANY live Отгрузка/Счёт
              // line still links to it (a draft link would SetNull-dangle and
              // its posting would then ship with zero feedback to the order —
              // silent double-ship); a shipped line cannot change product; and
              // quantity cannot drop below shipped + posted-return qty (a
              // posted возврат lowers shippedQty NON-monotonically — un-posting
              // it re-adds the returned qty, so the floor must include it or
              // shippedQty > quantity becomes reachable).
              const existingPositions = await tx.customerOrderPosition.findMany({
                where: { customerOrderId: id, accountId },
              });
              const existingById = new Map(existingPositions.map((p) => [p.id, p]));
              const keptIds = new Set<string>();
              for (const p of parsed.positions) {
                if (!p.id) continue;
                const ex = existingById.get(p.id);
                if (!ex) {
                  throw new BadRequestException(`Position ${p.id} not found on this order`);
                }
                if (keptIds.has(p.id)) {
                  throw new BadRequestException(`Duplicate position id ${p.id}`);
                }
                keptIds.add(p.id);
              }
              // Posted-return quantity per kept line (floor component).
              const returnedByPos = new Map<string, number>();
              if (keptIds.size > 0) {
                const srLines = await tx.salesReturnPosition.findMany({
                  where: {
                    accountId,
                    demandPosition: { customerOrderPositionId: { in: [...keptIds] } },
                    salesReturn: { applicable: true, deletedAt: null },
                  },
                  select: {
                    quantity: true,
                    demandPosition: { select: { customerOrderPositionId: true } },
                  },
                });
                for (const sr of srLines) {
                  const pid = sr.demandPosition?.customerOrderPositionId;
                  if (pid) {
                    returnedByPos.set(pid, (returnedByPos.get(pid) ?? 0) + Number(sr.quantity));
                  }
                }
              }
              for (const p of parsed.positions) {
                if (!p.id) continue;
                // biome-ignore lint/style/noNonNullAssertion: id membership validated above
                const ex = existingById.get(p.id)!;
                const shipped = Number(ex.shippedQty);
                const returned = returnedByPos.get(p.id) ?? 0;
                const floor = shipped + returned;
                if (floor > 0) {
                  if (
                    ex.assortmentId !== p.assortmentId ||
                    ex.assortmentKind !== p.assortmentKind
                  ) {
                    throw new BadRequestException(
                      "Jo'natilgan qatorning tovarini o'zgartirib bo'lmaydi",
                    );
                  }
                  if (p.quantity < floor) {
                    throw new BadRequestException(
                      returned > 0
                        ? `Miqdor jo'natilgan + qaytarilgan miqdordan (${floor}) kam bo'lishi mumkin emas`
                        : "Miqdor jo'natilgan miqdordan kam bo'lishi mumkin emas",
                    );
                  }
                }
              }
              const removedIds = existingPositions
                .filter((ex) => !keptIds.has(ex.id))
                .map((ex) => ex.id);
              if (removedIds.length > 0) {
                for (const ex of existingPositions) {
                  if (!keptIds.has(ex.id) && Number(ex.shippedQty) > 0) {
                    throw new BadRequestException(
                      "Jo'natilgan qatorni o'chirib bo'lmaydi — avval Otgruzkani bekor qiling",
                    );
                  }
                }
                const [linkedDemands, linkedInvoices] = await Promise.all([
                  tx.demandPosition.count({
                    where: {
                      customerOrderPositionId: { in: removedIds },
                      demand: { deletedAt: null },
                    },
                  }),
                  tx.invoiceOutPosition.count({
                    where: {
                      customerOrderPositionId: { in: removedIds },
                      invoiceOut: { deletedAt: null },
                    },
                  }),
                ]);
                if (linkedDemands + linkedInvoices > 0) {
                  throw new BadRequestException(
                    "Qator Otgruzka/Schyotga bog'langan — avval o'sha hujjatdagi qatorni oling",
                  );
                }
                await tx.customerOrderPosition.deleteMany({
                  where: { customerOrderId: id, accountId, id: { in: removedIds } },
                });
              }
              for (const [idx, p] of parsed.positions.entries()) {
                const rowData = {
                  position: idx + 1,
                  assortmentKind: p.assortmentKind,
                  assortmentId: p.assortmentId,
                  productId: p.assortmentKind === 'product' ? p.assortmentId : null,
                  quantity: p.quantity,
                  priceMinor: p.priceMinor,
                  discount: p.discount,
                  vat: p.vat ?? null,
                  vatEnabled: p.vatEnabled,
                };
                if (p.id) {
                  // id validated above to belong to THIS order (tenant-safe).
                  await tx.customerOrderPosition.update({ where: { id: p.id }, data: rowData });
                } else {
                  await tx.customerOrderPosition.create({
                    data: { ...rowData, accountId, customerOrderId: id },
                  });
                }
              }
            }

            const freshPositions = await tx.customerOrderPosition.findMany({
              where: { customerOrderId: id, accountId },
              orderBy: { position: 'asc' },
            });
            const vatEnabledEff = parsed.vatEnabled ?? existing.vatEnabled;
            const vatIncludedEff = parsed.vatIncluded ?? existing.vatIncluded;
            const totals = this.computeTotals(freshPositions, vatEnabledEff, vatIncludedEff);
            // An edit can change a shipped line's price/discount/VAT (qty ≥
            // shipped+returned is guarded above) — keep the header «Отгружено»
            // money in sync with the same per-line math applyShipment uses.
            const shippedSumMinor = this.computeShippedSum(
              freshPositions,
              vatEnabledEff,
              vatIncludedEff,
            );
            return tx.customerOrder.update({
              where: { id, accountId, version: parsed.version },
              data: { ...data, version: { increment: 1 }, ...totals, shippedSumMinor },
            });
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        );
      let saved: Awaited<ReturnType<typeof runUpdateTx>>;
      for (let attempt = 1; ; attempt++) {
        try {
          saved = await runUpdateTx();
          break;
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === 'P2034' && attempt < 5) {
            await new Promise((r) => setTimeout(r, attempt * 25));
            continue;
          }
          throw e;
        }
      }
      // Per-line «Зарезерв.» on edit: positions were just deleted + recreated, so
      // ALWAYS re-apply (always:true) — a now-0/removed line must release its prior
      // hold AND re-materialize reservedQty/reservedSumMinor, else the column would
      // read 0 while stock stayed held (the D1 desync). The FE sends each line's
      // current reservedQty so an unrelated edit preserves the reserve.
      if (parsed.positions !== undefined) {
        await this.reserveRequestedLines(accountId, userId, id, parsed.positions, { always: true });
      }

      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'CustomerOrder');
      this.handlePrisma(e);
    }
  }

  /** Transition state machine. */
  async transition(accountId: string, userId: string, id: string, target: OrderState) {
    const order = await this.findById(accountId, id);
    const newState = this.validateTransition(order.state as OrderState, target, order);

    const data: Prisma.CustomerOrderUpdateInput = { state: newState };
    if (newState === 'confirmed') {
      data.applicable = true;
    } else if (newState === 'cancelled' || newState === 'draft') {
      data.applicable = false;
    }

    const updated = await this.prisma.client.customerOrder.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, `transition:${newState}`, id, {
      from: { before: order.state, after: newState },
    });

    // Owner-confirmed moysklad behaviour (2026-07-16): «Проведено» AUTO-fills
    // «Зарезерв.» — posting an order holds every stocked line's unshipped
    // remainder; un-posting (draft) or cancelling releases the whole hold.
    // Runs AFTER the state commit (same doc-then-reserve ordering as
    // create → reserveRequestedLines); a transient failure retries and a
    // persistent one only logs — the hold can be re-applied via
    // «Изменить ▸ Зарезервировать».
    const wasApplicable = order.applicable;
    const isApplicable = updated.applicable;
    if (!wasApplicable && isApplicable) {
      await this.applyReservationInvariant(accountId, userId, id, 'hold-remaining');
    } else if (wasApplicable && !isApplicable) {
      await this.applyReservationInvariant(accountId, userId, id, 'release');
    }

    this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, ['state']);
    return updated;
  }

  /**
   * Bulk-apply an account-defined custom «Статус» (a State row with
   * entityType="customerorder", e.g. «Текширилмаган») to many orders —
   * moysklad's toolbar «Статус ▾» quick-set. SEPARATE from the FSM `state`
   * lifecycle (bulk-transition): it writes ONLY the `status` relation and
   * never touches `state`/`applicable`. `statusId: null` clears it.
   *
   * The target is validated ONCE against the account's State table before the
   * fan-out — a non-existent / cross-account / wrong-entityType id is a 400,
   * not a per-row 500 (closes the prior crash class where an FSM-name string
   * was sent as a custom status). Each row then updates independently via
   * runBulk so one bad row can't abort the batch.
   */
  async bulkSetStatus(accountId: string, userId: string, ids: string[], statusId: string | null) {
    if (statusId) {
      // Guard: the target must be a live (non-archived) custom status for THIS
      // account + entityType. `archived: false` blocks assigning a retired
      // status via a stale client / hand-crafted request.
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'customerorder', archived: false },
        select: { id: true },
      });
      if (!status) {
        throw new BadRequestException(`Unknown status: ${statusId}`);
      }
    }
    return runBulk(ids, async (id) => {
      const order = await this.prisma.client.customerOrder.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { statusId: true },
      });
      if (!order) {
        throw new NotFoundException(`CustomerOrder ${id} not found`);
      }
      await this.prisma.client.customerOrder.update({
        where: { id, accountId },
        data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
      });
      await this.logAudit(accountId, userId, 'set-status', id, {
        status: { before: order.statusId, after: statusId },
      });
      this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, ['statusId']);
      return id;
    });
  }

  async delete(accountId: string, userId: string, id: string) {
    const order = await this.findById(accountId, id); // fast 404 / applicable pre-check
    if (order.applicable) {
      throw new BadRequestException("Provedeno buyurtmani o'chirib bo'lmaydi");
    }
    // Atomic delete + hold release in ONE Serializable tx (adversarial review
    // CRIT): the old two-step (release tx, then a separate soft-delete UPDATE)
    // let a concurrent reserve()/auto-reserve commit a fresh hold in between —
    // permanently leaking Stock.reservedQty, since every release path filters
    // deletedAt:null. The claim write touches the same customerOrder row every
    // reservation tx updates (reservedSumMinor), so under Serializable one of
    // the two aborts instead of interleaving; the ledger-driven release below
    // then clears whatever hold actually committed.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.prisma.client.$transaction(
          async (tx) => {
            const claim = await tx.customerOrder.updateMany({
              where: { id, accountId, deletedAt: null, applicable: false },
              data: { deletedAt: new Date() },
            });
            if (claim.count === 0) {
              // Distinguish a lost race: posted meanwhile vs already gone.
              const now = await tx.customerOrder.findFirst({
                where: { id, accountId },
                select: { applicable: true, deletedAt: true },
              });
              if (now && !now.deletedAt && now.applicable) {
                throw new BadRequestException("Provedeno buyurtmani o'chirib bo'lmaydi");
              }
              throw new NotFoundException(`CustomerOrder ${id} not found`);
            }
            const positions = await tx.customerOrderPosition.findMany({
              where: { customerOrderId: id, accountId },
            });
            const stocked = positions.filter((p) =>
              CustomerOrderService.RESERVABLE_KINDS.has(p.assortmentKind),
            );
            if (stocked.length > 0) {
              const fresh = await tx.customerOrder.findFirst({
                where: { id, accountId },
                select: { storeId: true },
              });
              const assortments = [
                ...new Map(
                  stocked.map((p) => [
                    `${p.assortmentKind}|${p.assortmentId}`,
                    { kind: p.assortmentKind, id: p.assortmentId },
                  ]),
                ).values(),
              ];
              // biome-ignore lint/style/noNonNullAssertion: the claim above just updated this row
              await this.stock.lockBalances(tx, accountId, fresh!.storeId, assortments);
              await this.stock.releaseReservationByDoc(
                tx,
                accountId,
                userId,
                'customerorder',
                id,
                'release_manual',
              );
              await tx.customerOrderPosition.updateMany({
                where: { customerOrderId: id, accountId },
                data: { reservedQty: 0 },
              });
              await tx.customerOrder.update({
                where: { id, accountId },
                data: { reservedSumMinor: 0n },
              });
            }
          },
          { isolationLevel: 'Serializable', timeout: 15000 },
        );
        break;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if ((code === 'P2034' || code === 'P2002') && attempt < 5) {
          await new Promise((r) => setTimeout(r, attempt * 25));
          continue;
        }
        throw e;
      }
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'DELETE', id);
    return { ok: true };
  }

  /**
   * Mass-edit single-row apply: write the validated patch (already
   * narrowed to the whitelist by the controller) straight to Prisma.
   * Skips the full UpdateCustomerOrderSchema flow because mass-edit
   * targets fields like ownerId that aren't part of the regular update
   * payload, and we want every selected row to apply independently
   * even if some are in `applicable=true` (moysklad allows owner
   * reassignment on posted orders).
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
        await assertStateInTenant(this.prisma, accountId, patch.stateId, 'customerorder');
      data.statusId = patch.stateId;
    }
    const updated = await this.prisma.client.customerOrder.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  /**
   * Toggle the `printed` flag — pairs with the moysklad "Уже напечатано"
   * workflow. Bulk callers run this per id via runBulk so partial-success
   * batches surface their failures. The real PDF render lives in the
   * print-template pipeline (not yet built).
   */
  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.customerOrder.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, ['printed']);
    return updated;
  }

  /**
   * Clone an existing order into a fresh draft. Copies header + positions,
   * resets state to 'draft', generates a new sequence number, and clears
   * any computed downstream sums (paid/shipped/invoiced).
   * Mirrors moysklad's "Скопировать" action.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.customerOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Buyurtma topilmadi');
    }
    const name = await this.nextOrderName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.customerOrder.create({
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
        salesChannelId: source.salesChannelId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        shipmentAddress: source.shipmentAddress,
        shipmentAddressFull: source.shipmentAddressFull ?? undefined,
        moment: new Date(),
        deliveryPlannedMoment: null,
        description: source.description,
        // moysklad «Скопировать» keeps the document currency + rate — a
        // cloned USD/EUR doc must not silently reset to UZS rate=1 (§8.3
        // header-ref preservation extended to money header fields).
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
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'CREATE', created.id);
    return created;
  }

  /**
   * «Изменить ▸ Объединить» — combine N selected orders into ONE new draft and
   * return its id (the FE navigates to it). Mirrors purchase-order.merge:
   *   - identical lines summed, differing price/discount/VAT kept separate
   *     (combineMergePositions — float-free BigInt micro-units);
   *   - the whole header is taken from the PRIMARY (earliest by moment, id-tie)
   *     so the FK set stays internally consistent (org-account ↔ org, etc.);
   *   - totals RECOMPUTED from the combined set, never summed from headers.
   * Money-integrity guards: all sources must share currency + VAT mode — the
   * same priceMinor means something different under a different mode, so a mixed
   * set could not be combined faithfully. The source orders are left untouched.
   */
  async merge(accountId: string, userId: string, ids: string[]): Promise<{ id: string }> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Birlashtirish uchun kamida 2 ta buyurtma tanlang');
    }
    const sources = await this.prisma.client.customerOrder.findMany({
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
    // header. `reduce` over the (guaranteed ≥2) sources yields a non-nullable row.
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
      const created = await this.prisma.client.customerOrder.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: primary.agentId,
          agentAccountId: primary.agentAccountId,
          organizationId: primary.organizationId,
          organizationAccountId: primary.organizationAccountId,
          storeId: primary.storeId,
          contractId: primary.contractId,
          projectId: primary.projectId,
          salesChannelId: primary.salesChannelId,
          // The custom «Статус» is carried from the primary; the merged doc is a
          // fresh draft on the FSM axis regardless.
          statusId: primary.statusId,
          externalCode: null,
          moment: new Date(),
          deliveryPlannedMoment: null,
          description: primary.description,
          // Carry the primary's already-validated доп.поля so a required
          // attribute stays satisfied; not re-validated here (the user lands on
          // an editable draft, posting re-enforces required attributes).
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
      this.webhookFire.fireForEvent(accountId, 'customerorder', 'CREATE', created.id);
      return { id: created.id };
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /** Stocked assortment kinds a reservation can hold (services/bundles aren't
   *  stocked per (store, assortment), so they're never reserved). */
  private static readonly RESERVABLE_KINDS = new Set(['product', 'variant']);

  /**
   * Core reservation SET primitive — the SINGLE source of truth for every
   * customer-order reservation (the «Зарезервировать»/«Очистить резерв» menu AND
   * the per-line «Зарезерв.» a save requests). `desiredFor(p)` returns the wanted
   * reserve qty for each line; it is clamped to [0, ordered qty] and non-stocked
   * lines (service/bundle) never reserve.
   *
   * SET semantics (idempotent + edit-safe): the doc's prior hold is released
   * first, then `desiredFor` re-applied — so re-reserving after quantities change
   * lands on the correct held amount, never double-counts. Serializable + FOR
   * UPDATE (StockService.lockBalances) ordered by assortmentId. Lost-update
   * safety: a present Stock row is serialised by FOR UPDATE; a never-stocked SKU
   * (no row → FOR UPDATE locks nothing) is covered by Serializable isolation +
   * the Stock unique key (the losing first-reserve aborts, not silently merges).
   * Re-materialises each position's reservedQty + the header «Резерв» money sum
   * so reservedQty stays == the held Stock.reservedQty. Over-reservation vs stock
   * is allowed (moysklad parity: you may reserve goods you will still receive).
   */
  private async runReservationSet(
    accountId: string,
    userId: string,
    id: string,
    desiredFor: (p: {
      id: string;
      assortmentKind: string;
      quantity: Prisma.Decimal;
      reservedQty: Prisma.Decimal;
      shippedQty: Prisma.Decimal;
      position: number;
    }) => number,
    opts: { allowCancelled?: boolean; requireApplicable?: boolean } = {},
  ): Promise<void> {
    await this.prisma.client.$transaction(
      async (tx) => {
        const order = await tx.customerOrder.findFirst({
          where: { id, accountId, deletedAt: null },
          include: { positions: true },
        });
        if (!order) throw new NotFoundException(`CustomerOrder ${id} not found`);
        if (!opts.allowCancelled && order.state === 'cancelled') {
          throw new BadRequestException("Bekor qilingan buyurtmani rezerv qilib bo'lmaydi");
        }
        // Transition-driven invariant txs run AFTER their state commit, in a
        // separate retried tx — a delayed retry can otherwise land after a
        // SUBSEQUENT opposite transition and invert the hold (draft order left
        // fully held / posted order left bare). Re-checking applicable INSIDE
        // this tx pins the side-effect to the state it was dispatched for; on
        // mismatch the newer transition's own invariant tx is authoritative.
        if (opts.requireApplicable !== undefined && order.applicable !== opts.requireApplicable) {
          return;
        }

        // Wanted reserve per line, clamped to [0, ordered qty]; non-stocked = 0.
        const desiredOf = (p: (typeof order.positions)[number]): number =>
          CustomerOrderService.RESERVABLE_KINDS.has(p.assortmentKind)
            ? Math.max(0, Math.min(desiredFor(p), Number(p.quantity)))
            : 0;

        const stocked = order.positions.filter((p) =>
          CustomerOrderService.RESERVABLE_KINDS.has(p.assortmentKind),
        );
        const assortments = [
          ...new Map(
            stocked.map((p) => [
              `${p.assortmentKind}|${p.assortmentId}`,
              { kind: p.assortmentKind, id: p.assortmentId },
            ]),
          ).values(),
        ];

        // Lock the affected balances FIRST (deadlock-safe ordering inside).
        await this.stock.lockBalances(tx, accountId, order.storeId, assortments);
        // Release any existing hold for THIS doc so the re-apply is a clean SET.
        await this.stock.releaseReservationByDoc(
          tx,
          accountId,
          userId,
          'customerorder',
          id,
          'release_manual',
        );

        const deltas = stocked
          .map((p) => ({ p, q: desiredOf(p) }))
          .filter(({ q }) => q > 0)
          .map(({ p, q }) => ({
            storeId: order.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(q),
            docType: 'customerorder' as const,
            docId: id,
            reason: 'reserve' as const,
          }));
        if (deltas.length > 0) {
          await this.stock.applyReservationDeltas(tx, accountId, userId, deltas);
        }

        // Materialize per-position reservedQty + the header «Резерв» money sum.
        for (const p of order.positions) {
          await tx.customerOrderPosition.update({
            where: { id: p.id },
            data: { reservedQty: desiredOf(p) },
          });
        }
        const { sumMinor: reservedSumMinor } = this.computeTotals(
          order.positions.map((p) => ({
            quantity: desiredOf(p),
            priceMinor: p.priceMinor,
            discount: p.discount,
            vat: p.vat,
            vatEnabled: p.vatEnabled,
          })),
          order.vatEnabled,
          order.vatIncluded,
        );
        await tx.customerOrder.update({
          where: { id, accountId },
          data: { reservedSumMinor },
        });
      },
      // 15s (mirrors demand/move reservation txs) — a large order locks many Stock
      // rows + loops per-position; the 5s default raised spurious serialization
      // aborts under contention.
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  /**
   * «Изменить ▸ Зарезервировать» — reserve the FULL ordered quantity of every
   * stocked position (desired = quantity). See runReservationSet for the SET +
   * concurrency discipline.
   */
  async reserve(accountId: string, userId: string, id: string): Promise<{ id: string }> {
    await this.runReservationSet(accountId, userId, id, (p) => Number(p.quantity));
    await this.logAudit(accountId, userId, 'reserve', id, null);
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, ['reservedSumMinor']);
    return { id };
  }

  /**
   * «Изменить ▸ Очистить резерв» — release the order's entire reservation
   * (desired 0 everywhere). Idempotent; allowed on a cancelled order.
   */
  async clearReserve(accountId: string, userId: string, id: string): Promise<{ id: string }> {
    await this.runReservationSet(accountId, userId, id, () => 0, { allowCancelled: true });
    await this.logAudit(accountId, userId, 'clear-reserve', id, null);
    this.webhookFire.fireForEvent(accountId, 'customerorder', 'UPDATE', id, ['reservedSumMinor']);
    return { id };
  }

  /**
   * Per-line «Зарезерв.» requested on save: reserve exactly each line's wanted qty
   * via the same atomic primitive as the menu reserve. `payloadPositions` is the
   * create/update positions IN ORDER — each stored line's `position` (1-based)
   * indexes back into it (create + update both write position = idx + 1, 1:1, no
   * merge), so a recreated line's reserve is re-applied from the payload.
   *
   * `always`: on UPDATE we pass true — positions were just deleted + recreated
   * (reservedQty reset to 0), so we MUST re-run even for an all-zero payload, else
   * a removed/zeroed line's prior Stock hold would be stranded while its
   * position.reservedQty reads 0 (a materialized-vs-ledger desync — the D1 bug the
   * adversarial review caught). On CREATE there is no prior hold, so we skip the tx
   * when nothing was requested (perf; behaviour identical).
   *
   * The order already exists (separate tx after the create/update commit), so a
   * client retry would duplicate it — instead of propagating, we RETRY a transient
   * serialization/unique conflict (P2034/P2002 — the never-stocked-SKU race) a few
   * times so the user's reserve isn't silently dropped under contention; only a
   * persistent failure is logged (doc lands cleanly at 0/0, invariant intact).
   */
  private async reserveRequestedLines(
    accountId: string,
    userId: string,
    id: string,
    payloadPositions: Array<{ reservedQty?: number }>,
    opts: { always?: boolean } = {},
  ): Promise<void> {
    if (!opts.always && !payloadPositions.some((p) => Number(p?.reservedQty ?? 0) > 0)) return;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.runReservationSet(accountId, userId, id, (p) =>
          Number(payloadPositions[p.position - 1]?.reservedQty ?? 0),
        );
        return;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if ((code === 'P2034' || code === 'P2002') && attempt < 5) {
          await new Promise((r) => setTimeout(r, attempt * 25));
          continue;
        }
        this.logger.warn(
          `per-line reserve failed for customer-order ${id} after ${attempt} attempt(s): ${
            e instanceof Error ? e.message : e
          }`,
        );
        return;
      }
    }
  }

  /**
   * Posting/un-posting the ORDER itself drives the reservation invariant
   * (owner-confirmed moysklad behaviour, 2026-07-16): while an order is
   * «Проведено», every stocked line auto-holds its unshipped remainder
   * (quantity − shippedQty); leaving the posted state releases the whole
   * hold. Retries transient serialization/unique conflicts exactly like
   * reserveRequestedLines — the state change is already committed, so a
   * persistent failure only logs (the hold is recoverable via
   * «Изменить ▸ Зарезервировать»), never fails the transition.
   */
  private async applyReservationInvariant(
    accountId: string,
    userId: string,
    id: string,
    mode: 'hold-remaining' | 'release',
  ): Promise<void> {
    const desiredFor =
      mode === 'release'
        ? () => 0
        : (p: { quantity: Prisma.Decimal; shippedQty: Prisma.Decimal }) =>
            Math.max(0, Number(p.quantity) - Number(p.shippedQty));
    for (let attempt = 1; ; attempt++) {
      try {
        await this.runReservationSet(accountId, userId, id, desiredFor, {
          allowCancelled: mode === 'release',
          // Pin the side-effect to the state that dispatched it (see
          // runReservationSet) — a delayed retry must not undo a newer
          // opposite transition's hold state.
          requireApplicable: mode === 'hold-remaining',
        });
        return;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if ((code === 'P2034' || code === 'P2002') && attempt < 5) {
          await new Promise((r) => setTimeout(r, attempt * 25));
          continue;
        }
        this.logger.warn(
          `reservation invariant (${mode}) failed for customer-order ${id} after ${attempt} attempt(s): ${
            e instanceof Error ? e.message : e
          }`,
        );
        return;
      }
    }
  }

  /**
   * Shipment ⇄ reservation integration — called by DemandService INSIDE its
   * posting/unposting transaction, and always BEFORE applyShipment mutates
   * shippedQty (this method derives the post-shipment value itself from the
   * CURRENT stored shippedQty ± qtyDelta).
   *
   * Why before the demand's sufficiency check on post: §2c counts
   * Stock.reservedQty against availability, so a fully-reserved order would
   * otherwise block its OWN Отгрузка. Consuming the hold for exactly the
   * shipped lines first frees that stock for the shipment.
   *
   * Hold rule per affected stocked line (shippedAfter = shippedQty ± delta,
   * remainingAfter = max(0, quantity − shippedAfter)):
   *   ship:    hold = max(0, currentHold − shipQty)   — CONSUME-ONLY. Shipping
   *            eats the line's reserve, it never grows one: a manual
   *            «Очистить резерв» must survive a later shipment (adversarial
   *            review) and this is moysklad's own semantics.
   *   revert:  posted order:  hold = min(remainingAfter, currentHold + shipQty)
   *            — the consumed hold returns with the goods, clamped to what is
   *            still unshipped. Draft/cancelled: hold = min(currentHold,
   *            remainingAfter) — a revert must never CREATE a hold on an
   *            un-posted order (its holds are manual-only).
   *
   * Lines are AGGREGATED per positionId first — a raw-API demand may carry
   * several lines pointing at the same CO position, and per-line math against
   * the same stale snapshot would desync position.reservedQty from the summed
   * stock deltas (adversarial review).
   *
   * Locks the ORDER-store balance rows (the hold lives at the order's store
   * even when the demand ships from a different store). Returns the order's
   * storeId + per-assortment hold delta AND the order's own post-adjust hold
   * (ownHoldAfter) so the caller can patch its pre-fetched sufficiency
   * snapshot: the order's OWN hold must not block its OWN shipment — §2c
   * would otherwise reject a partial shipment of an over-reserved order.
   */
  async adjustReservationForShipment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    customerOrderId: string,
    lines: Array<{ positionId: string; qtyDelta: string }>,
    direction: 'ship' | 'revert',
  ): Promise<{
    storeId: string;
    holdDeltas: Map<string, number>;
    ownHoldAfter: Map<string, number>;
  }> {
    const order = await tx.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      include: { positions: true },
    });
    if (!order) throw new NotFoundException(`CustomerOrder ${customerOrderId} not found`);

    const sign = direction === 'ship' ? 1 : -1;
    // Aggregate shipped qty per CO position (dedup multi-line links).
    const shipByPos = new Map<string, number>();
    for (const line of lines) {
      shipByPos.set(line.positionId, (shipByPos.get(line.positionId) ?? 0) + Number(line.qtyDelta));
    }
    const affected: Array<{
      position: (typeof order.positions)[number];
      desired: number;
      delta: number;
    }> = [];
    for (const [positionId, shipQty] of shipByPos) {
      const pos = order.positions.find((p) => p.id === positionId);
      if (!pos || !CustomerOrderService.RESERVABLE_KINDS.has(pos.assortmentKind)) continue;
      const shippedAfter = Number(pos.shippedQty) + sign * shipQty;
      const remainingAfter = Math.max(0, Number(pos.quantity) - shippedAfter);
      const currentHold = Number(pos.reservedQty);
      const desired =
        direction === 'ship'
          ? Math.max(0, currentHold - shipQty)
          : order.applicable
            ? Math.min(remainingAfter, currentHold + shipQty)
            : Math.min(currentHold, remainingAfter);
      affected.push({ position: pos, desired, delta: desired - currentHold });
    }
    // Own post-adjust hold per DEMAND assortment — sum over ALL of the order's
    // positions of that assortment (unlinked sibling lines still belong to
    // this same order, and an order's hold never blocks its own shipment).
    const desiredByIdAll = new Map(affected.map((c) => [c.position.id, c.desired]));
    const ownHoldAfter = new Map<string, number>();
    const demandAssortments = new Set(affected.map((c) => c.position.assortmentId));
    for (const p of order.positions) {
      if (!demandAssortments.has(p.assortmentId)) continue;
      if (!CustomerOrderService.RESERVABLE_KINDS.has(p.assortmentKind)) continue;
      const hold = desiredByIdAll.get(p.id) ?? Number(p.reservedQty);
      ownHoldAfter.set(p.assortmentId, (ownHoldAfter.get(p.assortmentId) ?? 0) + hold);
    }
    const changes = affected.filter((c) => c.delta !== 0);
    if (changes.length === 0) {
      return { storeId: order.storeId, holdDeltas: new Map(), ownHoldAfter };
    }

    const assortments = [
      ...new Map(
        changes.map(({ position: p }) => [
          `${p.assortmentKind}|${p.assortmentId}`,
          { kind: p.assortmentKind, id: p.assortmentId },
        ]),
      ).values(),
    ];
    await this.stock.lockBalances(tx, accountId, order.storeId, assortments);
    await this.stock.applyReservationDeltas(
      tx,
      accountId,
      userId,
      changes.map(({ position: p, delta }) => ({
        storeId: order.storeId,
        assortmentKind: p.assortmentKind,
        assortmentId: p.assortmentId,
        qtyDelta: String(delta),
        docType: 'customerorder' as const,
        docId: customerOrderId,
        reason: delta < 0 ? ('release_consume' as const) : ('reserve' as const),
      })),
    );
    for (const { position: p, desired } of changes) {
      await tx.customerOrderPosition.update({
        where: { id: p.id },
        data: { reservedQty: desired },
      });
    }
    // Re-materialize the header «Резерв» money sum from the post-change holds.
    const { sumMinor: reservedSumMinor } = this.computeTotals(
      order.positions.map((p) => ({
        quantity: desiredByIdAll.get(p.id) ?? Number(p.reservedQty),
        priceMinor: p.priceMinor,
        discount: p.discount,
        vat: p.vat,
        vatEnabled: p.vatEnabled,
      })),
      order.vatEnabled,
      order.vatIncluded,
    );
    await tx.customerOrder.update({
      where: { id: customerOrderId, accountId },
      data: { reservedSumMinor },
    });

    const holdDeltas = new Map<string, number>();
    for (const { position: p, delta } of changes) {
      holdDeltas.set(p.assortmentId, (holdDeltas.get(p.assortmentId) ?? 0) + delta);
    }
    return { storeId: order.storeId, holdDeltas, ownHoldAfter };
  }

  /**
   * Apply a shipment delta from a Demand transition (post).
   *
   * Contract (called from DemandService, inside its $transaction):
   *   - tx: the same transaction client DemandService is using
   *   - customerOrderId: which CO to update
   *   - deltas: per-CustomerOrderPosition qty changes (positive = more shipped)
   *
   * Effects:
   *   - CustomerOrderPosition.shippedQty += deltaQty per entry
   *   - CustomerOrder.shippedSumMinor recomputed from all positions
   *   - Auto-transition state:
   *       confirmed | awaiting_payment  → partially_shipped (any shipped, not all)
   *       confirmed | awaiting_payment | paid | partially_shipped → fully_shipped (all shipped)
   *   - Audit log entry 'transition:...' if state changed
   */
  async applyShipment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    customerOrderId: string,
    deltas: Array<{ positionId: string; qtyDelta: string }>,
    direction: 'ship' | 'revert',
  ): Promise<void> {
    const order = await tx.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      include: { positions: true },
    });
    if (!order) throw new NotFoundException(`CustomerOrder ${customerOrderId} not found`);

    const sign = direction === 'ship' ? 1 : -1;

    // 1. Apply per-position shippedQty deltas
    for (const d of deltas) {
      const pos = order.positions.find((p) => p.id === d.positionId);
      if (!pos) {
        throw new BadRequestException(
          `Position ${d.positionId} not found on CustomerOrder ${customerOrderId}`,
        );
      }
      const delta = Number(d.qtyDelta) * sign;
      await tx.customerOrderPosition.update({
        where: { id: d.positionId },
        data: {
          shippedQty: { increment: delta },
        },
      });
    }

    // 2. Re-read positions with updated shippedQty, compute shippedSumMinor.
    const freshPositions = await tx.customerOrderPosition.findMany({
      where: { customerOrderId, accountId },
    });

    let shippedSumMinor = 0n;
    let allShipped = true;
    let anyShipped = false;
    for (const p of freshPositions) {
      const qty = Number(String(p.quantity));
      const shipped = Number(String(p.shippedQty));
      if (shipped >= qty && qty > 0) {
        // full
      } else {
        allShipped = false;
      }
      if (shipped > 0) anyShipped = true;

      // Money of the shipped portion = the line total for the shipped qty.
      // Single-round through the shared helper (the b1eae7be unification) so
      // shippedSum accumulates with the SAME rounding as the header sumMinor
      // (computeTotals): a fully-shipped order's shippedSum then equals
      // sumMinor EXACTLY instead of drifting ±1 tiyin on discounted/VAT lines.
      if (qty <= 0 || shipped <= 0) continue;
      const { totalMinor } = computePositionTotal(
        {
          quantity: String(p.shippedQty),
          priceMinor: String(p.priceMinor),
          discount: String(p.discount),
          vat: p.vat,
        },
        order.vatEnabled && p.vatEnabled,
        order.vatIncluded,
      );
      shippedSumMinor += totalMinor;
    }

    // 3. Evaluate auto-transition
    const currentState = order.state as OrderState;
    let newState: OrderState | null = null;
    if (allShipped && anyShipped) {
      const transitableFrom: OrderState[] = [
        'confirmed',
        'awaiting_payment',
        'paid',
        'partially_shipped',
      ];
      if (transitableFrom.includes(currentState) && currentState !== 'fully_shipped') {
        newState = 'fully_shipped';
      }
    } else if (anyShipped) {
      const transitableFrom: OrderState[] = ['confirmed', 'awaiting_payment'];
      if (transitableFrom.includes(currentState)) {
        newState = 'partially_shipped';
      }
    } else {
      // no shipped anymore → revert partially_shipped / fully_shipped → confirmed
      if (currentState === 'partially_shipped' || currentState === 'fully_shipped') {
        newState = 'confirmed';
      }
    }

    const updateData: Prisma.CustomerOrderUpdateInput = { shippedSumMinor };
    if (newState && newState !== currentState) {
      updateData.state = newState;
    }

    await tx.customerOrder.update({
      where: { id: customerOrderId, accountId },
      data: updateData,
    });

    if (newState && newState !== currentState) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CustomerOrder',
          entityId: customerOrderId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  /**
   * Apply an invoice delta from InvoiceOut transition (post / cancel).
   *
   * Contract:
   *   - tx: caller's transaction
   *   - direction: 'invoice' adds amountMinor to invoicedSumMinor;
   *                'revert' subtracts
   *   - amountMinor: invoice gross sum to add/remove
   */
  async applyInvoice(
    tx: Prisma.TransactionClient,
    accountId: string,
    customerOrderId: string,
    amountMinor: bigint,
    direction: 'invoice' | 'revert',
  ): Promise<void> {
    const order = await tx.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true, invoicedSumMinor: true },
    });
    if (!order) {
      throw new NotFoundException(`CustomerOrder ${customerOrderId} not found`);
    }
    const sign = direction === 'invoice' ? 1n : -1n;
    await tx.customerOrder.update({
      where: { id: customerOrderId, accountId },
      data: { invoicedSumMinor: { increment: amountMinor * sign } },
    });
  }

  /**
   * Apply a payment delta cascading from InvoiceOut.applyPayment (via PaymentIn).
   *
   * Contract:
   *   - tx: caller's transaction
   *   - direction: 'apply' adds, 'revert' subtracts from CO.payedSumMinor
   *
   * Also auto-transitions CO state when the full flow completes:
   *   - If payedSum >= sum AND shippedSum >= sum (fully paid AND fully shipped)
   *     → state = closed (from fully_shipped / paid / partially_shipped)
   *   - If payedSum >= sum AND not fully shipped
   *     → state = paid (from confirmed / awaiting_payment / partially_shipped)
   */
  async applyPayment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    customerOrderId: string,
    amountMinor: bigint,
    direction: 'apply' | 'revert',
  ): Promise<void> {
    const order = await tx.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true, state: true, sumMinor: true, payedSumMinor: true, shippedSumMinor: true },
    });
    if (!order) {
      throw new NotFoundException(`CustomerOrder ${customerOrderId} not found`);
    }

    const sign = direction === 'apply' ? 1n : -1n;
    const newPayed = order.payedSumMinor + amountMinor * sign;
    if (newPayed < 0n) {
      throw new BadRequestException("CO to'langan summasi manfiy bo'la olmaydi");
    }

    // Evaluate auto-transition
    const currentState = order.state as OrderState;
    const fullyPaid = newPayed >= order.sumMinor && order.sumMinor > 0n;
    const fullyShipped = order.shippedSumMinor >= order.sumMinor && order.sumMinor > 0n;

    let newState: OrderState | null = null;
    if (fullyPaid && fullyShipped) {
      const closeableFrom: OrderState[] = [
        'paid',
        'fully_shipped',
        'partially_shipped',
        'awaiting_payment',
        'confirmed',
      ];
      if (closeableFrom.includes(currentState)) newState = 'closed';
    } else if (fullyPaid) {
      const payableFrom: OrderState[] = ['confirmed', 'awaiting_payment', 'partially_shipped'];
      if (payableFrom.includes(currentState)) newState = 'paid';
    } else if (!fullyPaid && currentState === 'paid') {
      // revert: was fully paid, now not
      newState = fullyShipped
        ? 'fully_shipped'
        : order.shippedSumMinor > 0n
          ? 'partially_shipped'
          : 'confirmed';
    } else if (!fullyPaid && currentState === 'closed') {
      // revert closed
      newState = fullyShipped ? 'fully_shipped' : 'confirmed';
    }

    const updateData: Prisma.CustomerOrderUpdateInput = { payedSumMinor: newPayed };
    if (newState && newState !== currentState) {
      updateData.state = newState;
    }

    await tx.customerOrder.update({
      where: { id: customerOrderId, accountId },
      data: updateData,
    });

    if (newState && newState !== currentState) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'CustomerOrder',
          entityId: customerOrderId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
            trigger: 'payment',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  // --- helpers ---

  /**
   * Shared WHERE builder for `list` + `aggregateTotals` so the two can
   * never drift (moysklad parity: totals respect the active filter set).
   *
   * Derived states («Оплата» / «Отгрузка» / «Резерв») compare two
   * columns via Prisma 5 field references (`fields.sumMinor`) — exactly
   * how purchase-order.service handles paymentState/receiveState. This
   * fixes the prior silent fall-through where `paid` / `shipped` were
   * accepted by the schema but produced no WHERE clause (no-op).
   */
  /**
   * «Срок задачи» — resolve the orders that have an OPEN task due in the range.
   *
   * Task links to documents polymorphically (`entity` + `entityId` strings), so
   * there is no Prisma relation to filter through; this does the lookup up front
   * and the caller feeds the ids into buildListWhere.
   *
   * Returns `null` when the filter is not set (⇒ no id restriction at all), which
   * is deliberately different from `[]` (filter set, nothing matched ⇒ no rows).
   *
   * Capped: a filter that matched an unbounded number of tasks would build an
   * enormous `IN (…)`. TASK_ID_CAP bounds it; the cap is ordered by due date so
   * the soonest tasks — the ones a «Срок задачи» filter is actually about — win.
   */
  private static readonly TASK_ID_CAP = 5000;

  private async resolveTaskDueOrderIds(
    accountId: string,
    filter: CustomerOrderFilter,
  ): Promise<string[] | null> {
    if (!filter.taskDueFrom && !filter.taskDueTo) return null;
    const rows = await this.prisma.client.task.findMany({
      where: {
        accountId,
        entity: 'CustomerOrder',
        entityId: { not: null },
        // Only OPEN work is a "срок" — a finished task's deadline is history.
        status: { in: ['open', 'in_progress'] },
        dueAt: tashkentRangeBounds(filter.taskDueFrom, filter.taskDueTo),
      },
      select: { entityId: true },
      orderBy: { dueAt: 'asc' },
      take: CustomerOrderService.TASK_ID_CAP,
    });
    return [...new Set(rows.map((r) => r.entityId).filter((id): id is string => id !== null))];
  }

  /**
   * «Тип возврата» — resolve the orders whose returned amount is partial / full.
   *
   * «Без возвратов» needs no query at all — it is a plain `salesReturns: { none: {} }`
   * relation filter built inline — so this only runs for the two comparing cases.
   * Prisma cannot aggregate a relation inside `where`, so the sums are grouped up
   * front and compared here.
   *
   * Returns `null` when the filter is unset or is the `none` case.
   */
  private async resolveReturnStatusOrderIds(
    accountId: string,
    filter: CustomerOrderFilter,
  ): Promise<string[] | null> {
    const want = filter.returnStatus;
    if (want !== 'partial' && want !== 'full') return null;
    const grouped = await this.prisma.client.salesReturn.groupBy({
      by: ['customerOrderId'],
      where: { accountId, deletedAt: null, customerOrderId: { not: null } },
      _sum: { sumMinor: true },
    });
    const returned = new Map<string, bigint>();
    for (const g of grouped) {
      if (g.customerOrderId) returned.set(g.customerOrderId, g._sum.sumMinor ?? 0n);
    }
    if (returned.size === 0) return [];
    // Only the orders that actually have returns need their total fetched.
    const orders = await this.prisma.client.customerOrder.findMany({
      where: { accountId, deletedAt: null, id: { in: [...returned.keys()] } },
      select: { id: true, sumMinor: true },
    });
    return orders
      .filter((o) => {
        const back = returned.get(o.id) ?? 0n;
        if (back <= 0n) return false;
        // A zero-total order can never be "partially" returned — guard the
        // comparison so it lands in `full` rather than dividing by nothing.
        return want === 'full' ? back >= o.sumMinor : back < o.sumMinor;
      })
      .map((o) => o.id);
  }

  private buildListWhere(
    accountId: string,
    filter: CustomerOrderFilter,
    attrTypes: Map<string, AttributeType> = new Map(),
    taskDueOrderIds: string[] | null = null,
    returnStatusOrderIds: string[] | null = null,
  ): Prisma.CustomerOrderWhereInput {
    const fields = this.prisma.client.customerOrder.fields;

    // «Оплата» — payedSumMinor vs sumMinor cross-column compare.
    const paymentClause: Prisma.CustomerOrderWhereInput | null = (() => {
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

    // «Отгрузка» — shippedSumMinor vs sumMinor cross-column compare.
    const shippedClause: Prisma.CustomerOrderWhereInput | null = (() => {
      switch (filter.shippedStatus) {
        case 'unshipped':
          return { shippedSumMinor: 0n };
        case 'partial':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gt: 0n, lt: fields.sumMinor } };
        case 'shipped':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gte: fields.sumMinor } };
        case 'overdue':
          // «Просрочено» — planned ship date in the past AND not fully shipped
          // AND still awaiting shipment. A null deliveryPlannedMoment is
          // excluded (`lt` never matches null) — an order with no plan date
          // cannot be overdue. Terminal states are excluded: a `cancelled`
          // (void) or `closed` (done) order is NOT overdue-for-shipment even
          // if its plan date passed unshipped. `draft` is kept on purpose — a
          // draft past its date still needs attention.
          return {
            deliveryPlannedMoment: { lt: new Date() },
            shippedSumMinor: { lt: fields.sumMinor },
            state: { notIn: ['cancelled', 'closed'] },
          };
        default:
          return null;
      }
    })();

    // «Резерв» — classify by per-position quantity COVERAGE of the order's
    // RESERVABLE goods (product/variant), not by reservedSumMinor vs sumMinor.
    // The money compare wrongly marked a fully-reserved MIXED order «partial»:
    // a service/bundle line adds to sumMinor but can never be reserved, so
    // reservedSumMinor stayed < sumMinor forever. Coverage is the true parity
    // semantic (reserve is a quantity hold). Uses a nested field-reference
    // (reservedQty < quantity on CustomerOrderPosition) — verified 2026-06-19.
    const reservedClause: Prisma.CustomerOrderWhereInput | null = (() => {
      const posFields = this.prisma.client.customerOrderPosition.fields;
      const reservable = { assortmentKind: { in: ['product', 'variant'] }, quantity: { gt: 0 } };
      const hasReservable: Prisma.CustomerOrderWhereInput = {
        positions: { some: reservable },
      };
      // ≥1 reservable line whose held qty is below its ordered qty.
      const underReserved: Prisma.CustomerOrderWhereInput = {
        positions: { some: { ...reservable, reservedQty: { lt: posFields.quantity } } },
      };
      switch (filter.reservedStatus) {
        case 'none':
          // Nothing held at all (the money sum is the cheap, exact check here).
          return { reservedSumMinor: 0n };
        case 'partial':
          // Something held, but at least one reservable line not fully covered.
          return { AND: [{ positions: { some: { reservedQty: { gt: 0 } } } }, underReserved] };
        case 'full':
          // Has reservable goods and none of them under-reserved.
          return { AND: [hasReservable, { NOT: underReserved }] };
        default:
          return null;
      }
    })();

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
    // «План. дата отгрузки» — same Tashkent-day bounds as `moment`. The column is
    // nullable, so a bound also implies NOT NULL (Prisma range operators already
    // exclude NULL, which is the wanted semantics: no planned date ⇒ not in range).
    const deliveryPlannedRange =
      filter.deliveryPlannedFrom || filter.deliveryPlannedTo
        ? {
            deliveryPlannedMoment: tashkentRangeBounds(
              filter.deliveryPlannedFrom,
              filter.deliveryPlannedTo,
            ),
          }
        : {};
    // «Адрес доставки» — case-insensitive substring, like the other text filters.
    const shipmentAddressClause = filter.shipmentAddress?.trim()
      ? {
          shipmentAddress: {
            contains: filter.shipmentAddress.trim(),
            mode: 'insensitive' as const,
          },
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

    // Combine the cross-column derived-status clauses + the sum range with an
    // AND array, NOT a top-level object spread. paymentClause/shippedClause/
    // reservedClause and sumRange can EACH set `sumMinor`; an object spread is
    // last-wins, so a derived `sumMinor:{gt:0n}` zero-total guard was silently
    // dropped by a `sumMinorTo`-only range — letting a 0-amount order leak into
    // «оплачено»/«отгружено». ANDing preserves every condition. (Found by the
    // 2026-06-18 confidence audit.)
    const sumScopedAnd: Prisma.CustomerOrderWhereInput[] = [
      paymentClause,
      shippedClause,
      reservedClause,
    ].filter((c): c is Prisma.CustomerOrderWhereInput => c !== null);
    if (Object.keys(sumRange).length > 0) sumScopedAnd.push(sumRange);

    // Custom-attribute (доп.поля) filters — each clause becomes one JSON-path
    // condition ANDed alongside the sum-scoped clauses (a single `AND` key, so
    // they don't collide with the sum guards above).
    sumScopedAnd.push(...this.buildAttrWhere(filter.attrs, attrTypes));

    // «Срок задачи» + «Тип возврата» — both narrow by `id`. They MUST join the
    // single AND array, not be spread as their own keys: the object literal
    // already carries `AND: sumScopedAnd`, and a second `AND` (or two `id` keys)
    // would be last-wins and silently drop the other filter — the exact bug the
    // sum-guard comment above documents.
    // `null` = filter not set (no restriction); `[]` = set but nothing matched
    // (⇒ no rows), so the two cases must stay distinguishable.
    if (taskDueOrderIds !== null) sumScopedAnd.push({ id: { in: taskDueOrderIds } });
    if (returnStatusOrderIds !== null) sumScopedAnd.push({ id: { in: returnStatusOrderIds } });

    return {
      accountId,
      deletedAt: null,
      ...(filter.state ? { state: filter.state } : {}),
      // moysklad «Статус» list filter — by the account's custom status (the schema
      // already accepts statusId; the list column shows status.name).
      ...(filter.statusId ? { statusId: filter.statusId } : {}),
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentIds ? { agentId: { in: filter.agentIds } } : {}),
      // «Группа контрагента» + «Владелец контрагента» BOTH scope through `agent`.
      // They must be merged into ONE `agent` object — two spread keys would be
      // last-wins and the group filter would be silently dropped.
      ...(filter.agentGroupId || filter.agentOwnerId
        ? {
            agent: {
              ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
              ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
            },
          }
        : {}),
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.salesChannelId ? { salesChannelId: filter.salesChannelId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.productId ? { positions: { some: { assortmentId: filter.productId } } } : {}),
      ...(sumScopedAnd.length > 0 ? { AND: sumScopedAnd } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...momentRange,
      ...updatedRange,
      ...deliveryPlannedRange,
      ...shipmentAddressClause,
      // «Без возвратов» — a pure relation filter, no pre-resolution needed.
      ...(filter.returnStatus === 'none' ? { salesReturns: { none: {} } } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  /**
   * Resolve the live (non-archived) attribute TYPE for each code referenced by
   * the custom-attr filters. Codes that aren't found (unknown / archived) are
   * omitted — their filter clause is then silently ignored in buildAttrWhere.
   * Returns an empty map when no attr filters are active (no metadata query).
   */
  private async attrTypeMap(
    accountId: string,
    attrs: AttrFilterClause[] | undefined,
  ): Promise<Map<string, AttributeType>> {
    if (!attrs || attrs.length === 0) return new Map();
    const wanted = new Set(attrs.map((a) => a.code));
    const metas = await this.attrs.findForEntity(accountId, 'CustomerOrder');
    const map = new Map<string, AttributeType>();
    for (const meta of metas) {
      if (wanted.has(meta.code)) map.set(meta.code, meta.type as AttributeType);
    }
    return map;
  }

  /**
   * Translate the custom-attribute filter clauses into Prisma JSON-path WHERE
   * conditions over the `attributes` column. The shape depends on the
   * attribute's type (resolved in attrTypeMap):
   *   string/text/link → contains (substring)
   *   enum/reference/file → equals (the stored id / value string)
   *   boolean → equals true|false
   *   long/double → equals and/or numeric from–to range
   *   date → from–to range (UTC day edges; ISO lexicographic == chronological)
   * Unknown codes are dropped. Prisma parameterises `path`, so a code can never
   * be a SQL-injection vector.
   */
  private buildAttrWhere(
    attrs: AttrFilterClause[] | undefined,
    types: Map<string, AttributeType>,
  ): Prisma.CustomerOrderWhereInput[] {
    if (!attrs || attrs.length === 0) return [];
    const out: Prisma.CustomerOrderWhereInput[] = [];
    for (const a of attrs) {
      const type = types.get(a.code);
      if (!type) continue;
      const path = [a.code];
      switch (type) {
        case 'string':
        case 'text':
        case 'link':
          if (a.value) out.push({ attributes: { path, string_contains: a.value } });
          break;
        case 'enum':
        case 'reference':
        case 'file':
          if (a.value) out.push({ attributes: { path, equals: a.value } });
          break;
        case 'boolean':
          if (a.value === 'true' || a.value === 'false') {
            out.push({ attributes: { path, equals: a.value === 'true' } });
          }
          break;
        case 'long':
        case 'double': {
          if (a.value !== undefined && a.value !== '') {
            const n = Number(a.value);
            if (Number.isFinite(n)) out.push({ attributes: { path, equals: n } });
          }
          if (a.from !== undefined && a.from !== '') {
            const n = Number(a.from);
            if (Number.isFinite(n)) out.push({ attributes: { path, gte: n } });
          }
          if (a.to !== undefined && a.to !== '') {
            const n = Number(a.to);
            if (Number.isFinite(n)) out.push({ attributes: { path, lte: n } });
          }
          break;
        }
        case 'date': {
          // Asia/Tashkent calendar-day bounds — SAME helper as the moment /
          // updatedAt filters above, so a доп.поля date filter agrees with the
          // rest of the list (the naive `${to}T23:59:59.999Z` UTC idiom is off by
          // the +5h offset and was replaced everywhere else; reportDateBounds util).
          // Compared as ISO strings: validateAttributeValue stores canonical
          // toISOString() (…sssZ), which sorts lexicographically == chronologically.
          const bounds = tashkentRangeBounds(a.from, a.to);
          if (bounds.gte) out.push({ attributes: { path, gte: bounds.gte.toISOString() } });
          if (bounds.lt) out.push({ attributes: { path, lt: bounds.lt.toISOString() } });
          break;
        }
      }
    }
    return out;
  }

  private parseCreate(raw: unknown): CreateCustomerOrderInput {
    const r = CreateCustomerOrderSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateCustomerOrderInput {
    const r = UpdateCustomerOrderSchema.safeParse(raw);
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
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  /**
   * Money-integrity guard for position assortments — the line-item mirror of
   * {@link ensureRefs}. Every position carries `assortmentId` + `assortmentKind`,
   * but only the `product` kind sets the FK column (`productId`); `service` /
   * `bundle` / `variant` are written as raw scalars with NO foreign key and (until
   * now) NO existence / tenant check — so a nonexistent or cross-tenant id could
   * persist and silently drive sumMinor + reservations. Service + bundle are
   * Product rows (kind='service'/'bundle'); variant is a Variant row — both are
   * account-scoped, so we look each id up in the right table within the caller's
   * tenant. No-op for an empty list. Throws on the first missing / foreign id.
   */
  private async ensureAssortmentsInTenant(
    accountId: string,
    positions: ReadonlyArray<{ assortmentKind: string; assortmentId: string }>,
  ): Promise<void> {
    if (positions.length === 0) return;
    const productIds = [
      ...new Set(
        positions.filter((p) => p.assortmentKind !== 'variant').map((p) => p.assortmentId),
      ),
    ];
    const variantIds = [
      ...new Set(
        positions.filter((p) => p.assortmentKind === 'variant').map((p) => p.assortmentId),
      ),
    ];
    const [products, variants] = await Promise.all([
      productIds.length
        ? this.prisma.client.product.findMany({
            where: { id: { in: productIds }, accountId },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
      variantIds.length
        ? this.prisma.client.variant.findMany({
            where: { id: { in: variantIds }, accountId },
            select: { id: true },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);
    const foundProducts = new Set(products.map((p) => p.id));
    const foundVariants = new Set(variants.map((v) => v.id));
    for (const id of productIds) {
      if (!foundProducts.has(id)) throw new BadRequestException(`Tovar topilmadi: ${id}`);
    }
    for (const id of variantIds) {
      if (!foundVariants.has(id)) throw new BadRequestException(`Modifikatsiya topilmadi: ${id}`);
    }
  }

  /**
   * Tenant guard for the OPTIONAL header references — «Договор» / «Проект» /
   * «Канал продаж» / «Статус». Each is written as a scalar FK (create) or a
   * relation connect (update) with no accountId scoping, so a cross-tenant
   * existing id could be attached. Validates every supplied id within the
   * caller's tenant (statusId must additionally be a customerorder State).
   * No-op for null/undefined refs. (organizationAccount + agentAccount have
   * their own money-routing guards; owner/group are validated separately.)
   */
  private async ensureOptionalRefs(
    accountId: string,
    refs: {
      contractId?: string | null;
      projectId?: string | null;
      salesChannelId?: string | null;
      statusId?: string | null;
    },
  ): Promise<void> {
    const checks: Promise<void>[] = [];
    if (refs.contractId) {
      checks.push(
        this.prisma.client.contract
          .findFirst({ where: { id: refs.contractId, accountId }, select: { id: true } })
          .then((r) => {
            if (!r) throw new BadRequestException('Shartnoma topilmadi');
          }),
      );
    }
    if (refs.projectId) {
      checks.push(
        this.prisma.client.project
          .findFirst({ where: { id: refs.projectId, accountId }, select: { id: true } })
          .then((r) => {
            if (!r) throw new BadRequestException('Loyiha topilmadi');
          }),
      );
    }
    if (refs.salesChannelId) {
      checks.push(
        this.prisma.client.salesChannel
          .findFirst({ where: { id: refs.salesChannelId, accountId }, select: { id: true } })
          .then((r) => {
            if (!r) throw new BadRequestException('Sotuv kanali topilmadi');
          }),
      );
    }
    if (refs.statusId) {
      checks.push(
        this.prisma.client.state
          .findFirst({
            where: { id: refs.statusId, accountId, entityType: 'customerorder' },
            select: { id: true },
          })
          .then((r) => {
            if (!r) throw new BadRequestException('Holat topilmadi');
          }),
      );
    }
    await Promise.all(checks);
  }

  /**
   * The account's DEFAULT custom order status — the first active (non-archived)
   * State (entityType="customerorder") by position. moysklad auto-applies it to
   * every new order so the «Статус» column is never blank. Null for accounts
   * that define no order statuses (then the column legitimately stays empty).
   */
  private async resolveDefaultStatusId(accountId: string): Promise<string | null> {
    const first = await this.prisma.client.state.findFirst({
      where: { accountId, entityType: 'customerorder', archived: false },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    return first?.id ?? null;
  }

  /** Auto-number: NNNNN — 5-digit-padded per-account sequence (atomic, collision-safe). */
  private async nextOrderName(accountId: string): Promise<string> {
    // moysklad-parity: customer orders are numbered «03832» — a 5-digit
    // zero-padded integer, NO «ЗП-YYYY-» prefix (the user flagged the lettered
    // format; climart's #customerorder shows 03832 / 02431). Year-less counter
    // key → one continuous sequence (no annual reset). The 2026-06-18 renumber
    // migration pre-seeds the counter for the demo account, so seed() below
    // runs only for fresh accounts → 0 → first name "00001".
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'customerorder',
      async () => {
        const rows = await this.prisma.client.customerOrder.findMany({
          where: { accountId },
          select: { name: true },
        });
        let max = 0;
        for (const r of rows) {
          if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
        }
        return max;
      },
    );
    return String(n).padStart(5, '0');
  }

  /**
   * Compute document totals from positions.
   * sum = Σ positions[].quantity * price * (1 - discount/100)
   * vatSum = Σ vat line (either from price-incl or price-excl)
   *
   * All arithmetic in bigint tiyin (minor units). Price stored as bigint.
   */
  private computeTotals(
    positions: Array<{
      quantity: unknown; // Prisma Decimal
      priceMinor: bigint;
      discount: unknown; // Prisma Decimal
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

  /**
   * Money of the SHIPPED portion of every line — the header «Отгружено» sum.
   * Same per-line rounding as applyShipment (single pass through
   * computePositionTotal over shippedQty) so update()'s re-materialization
   * lands on the identical value applyShipment would produce.
   */
  private computeShippedSum(
    positions: Array<{
      quantity: unknown; // Prisma Decimal
      shippedQty: unknown; // Prisma Decimal
      priceMinor: bigint;
      discount: unknown; // Prisma Decimal
      vat: number | null;
      vatEnabled: boolean;
    }>,
    docVatEnabled: boolean,
    vatIncluded: boolean,
  ): bigint {
    let shippedSumMinor = 0n;
    for (const p of positions) {
      const qty = Number(String(p.quantity));
      const shipped = Number(String(p.shippedQty));
      if (qty <= 0 || shipped <= 0) continue;
      const { totalMinor } = computePositionTotal(
        {
          quantity: String(p.shippedQty),
          priceMinor: String(p.priceMinor),
          discount: String(p.discount ?? '0'),
          vat: p.vat ?? null,
        },
        docVatEnabled && p.vatEnabled,
        vatIncluded,
      );
      shippedSumMinor += totalMinor;
    }
    return shippedSumMinor;
  }

  /**
   * State transition validation. Only valid edges from the FSM in
   * docs/moysklad-reference/workflows/customerorder.json.
   */
  private validateTransition(
    from: OrderState,
    target: OrderState,
    _order: { positions?: unknown },
  ): OrderState {
    const allowed: Record<OrderState, OrderState[]> = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['awaiting_payment', 'partially_shipped', 'paid', 'cancelled', 'draft'],
      awaiting_payment: ['paid', 'partially_shipped', 'cancelled'],
      paid: ['partially_shipped', 'fully_shipped', 'closed'],
      partially_shipped: ['fully_shipped', 'cancelled'],
      fully_shipped: ['closed'],
      closed: [],
      cancelled: [],
    };
    if (!allowed[from]?.includes(target)) {
      throw new BadRequestException(
        `O'tkazilmaydi: ${from} → ${target}. Ruxsat etilgan: ${allowed[from].join(', ') || '—'}`,
      );
    }
    return target;
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
        entity: 'CustomerOrder',
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
        `Bu qiymat bilan buyurtma allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
