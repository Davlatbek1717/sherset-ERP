import type { Prisma } from '@moysklad/db';
import { computePositionTotal } from '@moysklad/money';
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
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromCustomerOrderSchema,
  type CreateInvoiceOutInput,
  CreateInvoiceOutSchema,
  type InvoiceOutFilterInput,
  InvoiceOutFilterSchema,
  type InvoiceOutState,
  InvoiceOutTransitionSchema,
  type InvoiceOutTransitionTarget,
  type UpdateInvoiceOutInput,
  UpdateInvoiceOutSchema,
} from './invoice-out.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

@Injectable()
export class InvoiceOutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CustomerOrderService) private readonly co: CustomerOrderService,
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = InvoiceOutFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

    // Relational sort: 'agent' / 'organization' need Prisma's nested
    // `{ relation: { field } }` form. Other keys are plain columns on the
    // invoice row.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.invoiceOut.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        customerOrder: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.invoiceOut.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad list footer «Итого» — sums the ENTIRE filtered set (all pages), not
   * just the current page. Mirrors invoice-in/customer-order. `currencies` lets the
   * UI show «—» when the filtered set mixes document currencies (un-summable).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = InvoiceOutFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);
    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.invoiceOut.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          payedSumMinor: true,
          shippedSumMinor: true,
        },
      }),
      this.prisma.client.invoiceOut.groupBy({ by: ['currency'], where }),
    ]);
    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      shippedSumMinor: toStr(agg._sum.shippedSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror demand.service /
   * customer-order.service so the InvoiceOut filter panel reaches moysklad
   * «Счета покупателям» parity (~18 fields) without two-place drift.
   *
   * «Оплата» is a derived clause comparing payedSumMinor vs sumMinor via
   * Prisma 5 field references (`fields.sumMinor`) — exactly how the demand
   * and customer-order services handle paymentStatus. InvoiceOut carries
   * the `payedSumMinor` column (populated by the PaymentIn cascade), so the
   * cross-column compare is sound.
   */
  private buildListWhere(
    accountId: string,
    filter: InvoiceOutFilterInput,
    // «Кто изменил» — InvoiceOut has NO modifiedById column, so list()/
    // aggregateTotals() pre-query the auditLog and pass the matched entityIds
    // here. `[]` (requested but zero audit rows) forces an EMPTY result.
    extraIdFilter?: string[],
  ): Prisma.InvoiceOutWhereInput {
    const fields = this.prisma.client.invoiceOut.fields;

    // «Оплата» — payedSumMinor vs sumMinor cross-column compare.
    const paymentClause: Prisma.InvoiceOutWhereInput | null = (() => {
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

    // «Отгружено» — shippedSumMinor vs sumMinor cross-column compare (mirror «Оплата»).
    const shippedClause: Prisma.InvoiceOutWhereInput | null = (() => {
      switch (filter.shippedStatus) {
        case 'not_shipped':
          return { shippedSumMinor: 0n };
        case 'partial':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gt: 0n, lt: fields.sumMinor } };
        case 'shipped':
          return { sumMinor: { gt: 0n }, shippedSumMinor: { gte: fields.sumMinor } };
        default:
          return null;
      }
    })();

    const paymentPlannedRange =
      filter.paymentPlannedFrom || filter.paymentPlannedTo
        ? {
            paymentPlannedMoment: tashkentRangeBounds(
              filter.paymentPlannedFrom,
              filter.paymentPlannedTo,
            ),
          }
        : {};

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

    // «Группа контрагента» (agent.groupId) + «Владелец контрагента»
    // (agent.ownerId) both narrow the SAME `agent` relation. Merge them into a
    // single `agent:{}` clause — two separate `...(x ? { agent: {…} } : {})`
    // spreads would collide on the `agent` key (object-literal last-key-wins),
    // silently dropping one predicate. Mirrors the invoices-in/supplies fix.
    // Single + multi (Ids) variants both narrow the agent sub-object; merge so a
    // second `agent` key can't clobber the first (object-literal last-key-wins).
    // «Группа контрагента» (agent.groupId) + «Владелец контрагента»
    // (agent.ownerId), single OR multi, both narrow the SAME `agent` relation.
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
    // moysklad inline checkbox-dropdown). Collected into an `AND[]` of typed
    // clauses, NOT spread inline: 12+ conditional-spread ternaries in one object
    // literal make TS infer a union too complex to represent (TS2590); pushing
    // typed elements onto an annotated array sidesteps it.
    const and: Prisma.InvoiceOutWhereInput[] = [];
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
    if (filter.customerOrderId) and.push({ customerOrderId: filter.customerOrderId });
    if (filter.projectIds) and.push({ projectId: { in: filter.projectIds } });
    else if (filter.projectId) and.push({ projectId: filter.projectId });
    if (filter.contractIds) and.push({ contractId: { in: filter.contractIds } });
    else if (filter.contractId) and.push({ contractId: filter.contractId });
    if (filter.salesChannelIds) and.push({ salesChannelId: { in: filter.salesChannelIds } });
    else if (filter.salesChannelId) and.push({ salesChannelId: filter.salesChannelId });
    if (filter.groupIds) and.push({ groupId: { in: filter.groupIds } });
    else if (filter.groupId) and.push({ groupId: filter.groupId });
    if (filter.ownerIds) and.push({ ownerId: { in: filter.ownerIds } });
    else if (filter.ownerId) and.push({ ownerId: filter.ownerId });
    if (filter.productIds)
      and.push({ positions: { some: { productId: { in: filter.productIds } } } });
    else if (filter.productId) and.push({ positions: { some: { productId: filter.productId } } });

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(paymentClause ?? {}),
      ...(shippedClause ?? {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...momentRange,
      ...updatedRange,
      ...paymentPlannedRange,
      ...sumRange,
      ...(and.length ? { AND: and } : {}),
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
   * «Кто изменил» (modifiedById) — InvoiceOut has no modifiedById column, so we
   * approximate via the auditLog: the DISTINCT entityIds this account's InvoiceOut
   * rows were `update`d on by the requested user. Returns `undefined` when none
   * requested (no narrowing) or `[]` when requested but no audit row matches
   * (forces an EMPTY result, not match-all). Mirror loss / invoice-in.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: InvoiceOutFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedById && !filter.modifiedByIds?.length) return undefined;
    const userIds = filter.modifiedByIds ?? (filter.modifiedById ? [filter.modifiedById] : []);
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'InvoiceOut',
        userId: { in: userIds },
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  async findById(accountId: string, id: string) {
    const invoice = await this.prisma.client.invoiceOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        owner: { select: { id: true, name: true, email: true } },
        customerOrder: { select: { id: true, name: true, state: true } },
        salesChannel: { select: { id: true, name: true } },
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
    if (!invoice) throw new NotFoundException(`InvoiceOut ${id} not found`);
    return invoice;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId);
    if (parsed.customerOrderId) {
      await this.ensureCustomerOrder(accountId, parsed.customerOrderId);
    }
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId,
    );

    const name = await this.nextInvoiceName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'InvoiceOut',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner popover (else fall back to the
    // creator + their dept). Tenant-validate the refs so a hand-crafted request
    // can't point ownerId/groupId at another account (mirrors invoice-in.create).
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
      const created = await this.prisma.client.invoiceOut.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          groupId: parsed.groupId ?? creatorGroupId,
          shared: parsed.shared ?? false,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          customerOrderId: parsed.customerOrderId ?? null,
          storeId: parsed.storeId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          externalCode: parsed.externalCode ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          paymentPlannedMoment: parsed.paymentPlannedMoment
            ? new Date(parsed.paymentPlannedMoment)
            : null,
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
              customerOrderPositionId: p.customerOrderPositionId ?? null,
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
      const saved = await this.prisma.client.invoiceOut.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'invoiceout', 'CREATE', created.id);

      // «Проведено» checked on the create form (moysklad default) → post the freshly
      // created draft, reusing the tested `post()` cascade (state→posted, counterparty
      // balance += sum, CO.invoicedSum cascade). Keeps /new → /[id] consistent (the
      // saved doc shows «Проведено» checked, not a draft that flips on redirect).
      if (parsed.applicable) {
        const fresh = await this.findById(accountId, created.id);
        return this.post(accountId, userId, created.id, fresh);
      }
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async createFromCustomerOrder(
    accountId: string,
    userId: string,
    customerOrderId: string,
    raw: unknown,
  ) {
    const parsed = CreateFromCustomerOrderSchema.parse(raw ?? {});
    const order = await this.co.findById(accountId, customerOrderId);

    const positions = order.positions
      .map((cop) => {
        const want = parsed.quantities?.[cop.id] ?? String(cop.quantity);
        const wantNum = Number(want);
        if (wantNum <= 0) return null;
        return {
          assortmentKind: cop.assortmentKind as 'product',
          assortmentId: cop.assortmentId,
          customerOrderPositionId: cop.id,
          quantity: want,
          priceMinor: cop.priceMinor.toString(),
          discount: cop.discount.toString(),
          vat: cop.vat ?? null,
          vatEnabled: cop.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Pozitsiyalar yo'q");
    }

    return this.create(accountId, userId, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      customerOrderId,
      paymentPlannedMoment: parsed.paymentPlannedMoment ?? null,
      vatEnabled: order.vatEnabled,
      vatIncluded: order.vatIncluded,
      currency: order.currency,
      rateValue: order.rateValue.toString(),
      // A CO→invoice is created as a draft (the user posts it deliberately);
      // shared off. (Both carry zod defaults but the parsed OUTPUT type lists them.)
      shared: false,
      applicable: false,
      positions,
    } satisfies CreateInvoiceOutInput);
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno schyotni o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.InvoiceOutUpdateInput = {};
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
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'InvoiceOut',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.customerOrderId !== undefined) {
      data.customerOrder = parsed.customerOrderId
        ? { connect: { id: parsed.customerOrderId } }
        : { disconnect: true };
    }
    if (parsed.salesChannelId !== undefined) {
      data.salesChannel = parsed.salesChannelId
        ? { connect: { id: parsed.salesChannelId } }
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

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so a
      // version conflict (409) rolls back the delete instead of leaving the
      // positions destroyed (Class A data-integrity guard).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          customerOrderPositionId: p.customerOrderPositionId ?? null,
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
      // header update + the two-step totals write run in ONE transaction. If
      // the optimistic-lock version filter misses (concurrent edit), update#1
      // touches zero rows → P2025 → the deleteMany rolls back, so the positions
      // are NOT lost. Only update#1 carries the version filter + increment;
      // update#2 (totals) is keyed on { id, accountId } because update#1 has
      // already bumped the row to N+1 — a version filter there would always
      // miss and false-409.
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.invoiceOutPosition.deleteMany({ where: { invoiceOutId: id, accountId } });
        }
        const updated = await tx.invoiceOut.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.invoiceOut.update({
          where: { id, accountId },
          data: totals,
        });
      });
      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'invoiceout', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'InvoiceOut');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = InvoiceOutTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: InvoiceOutTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : target === 'mark_sent'
            ? await this.markSent(accountId, userId, id, existing)
            : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'invoiceout', 'UPDATE', id, ['state']);
    return result;
  }

  /**
   * Mark a posted invoice as 'sent' to the customer. Used by:
   *   - manual button click (after print or download)
   *   - email subsystem (when delivery confirmed)
   *
   * Idempotent: re-marking an already-sent invoice is a no-op return.
   * Once 'partially_paid' or 'paid', `sent` is no longer reachable —
   * the payment cascade has already moved the FSM forward.
   */
  private async markSent(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceOutService['findById']>>,
  ) {
    if (existing.state === 'sent') return existing;
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → sent. Faqat posted'dan`);
    }
    const updated = await this.prisma.client.invoiceOut.update({
      where: { id, accountId },
      data: { state: 'sent' },
    });
    await this.logAudit(accountId, userId, 'transition:sent', id, {
      from: { before: 'posted', after: 'sent' },
    });
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    const invoice = await this.findById(accountId, id);
    if (invoice.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagi schyotni o'chirish mumkin");
    }
    await this.prisma.client.invoiceOut.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'invoiceout', 'DELETE', id);
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
    const updated = await this.prisma.client.invoiceOut.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'invoiceout', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.invoiceOut.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'invoiceout', 'UPDATE', id, ['printed']);
    return updated;
  }

  /**
   * Clone an existing invoice into a fresh draft. Mirrors moysklad's
   * "Скопировать" — copies header + positions, resets state to 'draft',
   * detaches any payments/customer-order link.
   */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.invoiceOut.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Schyot topilmadi');
    }
    const name = await this.nextInvoiceName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.invoiceOut.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        customerOrderId: source.customerOrderId,
        storeId: source.storeId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        salesChannelId: source.salesChannelId,
        contractId: source.contractId,
        projectId: source.projectId,
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
    this.webhookFire.fireForEvent(accountId, 'invoiceout', 'CREATE', created.id);
    return created;
  }

  /**
   * Apply a payment delta (from PaymentIn transition).
   *
   * Contract (called from PaymentInService, inside its $transaction):
   *   - Increments or decrements InvoiceOut.payedSumMinor
   *   - Auto-transitions state:
   *       payed >= sum              → paid
   *       0 < payed < sum           → partially_paid
   *       payed == 0 (full revert)  → back to posted/sent (whichever it was before)
   *   - Writes audit entry on state change
   *
   * Guard: invoice must be applicable (posted/sent/partially_paid/paid/overdue).
   * Cannot apply payment to draft or cancelled invoices.
   */
  async applyPayment(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    invoiceOutId: string,
    amountMinor: bigint,
    direction: 'apply' | 'revert',
  ): Promise<void> {
    const invoice = await tx.invoiceOut.findFirst({
      where: { id: invoiceOutId, accountId, deletedAt: null },
    });
    if (!invoice) throw new NotFoundException(`InvoiceOut ${invoiceOutId} not found`);

    const applicableStates = ['posted', 'sent', 'partially_paid', 'paid', 'overdue'];
    if (!applicableStates.includes(invoice.state)) {
      throw new BadRequestException(
        `InvoiceOut ${invoice.name} holatida to'lovni qabul qilib bo'lmaydi (state=${invoice.state}). Oldin provedeno qiling.`,
      );
    }

    const sign = direction === 'apply' ? 1n : -1n;
    const newPayed = invoice.payedSumMinor + amountMinor * sign;
    if (newPayed < 0n) {
      throw new BadRequestException(
        "To'langan summa manfiy bo'la olmaydi — revert qiymati ortiqcha",
      );
    }

    // Determine new state
    const currentState = invoice.state;
    let newState: string = currentState;
    if (newPayed >= invoice.sumMinor && invoice.sumMinor > 0n) {
      newState = 'paid';
    } else if (newPayed > 0n) {
      newState = 'partially_paid';
    } else {
      // newPayed === 0: revert to posted (or sent, if published was true)
      newState = invoice.published ? 'sent' : 'posted';
    }

    await tx.invoiceOut.update({
      where: { id: invoiceOutId, accountId },
      data: {
        payedSumMinor: newPayed,
        state: newState,
      },
    });

    if (newState !== currentState) {
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceOut',
          entityId: invoiceOutId,
          action: `transition:${newState}`,
          fieldChanges: {
            from: { before: currentState, after: newState },
            payedSumMinor: { before: invoice.payedSumMinor.toString(), after: newPayed.toString() },
          } as Prisma.InputJsonValue,
        },
      });
    }

    // Cascade to linked CustomerOrder — CO owns its own payedSumMinor aggregate
    // + auto-transitions to paid/closed when conditions are met.
    if (invoice.customerOrderId) {
      await this.co.applyPayment(
        tx,
        accountId,
        userId,
        invoice.customerOrderId,
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
    existing: Awaited<ReturnType<InvoiceOutService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }
    if (existing.positions.length === 0) {
      throw new BadRequestException("Pozitsiyalar yo'q — provedeno qilib bo'lmaydi");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.invoiceOut.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });

      // Counterparty balance: we billed them → they owe us more.
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        existing.sumMinor,
      );

      if (existing.customerOrderId) {
        await this.co.applyInvoice(
          tx,
          accountId,
          existing.customerOrderId,
          existing.sumMinor,
          'invoice',
        );
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceOut',
          entityId: id,
          action: 'transition:posted',
          fieldChanges: { from: { before: 'draft', after: 'posted' } } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceOutService['findById']>>,
  ) {
    if (existing.state !== 'posted' && existing.state !== 'sent') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → draft. Faqat posted / sent dan`,
      );
    }
    if (existing.payedSumMinor > 0n) {
      throw new BadRequestException("To'lov qabul qilingan schyotni draft'ga qaytarib bo'lmaydi");
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.invoiceOut.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });

      // Revert counterparty balance (we are no longer billing them).
      await this.balance.applyDelta(
        tx,
        accountId,
        existing.agentId,
        existing.currency,
        -existing.sumMinor,
      );

      if (existing.customerOrderId) {
        await this.co.applyInvoice(
          tx,
          accountId,
          existing.customerOrderId,
          existing.sumMinor,
          'revert',
        );
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceOut',
          entityId: id,
          action: 'transition:unposted',
          fieldChanges: {
            from: { before: existing.state, after: 'draft' },
          } as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<InvoiceOutService['findById']>>,
  ) {
    if (existing.state === 'cancelled' || existing.state === 'paid') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → cancelled. Oldin cancel qilingan yoki to'liq to'langan`,
      );
    }
    if (existing.payedSumMinor > 0n) {
      throw new BadRequestException(
        "To'lov qabul qilingan schyotni cancel qilib bo'lmaydi — avval refund kerak",
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const wasApplicable = existing.applicable;
      const updated = await tx.invoiceOut.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });

      // Revert balance + CO.invoicedSumMinor only if we were applicable.
      if (wasApplicable) {
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          -existing.sumMinor,
        );
        if (existing.customerOrderId) {
          await this.co.applyInvoice(
            tx,
            accountId,
            existing.customerOrderId,
            existing.sumMinor,
            'revert',
          );
        }
      }

      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'InvoiceOut',
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

  private parseCreate(raw: unknown): CreateInvoiceOutInput {
    const r = CreateInvoiceOutSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateInvoiceOutInput {
    const r = UpdateInvoiceOutSchema.safeParse(raw);
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
    if (!agent) throw new BadRequestException('Kontragent topilmadi');
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
  }

  private async ensureCustomerOrder(accountId: string, customerOrderId: string): Promise<void> {
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new BadRequestException('CustomerOrder topilmadi');
  }

  private async nextInvoiceName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `СЧ-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.invoiceOut.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    return `${prefix}${String(n).padStart(5, '0')}`;
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
        k === 'customerOrder'
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
        entity: 'InvoiceOut',
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
        `Bu qiymat bilan schyot allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}

// Type guard (unused re-export); keeps InvoiceOutState import live.
export type { InvoiceOutState };
