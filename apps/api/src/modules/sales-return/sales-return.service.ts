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
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { computePerUnitCost } from '../demand/fifo-consumer.js';
import { HR_EVENT, type SalesReturnPostedEvent } from '../hr/hr-shared/hr-events.types.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { assertOrgAccountMatchesOrg } from '../shared/org-account.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  CreateFromDemandSchema,
  type CreateSalesReturnInput,
  CreateSalesReturnSchema,
  type SalesReturnFilterInput,
  SalesReturnFilterSchema,
  SalesReturnTransitionSchema,
  type SalesReturnTransitionTarget,
  type UpdateSalesReturnInput,
  UpdateSalesReturnSchema,
} from './sales-return.schema.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

/**
 * SalesReturnService — inbound stock side (goods back from customer).
 *
 * post() contract:
 *   1. Positive StockDeltas (restore inventory)
 *   2. StockService.applyDeltas inside Serializable tx
 *   3. If any position has demandPositionId → CustomerOrderService.applyShipment(
 *        tx, customerOrderId, deltas, direction='revert')
 *      This decrements Demand's linked shippedQty in CO + rolls CO state back
 *      (fully_shipped → partially_shipped / confirmed).
 *   4. Audit event 'salesreturn.posted'.
 */
@Injectable()
export class SalesReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(CustomerOrderService) private readonly co: CustomerOrderService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SalesReturnFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for agent/organization/store
    // (Prisma `{ relation: { field } }`). Other keys are flat.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : filter.sortBy === 'store'
            ? { store: { name: filter.sortDir } }
            : { [filter.sortBy]: filter.sortDir };
    const rows = await this.prisma.client.salesReturn.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        agent: { select: { id: true, name: true, legalTitle: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        demand: { select: { id: true, name: true } },
        customerOrder: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.salesReturn.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad list footer «Итого» — sums the ENTIRE filtered set (all pages), not
   * just the current page. Mirrors invoice-out/demand. `currencies` lets the UI
   * show «—» when the filtered set mixes document currencies (un-summable).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = SalesReturnFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);
    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.salesReturn.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          payedSumMinor: true,
        },
      }),
      this.prisma.client.salesReturn.groupBy({ by: ['currency'], where }),
    ]);
    const toStr = (v: bigint | null) => (v ?? 0n).toString();
    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses the
   * active filter set). Extracted to mirror invoice-out.service /
   * demand.service so the SalesReturn filter panel reaches moysklad
   * «Возвраты покупателей» parity (~17 fields) without two-place drift.
   *
   * «Группа контрагента» resolves through the `agent` (Counterparty) relation's
   * `groupId`. All other backed fields are flat columns on the return row.
   * Keeps the accountId tenant guard + deletedAt/includeDeleted handling.
   */
  private buildListWhere(
    accountId: string,
    filter: SalesReturnFilterInput,
  ): Prisma.SalesReturnWhereInput {
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
      ...(filter.agentId ? { agentId: filter.agentId } : {}),
      ...(filter.agentGroupId ? { agent: { groupId: filter.agentGroupId } } : {}),
      ...(filter.agentAccountId ? { agentAccountId: filter.agentAccountId } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationAccountId
        ? { organizationAccountId: filter.organizationAccountId }
        : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.demandId ? { demandId: filter.demandId } : {}),
      ...(filter.customerOrderId ? { customerOrderId: filter.customerOrderId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.salesChannelId ? { salesChannelId: filter.salesChannelId } : {}),
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
              { reason: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const sr = await this.prisma.client.salesReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        owner: { select: { id: true, name: true, email: true } },
        demand: { select: { id: true, name: true, state: true } },
        customerOrder: { select: { id: true, name: true, state: true } },
        salesChannel: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        agentAccount: { select: { id: true, accountNumber: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
            // moysklad «Страна» — resolve country name for the position row.
            country: { select: { id: true, name: true, code: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!sr) throw new NotFoundException(`SalesReturn ${id} not found`);
    return sr;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.demandId) await this.ensureDemand(accountId, parsed.demandId);
    if (parsed.customerOrderId) await this.ensureCustomerOrder(accountId, parsed.customerOrderId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId,
    );

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'SalesReturn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.salesReturn.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          demandId: parsed.demandId ?? null,
          customerOrderId: parsed.customerOrderId ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
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
              demandPositionId: p.demandPositionId ?? null,
              quantity: p.quantity,
              priceMinor: BigInt(p.priceMinor),
              discount: p.discount ?? '0',
              vat: p.vat ?? null,
              vatEnabled: p.vatEnabled,
              gtdNumber: p.gtdNumber ?? null,
              gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
              countryId: p.countryId ?? null,
            })),
          },
        },
        include: { positions: true },
      });

      const totals = this.computeTotals(created.positions, parsed.vatEnabled, parsed.vatIncluded);
      const saved = await this.prisma.client.salesReturn.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'salesreturn', 'CREATE', created.id);
      return saved;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  /**
   * Create a SalesReturn pre-filled from a Demand. Each SR position back-links
   * to the corresponding Demand position via demandPositionId. Default qty per
   * line = Demand position quantity ("full return"). Override via
   * `quantities[positionId]`.
   */
  async createFromDemand(accountId: string, userId: string, demandId: string, raw: unknown) {
    const parsed = CreateFromDemandSchema.parse(raw ?? {});
    const demand = await this.prisma.client.demand.findFirst({
      where: { id: demandId, accountId, deletedAt: null },
      include: {
        positions: true,
      },
    });
    if (!demand) throw new BadRequestException('Demand topilmadi');

    if (demand.state !== 'posted') {
      throw new BadRequestException(
        `Demand '${demand.state}' holatida — faqat 'posted' demand'dan qaytarish mumkin`,
      );
    }

    const storeId = parsed.storeId ?? demand.storeId;

    const positions = demand.positions
      .map((dp) => {
        const want = parsed.quantities?.[dp.id] ?? String(dp.quantity);
        const wantNum = Number(want);
        if (wantNum <= 0) return null;
        if (wantNum > Number(String(dp.quantity))) {
          throw new BadRequestException(
            `Position ${dp.id}: original quantity ${String(dp.quantity)} dan ortiq qaytarish mumkin emas (${wantNum})`,
          );
        }
        return {
          assortmentKind: dp.assortmentKind as 'product',
          assortmentId: dp.assortmentId,
          demandPositionId: dp.id,
          quantity: want,
          priceMinor: dp.priceMinor.toString(),
          discount: dp.discount.toString(),
          vat: dp.vat ?? null,
          vatEnabled: dp.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Qaytariladigan pozitsiyalar yo'q");
    }

    return this.create(accountId, userId, {
      agentId: demand.agentId,
      organizationId: demand.organizationId,
      storeId,
      demandId: demand.id,
      customerOrderId: demand.customerOrderId,
      reason: parsed.reason ?? null,
      vatEnabled: demand.vatEnabled,
      vatIncluded: demand.vatIncluded,
      currency: demand.currency,
      rateValue: demand.rateValue.toString(),
      positions,
    });
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno qaytarishni o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.SalesReturnUpdateInput = {};
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
        'SalesReturn',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }
    if (parsed.demandId !== undefined) {
      data.demand = parsed.demandId ? { connect: { id: parsed.demandId } } : { disconnect: true };
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

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so a
      // version conflict (409) rolls back the delete instead of leaving the
      // positions destroyed (data corruption). Class A pattern.
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          demandPositionId: p.demandPositionId ?? null,
          quantity: p.quantity,
          priceMinor: BigInt(p.priceMinor),
          discount: p.discount ?? '0',
          vat: p.vat ?? null,
          vatEnabled: p.vatEnabled,
          gtdNumber: p.gtdNumber ?? null,
          gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
          countryId: p.countryId ?? null,
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the update touches zero rows → P2025
      // → the deleteMany rolls back, so the positions are NOT lost. Only the
      // header update#1 carries the version filter/increment; the totals
      // update#2 is keyed on {id, accountId} (update#1 already bumped the row,
      // so a version filter there would always false-409).
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.salesReturnPosition.deleteMany({
            where: { salesReturnId: id, accountId },
          });
        }
        const updated = await tx.salesReturn.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.salesReturn.update({
          where: { id, accountId },
          data: totals,
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id);
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'SalesReturn');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = SalesReturnTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: SalesReturnTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: state check + soft-delete are ONE atomic conditional write,
    // so a concurrent post() flipping draft→posted can't slip a delete through.
    const res = await this.prisma.client.salesReturn.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi qaytarishni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'DELETE', id);
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
    const updated = await this.prisma.client.salesReturn.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.salesReturn.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.salesReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Qaytarish topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.salesReturn.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        // moysklad Скопировать preserves all header refs (was lossy before).
        demandId: source.demandId,
        customerOrderId: source.customerOrderId,
        salesChannelId: source.salesChannelId,
        contractId: source.contractId,
        projectId: source.projectId,
        organizationAccountId: source.organizationAccountId,
        agentAccountId: source.agentAccountId,
        externalCode: source.externalCode,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» keeps the return reason + currency + rate
        // (§8.3 header preservation — these were dropped on clone).
        reason: source.reason,
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
            // moysklad «Скопировать» preserves the customs block too (§8.3).
            gtdNumber: p.gtdNumber,
            gtdSumMinor: p.gtdSumMinor,
            countryId: p.countryId,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SalesReturnService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted allowed (current: ${existing.state})`);
    }

    const posted = await this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 →
        // clean 409 — never a second stock re-entry / cost write.
        const claim = await tx.salesReturn.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Qaytarish allaqachon o'tkazilgan yoki 'draft' holatida emas",
          );
        }

        // Cost-of-goods basis for the customer return: goods RE-ENTER
        // inventory at the store's current WEIGHTED-AVERAGE unit cost
        // (Stock.costBalanceMinor ÷ qty-on-hand) — NOT the sale price. The old
        // code restored at `priceAfterDisc`, so every posted return inflated
        // Stock.costBalanceMinor by the margin (sale − cost) × qty and the
        // store average drifted upward (the buyPrice/cost runtime bug-class,
        // sibling of Loss 3add5a13). Read the locked balances BEFORE applying
        // the inbound delta so the basis is the pre-return shelf average, then
        // freeze p.costMinor so unpost/cancel reverse the identical value
        // (cost zero-sum). Limitation (documented, same as Loss): if the item
        // is sold-out (qty-on-hand 0) the average is unknown → 0 basis; a
        // buyPrice fallback is a deferred grounding-gated enhancement.
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
            qtyDelta: String(p.quantity),
            costDeltaMinor: valueMinor,
            docType: 'salesreturn',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          };
        });

        // Freeze the per-unit cost so unpost/cancel reverse the exact value.
        for (const p of existing.positions) {
          await tx.salesReturnPosition.update({
            where: { id: p.id },
            data: { costMinor: perUnitByPos.get(p.id) ?? 0n },
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.salesReturn.update({
          where: { id, accountId },
          data: { state: 'posted', applicable: true, postedAt: new Date() },
        });

        // Cascade to CustomerOrder if we can resolve it via linked Demand
        // positions' customerOrderPositionId back-links.
        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.demandPositionId)
            .map(async (p) => {
              // Find the Demand position → its customerOrderPositionId
              const dp = await tx.demandPosition.findUnique({
                where: { id: p.demandPositionId as string },
                select: { customerOrderPositionId: true },
              });
              return dp?.customerOrderPositionId
                ? { positionId: dp.customerOrderPositionId, qtyDelta: String(p.quantity) }
                : null;
            });
          const resolved = (await Promise.all(coDeltas)).filter(
            (d): d is { positionId: string; qtyDelta: string } => d != null,
          );
          if (resolved.length > 0) {
            await this.co.applyShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              resolved,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'SalesReturn',
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

    // Post-commit: HR Telegram bridge listener queues a "qaytarish qabul
    // qilindi" notification for the counterparty (if a template is configured).
    const payload: SalesReturnPostedEvent = {
      accountId,
      salesReturnId: posted.id,
      counterpartyId: posted.agentId,
      totalMinor: posted.sumMinor,
      postedAt: posted.postedAt ?? new Date(),
    };
    this.events.emit(HR_EVENT.SALES_RETURN_POSTED, payload);
    return posted;
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<SalesReturnService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft allowed (current: ${existing.state})`);
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A concurrent unpost/cancel
        // blocks on the row lock, then sees count 0 → clean 409 — never a second
        // stock reversal.
        const claim = await tx.salesReturn.updateMany({
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
          // not the sale price — cost zero-sum with post().
          const costPerUnit = p.costMinor ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -valueMinor,
            docType: 'salesreturn_unpost',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          };
        });

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.salesReturn.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null },
        });

        // Revert CO cascade: re-apply shipment (direction='ship') — this
        // restores shippedQty on CO positions that we decremented during post.
        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.demandPositionId)
            .map(async (p) => {
              const dp = await tx.demandPosition.findUnique({
                where: { id: p.demandPositionId as string },
                select: { customerOrderPositionId: true },
              });
              return dp?.customerOrderPositionId
                ? { positionId: dp.customerOrderPositionId, qtyDelta: String(p.quantity) }
                : null;
            });
          const resolved = (await Promise.all(coDeltas)).filter(
            (d): d is { positionId: string; qtyDelta: string } => d != null,
          );
          if (resolved.length > 0) {
            await this.co.applyShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              resolved,
              'ship',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'SalesReturn',
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
    existing: Awaited<ReturnType<SalesReturnService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: claim the EXACT snapshotted state→cancelled so a
        // concurrent unpost (posted→draft) that already ran makes this count 0 →
        // 409, never a double stock reversal.
        const claim = await tx.salesReturn.updateMany({
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
              qtyDelta: `-${String(p.quantity)}`,
              costDeltaMinor: -valueMinor,
              docType: 'salesreturn_cancel',
              docId: id,
              docPositionId: p.id,
              reason: 'cancel',
            };
          });
          await this.stock.applyDeltas(tx, accountId, userId, deltas);

          if (existing.customerOrderId) {
            const coDeltas = existing.positions
              .filter((p) => p.demandPositionId)
              .map(async (p) => {
                const dp = await tx.demandPosition.findUnique({
                  where: { id: p.demandPositionId as string },
                  select: { customerOrderPositionId: true },
                });
                return dp?.customerOrderPositionId
                  ? { positionId: dp.customerOrderPositionId, qtyDelta: String(p.quantity) }
                  : null;
              });
            const resolved = (await Promise.all(coDeltas)).filter(
              (d): d is { positionId: string; qtyDelta: string } => d != null,
            );
            if (resolved.length > 0) {
              await this.co.applyShipment(
                tx,
                accountId,
                userId,
                existing.customerOrderId,
                resolved,
                'ship',
              );
            }
          }
        }

        const updated = await tx.salesReturn.update({
          where: { id, accountId },
          data: { state: 'cancelled', applicable: false },
        });

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'SalesReturn',
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

  private parseCreate(raw: unknown): CreateSalesReturnInput {
    const r = CreateSalesReturnSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdateSalesReturnInput {
    const r = UpdateSalesReturnSchema.safeParse(raw);
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

  private async ensureDemand(accountId: string, demandId: string): Promise<void> {
    const d = await this.prisma.client.demand.findFirst({
      where: { id: demandId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!d) throw new BadRequestException('Demand topilmadi');
  }

  private async ensureCustomerOrder(accountId: string, customerOrderId: string): Promise<void> {
    const co = await this.prisma.client.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!co) throw new BadRequestException('CustomerOrder topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(
      this.prisma.client,
      accountId,
      'salesreturn',
      async () => {
        // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
        // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
        const rows = await this.prisma.client.salesReturn.findMany({
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
        entity: 'SalesReturn',
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
