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
import { AttributeMetadataService } from '../attribute-metadata/attribute-metadata.service.js';
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { type DemandPostedEvent, HR_EVENT } from '../hr/hr-shared/hr-events.types.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
// OUTBOUND «Накладные расходы» fold — pure, adversarially tested
// (demand-overhead.test.ts). §12 helper-pattern, OUTBOUND semantics.
import { demandOverheadCostSumMinor } from './demand-overhead.js';
import {
  type CreateDemandInput,
  CreateDemandSchema,
  CreateFromCustomerOrderSchema,
  type DemandFilterInput,
  DemandFilterSchema,
  DemandTransitionSchema,
  type DemandTransitionTarget,
  type UpdateDemandInput,
  UpdateDemandSchema,
} from './demand.schema.js';
import {
  compareDecimals,
  computeLineCost,
  computePerUnitCost,
  minDecimal,
  subtractDecimals,
} from './fifo-consumer.js';

interface ComputedTotals {
  sumMinor: bigint;
  vatSumMinor: bigint;
}

/**
 * DemandService — owns outbound shipment documents.
 *
 * Collaborators:
 *   - StockService       — stock ledger + pessimistic lock
 *   - CustomerOrderService.applyShipment() — shippedSumMinor + auto-transition
 *
 * Transaction boundaries:
 *   - create/update: single $transaction (no stock writes)
 *   - post/unpost/cancel: serializable $transaction with Stock row locking
 */
@Injectable()
export class DemandService {
  private readonly logger = new Logger(DemandService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(CustomerOrderService) private readonly co: CustomerOrderService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  async list(accountId: string, userId: string, rawFilter: unknown) {
    const filter = DemandFilterSchema.parse(rawFilter);
    const baseWhere = this.buildListWhere(accountId, filter);
    // H4 record-scope (RFC W4): AND the per-record visibility filter. No-op until
    // the account opts in — recordScopeWhere returns {} when the flag is off (or
    // the actor's scope is ALL), so today's behaviour is unchanged.
    const scoped = await this.permissions.recordScopeWhere(accountId, userId, 'demand', 'view');
    const where =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;

    // Relational sort: 'agent' / 'organization' / 'store' need
    // Prisma's nested `{ relation: { field } }` form. Other keys are
    // plain columns on the demand row.
    const orderBy =
      filter.sortBy === 'agent'
        ? { agent: { name: filter.sortDir } }
        : filter.sortBy === 'organization'
          ? { organization: { name: filter.sortDir } }
          : filter.sortBy === 'store'
            ? { store: { name: filter.sortDir } }
            : { [filter.sortBy]: filter.sortDir };
    const rows = await this.prisma.client.demand.findMany({
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
    const total = await this.prisma.client.demand.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad list footer «Итого» — sums the ENTIRE filtered set (all pages), not
   * just the current page. Mirrors invoice-out/customer-order. Applies the same
   * H4 record-scope as `list()` so the footer total never exceeds what the actor
   * can actually see. `currencies` lets the UI show «—» when the filtered set
   * mixes document currencies (un-summable). Demand has no shippedSumMinor (the
   * shipment IS the demand) — only Сумма + Оплачено surface in the grid footer.
   */
  async aggregateTotals(accountId: string, userId: string, rawFilter: unknown) {
    const filter = DemandFilterSchema.parse(rawFilter);
    const baseWhere = this.buildListWhere(accountId, filter);
    const scoped = await this.permissions.recordScopeWhere(accountId, userId, 'demand', 'view');
    const where =
      Object.keys(scoped).length > 0 ? { AND: [baseWhere, scoped as typeof baseWhere] } : baseWhere;
    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.demand.aggregate({
        where,
        _count: true,
        _sum: {
          sumMinor: true,
          vatSumMinor: true,
          payedSumMinor: true,
        },
      }),
      this.prisma.client.demand.groupBy({ by: ['currency'], where }),
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

  async findById(accountId: string, id: string) {
    const demand = await this.prisma.client.demand.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        agent: true,
        organization: true,
        store: true,
        owner: { select: { id: true, name: true, email: true } },
        customerOrder: { select: { id: true, name: true, state: true } },
        salesChannel: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        consignor: { select: { id: true, name: true } },
        consignee: { select: { id: true, name: true } },
        carrier: { select: { id: true, name: true } },
        // «Счёт организации» / «Счёт контрагента» — needed so the detail page
        // can DISPLAY the picked accounts (write-path landed in bb86188f).
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
    if (!demand) throw new NotFoundException(`Demand ${id} not found`);
    return demand;
  }

  /**
   * Read-path findById with H4 record-scope enforcement (RFC W4) — used by the
   * GET endpoints. Out-of-scope records are hidden as 404 (no existence leak).
   * No-op until the account opts in (assertRecordAccess returns true when the
   * flag is off or the actor's scope is ALL). Internal write-path loads keep
   * using the plain findById above (write-scope enforcement is a later phase).
   */
  async findByIdScoped(accountId: string, userId: string, id: string) {
    const demand = await this.findById(accountId, id);
    const allowed = await this.permissions.assertRecordAccess(accountId, userId, 'demand', 'view', {
      ownerId: demand.ownerId,
      groupId: demand.groupId,
      shared: demand.shared,
    });
    if (!allowed) throw new NotFoundException(`Demand ${id} not found`);
    return demand;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.customerOrderId) {
      await this.ensureCustomerOrder(accountId, parsed.customerOrderId);
    }

    const name = await this.nextDemandName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'Demand',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.demand.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          agentId: parsed.agentId,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          customerOrderId: parsed.customerOrderId ?? null,
          salesChannelId: parsed.salesChannelId ?? null,
          contractId: parsed.contractId ?? null,
          projectId: parsed.projectId ?? null,
          organizationAccountId: parsed.organizationAccountId ?? null,
          agentAccountId: parsed.agentAccountId ?? null,
          deliveryPlannedMoment: parsed.deliveryPlannedMoment
            ? new Date(parsed.deliveryPlannedMoment)
            : null,
          paymentPlannedMoment: parsed.paymentPlannedMoment
            ? new Date(parsed.paymentPlannedMoment)
            : null,
          shipmentAddress: parsed.shipmentAddress ?? null,
          consignorId: parsed.consignorId ?? null,
          consigneeId: parsed.consigneeId ?? null,
          carrierId: parsed.carrierId ?? null,
          cargoName: parsed.cargoName ?? null,
          shipperInstructions: parsed.shipperInstructions ?? null,
          transportFacility: parsed.transportFacility ?? null,
          carNumber: parsed.carNumber ?? null,
          placesCount: parsed.placesCount ?? null,
          shippingDocNo: parsed.shippingDocNo ?? null,
          shippingDocDate: parsed.shippingDocDate ? new Date(parsed.shippingDocDate) : null,
          stateContractId: parsed.stateContractId ?? null,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          description: parsed.description,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          // «Накладные расходы» (sale-side expense; folded into
          // costSumMinor at post — see post()). FIFO/stock untouched.
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
      const saved = await this.prisma.client.demand.update({
        where: { id: created.id, accountId },
        data: totals,
      });

      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'demand', 'CREATE', created.id);
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

    const storeId = parsed.storeId ?? order.storeId;

    // Build positions from CO, capping at (quantity - shippedQty). Allow override
    // via parsed.quantities[positionId].
    const positions = order.positions
      .map((cop) => {
        const remaining = Number(String(cop.quantity)) - Number(String(cop.shippedQty));
        const wantStr = parsed.quantities?.[cop.id] ?? String(remaining);
        if (wantStr === '0') return null;
        const want = Number(wantStr);
        if (want > remaining) {
          throw new BadRequestException(
            `Position ${cop.id}: jo'natilishi mumkin bo'lgan miqdor = ${remaining}, so'ralmoqda ${want}`,
          );
        }
        if (want <= 0) return null;
        return {
          assortmentKind: cop.assortmentKind as 'product',
          assortmentId: cop.assortmentId,
          customerOrderPositionId: cop.id,
          quantity: wantStr,
          priceMinor: cop.priceMinor.toString(),
          discount: cop.discount.toString(),
          vat: cop.vat ?? null,
          vatEnabled: cop.vatEnabled,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (positions.length === 0) {
      throw new BadRequestException("Jo'natiladigan pozitsiyalar yo'q — hammasi jo'natilgan");
    }

    return this.create(accountId, userId, {
      agentId: order.agentId,
      organizationId: order.organizationId,
      storeId,
      customerOrderId,
      vatEnabled: order.vatEnabled,
      vatIncluded: order.vatIncluded,
      currency: order.currency,
      rateValue: order.rateValue.toString(),
      // A CO-derived Demand starts with zero «Накладные расходы»; the
      // user adds it later on the draft. Defaults mirror the schema.
      overheadSumMinor: '0',
      overheadDistribution: 'PRICE',
      overheadCurrency: order.currency,
      positions,
    } satisfies CreateDemandInput);
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        "Provedeno otgruzkani o'zgartirib bo'lmaydi — avval 'Snyat provedeno' qiling",
      );
    }

    const data: Prisma.DemandUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    // moysklad allows changing currency/rate on a draft — schema accepts
    // them (.partial of Create); else silently dropped (§39 sibling).
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    // «Накладные расходы» — draft-editable (update() is draft-guarded);
    // applied into costSumMinor at post(). Schema inherits via .partial().
    if (parsed.overheadSumMinor !== undefined) {
      data.overheadSumMinor = BigInt(parsed.overheadSumMinor);
    }
    if (parsed.overheadDistribution !== undefined) {
      data.overheadDistribution = parsed.overheadDistribution;
    }
    if (parsed.overheadCurrency !== undefined) {
      data.overheadCurrency = parsed.overheadCurrency;
    }
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.agentId) data.agent = { connect: { id: parsed.agentId } };
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Demand',
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
    if (parsed.deliveryPlannedMoment !== undefined) {
      data.deliveryPlannedMoment = parsed.deliveryPlannedMoment
        ? new Date(parsed.deliveryPlannedMoment)
        : null;
    }
    if (parsed.paymentPlannedMoment !== undefined) {
      data.paymentPlannedMoment = parsed.paymentPlannedMoment
        ? new Date(parsed.paymentPlannedMoment)
        : null;
    }
    if (parsed.shipmentAddress !== undefined) {
      data.shipmentAddress = parsed.shipmentAddress;
    }
    if (parsed.consignorId !== undefined) {
      data.consignor = parsed.consignorId
        ? { connect: { id: parsed.consignorId } }
        : { disconnect: true };
    }
    if (parsed.consigneeId !== undefined) {
      data.consignee = parsed.consigneeId
        ? { connect: { id: parsed.consigneeId } }
        : { disconnect: true };
    }
    if (parsed.carrierId !== undefined) {
      data.carrier = parsed.carrierId
        ? { connect: { id: parsed.carrierId } }
        : { disconnect: true };
    }
    if (parsed.cargoName !== undefined) data.cargoName = parsed.cargoName;
    if (parsed.shipperInstructions !== undefined)
      data.shipperInstructions = parsed.shipperInstructions;
    if (parsed.transportFacility !== undefined) data.transportFacility = parsed.transportFacility;
    if (parsed.carNumber !== undefined) data.carNumber = parsed.carNumber;
    if (parsed.placesCount !== undefined) data.placesCount = parsed.placesCount;
    if (parsed.shippingDocNo !== undefined) data.shippingDocNo = parsed.shippingDocNo;
    if (parsed.shippingDocDate !== undefined) {
      data.shippingDocDate = parsed.shippingDocDate ? new Date(parsed.shippingDocDate) : null;
    }
    if (parsed.stateContractId !== undefined) data.stateContractId = parsed.stateContractId;
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode ?? null;

    if (parsed.positions !== undefined) {
      // Read-only data-build here; the destructive deleteMany is deferred into
      // the $transaction below so a version conflict (409) rolls back the
      // delete instead of leaving the positions destroyed (data corruption).
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

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the header update touches zero rows →
      // P2025 → the deleteMany rolls back, so the positions are NOT lost.
      // Only update#1 carries the version filter + increment; update#2 (totals)
      // stays keyed on { id, accountId } because update#1 has already bumped
      // the row to N+1 (a version filter on update#2 would always false-409).
      const saved = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.demandPosition.deleteMany({ where: { demandId: id, accountId } });
        }
        const updated = await tx.demand.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
          include: { positions: true },
        });
        const totals = this.computeTotals(
          updated.positions,
          parsed.vatEnabled ?? existing.vatEnabled,
          parsed.vatIncluded ?? existing.vatIncluded,
        );
        return tx.demand.update({
          where: { id, accountId },
          data: totals,
        });
      });
      const diff = this.diff(existing, saved);
      if (Object.keys(diff).length) {
        await this.logAudit(accountId, userId, 'update', id, diff);
      }
      this.webhookFire.fireForEvent(accountId, 'demand', 'UPDATE', id, Object.keys(diff));
      return saved;
    } catch (e) {
      mapVersionedUpdateError(e, 'Demand');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = DemandTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: DemandTransitionTarget = r.data;

    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'demand', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: the state check + soft-delete are ONE atomic conditional
    // write, so a concurrent post() that flips applicable=true / state=posted
    // between a naive check and the write can't slip a delete through —
    // count 0 → rejected (was: read-check-then-write, a race window).
    const res = await this.prisma.client.demand.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi otgruzkani o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'demand', 'DELETE', id);
    return { ok: true };
  }

  /** moysklad "Изменить" mass-edit apply — direct Prisma write so owner
   *  reassignment works on posted rows too (matches moysklad behaviour).
   *  Controller has already narrowed the patch to the whitelist. */
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
    const updated = await this.prisma.client.demand.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'demand', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.demand.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    this.webhookFire.fireForEvent(accountId, 'demand', 'UPDATE', id, ['printed']);
    return updated;
  }

  /** Mirrors moysklad's "Скопировать" — fresh draft + duplicated positions. */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.demand.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Otgruzka topilmadi');
    }
    const name = await this.nextDemandName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.demand.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        agentId: source.agentId,
        organizationId: source.organizationId,
        storeId: source.storeId,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» preserves ALL header refs — established
        // project decision (§8.3, mirrored from supply.clone). Pure header
        // metadata, definitively safe to carry onto the new draft.
        agentAccountId: source.agentAccountId,
        organizationAccountId: source.organizationAccountId,
        salesChannelId: source.salesChannelId,
        contractId: source.contractId,
        projectId: source.projectId,
        shipmentAddress: source.shipmentAddress,
        shipmentAddressFull: source.shipmentAddressFull ?? undefined,
        // moysklad «Другие поля» shipping/logistics block.
        consignorId: source.consignorId,
        consigneeId: source.consigneeId,
        carrierId: source.carrierId,
        cargoName: source.cargoName,
        shipperInstructions: source.shipperInstructions,
        transportFacility: source.transportFacility,
        carNumber: source.carNumber,
        placesCount: source.placesCount,
        shippingDocNo: source.shippingDocNo,
        shippingDocDate: source.shippingDocDate,
        stateContractId: source.stateContractId,
        externalCode: source.externalCode,
        // customerOrderId deliberately NOT cloned: re-linking the new
        // draft to the same CustomerOrder would double-apply fulfilment
        // on post (CO.shippedQty/state cascade). moysklad's clone-of-
        // Отгрузка CO-link semantics need live verification — held as an
        // honest defer (§25) rather than risk a stock/fulfilment bug.
        // moysklad «Скопировать» keeps the document currency + rate (a
        // cloned USD/EUR doc must not silently reset to UZS) — §8.3.
        currency: source.currency,
        rateValue: source.rateValue,
        // moysklad «Скопировать» preserves «Накладные расходы» too
        // (§39 lossless-clone precedent).
        overheadSumMinor: source.overheadSumMinor,
        overheadDistribution: source.overheadDistribution,
        overheadCurrency: source.overheadCurrency,
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
    this.webhookFire.fireForEvent(accountId, 'demand', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // FIFO cost consumption (Sprint 17.2)
  // =====================================================================

  /**
   * Consume `qty` units of a product from supply lots in FIFO order
   * (oldest posted Supply first, then position order within supply).
   *
   * Walks `supply_positions` rows where `remaining_qty > 0` for the given
   * (account, assortment), locks them with `FOR UPDATE` so concurrent
   * Demand posts can't double-spend, decrements each `remainingQty`, and
   * writes a `DemandPositionCostConsumption` ledger row per lot drawn.
   *
   * Returns the total cost (tiyin) and the uncovered quantity if FIFO
   * depth is insufficient. Uncovered portion has cost 0 — the caller
   * decides whether to allow it (moysklad allows when allowNegativeStock
   * is true; otherwise the upstream sufficiency check rejects first).
   *
   * Services and bundles aren't FIFO-tracked; they always return cost=0,
   * uncovered=qty.
   */
  private async consumeFifo(
    tx: Prisma.TransactionClient,
    accountId: string,
    demandPosition: { id: string; assortmentKind: string; assortmentId: string; quantity: string },
  ): Promise<{ totalCostMinor: bigint; uncoveredQty: string }> {
    const demandQty = demandPosition.quantity;
    if (demandPosition.assortmentKind !== 'product') {
      return { totalCostMinor: 0n, uncoveredQty: demandQty };
    }

    // SELECT FOR UPDATE locks each matching supply_position row for the
    // duration of this transaction. Combined with Serializable isolation,
    // this prevents two parallel Demand posts from consuming the same lot.
    const supplies = await tx.$queryRaw<
      Array<{ id: string; remaining_qty: string; cost_minor: bigint | null }>
    >`
      SELECT sp.id, sp.remaining_qty::text AS remaining_qty, sp.cost_minor
      FROM supply_positions sp
      JOIN supplies s ON s.id = sp.supply_id
      WHERE sp.account_id = ${accountId}::uuid
        AND sp.assortment_kind = ${demandPosition.assortmentKind}
        AND sp.assortment_id = ${demandPosition.assortmentId}::uuid
        AND sp.remaining_qty > 0
        AND s.state = 'posted'
      ORDER BY s.moment ASC, sp.position ASC
      FOR UPDATE OF sp
    `;

    let remaining = demandQty;
    let totalCost = 0n;
    let lastLotId: string | null = null;

    for (const sp of supplies) {
      if (remaining === '0') break;
      const consumeQty = minDecimal(remaining, sp.remaining_qty);
      if (consumeQty === '0') continue;
      const unitCost = sp.cost_minor ?? 0n;
      const lineCost = computeLineCost(consumeQty, unitCost);

      await tx.demandPositionCostConsumption.create({
        data: {
          accountId,
          demandPositionId: demandPosition.id,
          supplyPositionId: sp.id,
          quantity: consumeQty,
          unitCostMinor: unitCost,
          lineCostMinor: lineCost,
        },
      });

      await tx.supplyPosition.update({
        where: { id: sp.id },
        data: { remainingQty: { decrement: new Prisma.Decimal(consumeQty) } },
      });

      totalCost += lineCost;
      lastLotId = sp.id;
      remaining = subtractDecimals(remaining, consumeQty);
    }

    // ── Negative-stock (uncovered) cost basis ────────────────────────────────
    // When FIFO depth is insufficient (only reachable with allowNegativeStock —
    // the upstream sufficiency check rejects otherwise) the uncovered units used
    // to cost 0, understating COGS and inflating «Прибыль» (sumMinor −
    // costSumMinor) on every oversell. moysklad's средневзвешенная model costs
    // negative-stock write-offs at the moving-average unit cost, never 0. We
    // cost the uncovered portion at the WEIGHTED AVERAGE of the lots this line
    // actually drew; if it drew nothing (0 on hand), the most-recent posted
    // supply lot's unit cost for this assortment (the last known purchase cost).
    //
    // The cost is recorded as a 0-QTY consumption row so reverseFifo() reverses
    // it symmetrically on unpost/cancel (it sums lineCostMinor and increments
    // remainingQty by 0 — a no-op) — keeping the post↔unpost stock-value cycle
    // exactly zero-sum without a schema change. The FK needs a real lot, hence
    // the lastLotId / most-recent-lot anchor.
    if (compareDecimals(remaining, '0') > 0) {
      const coveredQty = subtractDecimals(demandQty, remaining);
      let basisUnit = 0n;
      let basisLotId: string | null = null;
      if (compareDecimals(coveredQty, '0') > 0 && totalCost > 0n) {
        basisUnit = computePerUnitCost(totalCost, coveredQty);
        basisLotId = lastLotId;
      } else {
        const recent = await tx.$queryRaw<Array<{ id: string; cost_minor: bigint | null }>>`
          SELECT sp.id, sp.cost_minor
          FROM supply_positions sp
          JOIN supplies s ON s.id = sp.supply_id
          WHERE sp.account_id = ${accountId}::uuid
            AND sp.assortment_kind = ${demandPosition.assortmentKind}
            AND sp.assortment_id = ${demandPosition.assortmentId}::uuid
            AND s.state = 'posted'
          ORDER BY s.moment DESC, sp.position DESC
          LIMIT 1
        `;
        const lot = recent[0];
        if (lot) {
          basisUnit = lot.cost_minor ?? 0n;
          basisLotId = lot.id;
        }
      }
      if (basisLotId && basisUnit > 0n) {
        const uncoveredCost = computeLineCost(remaining, basisUnit);
        await tx.demandPositionCostConsumption.create({
          data: {
            accountId,
            demandPositionId: demandPosition.id,
            supplyPositionId: basisLotId,
            quantity: '0',
            unitCostMinor: basisUnit,
            lineCostMinor: uncoveredCost,
          },
        });
        totalCost += uncoveredCost;
      }
    }

    return { totalCostMinor: totalCost, uncoveredQty: remaining };
  }

  /**
   * Reverse the FIFO consumption recorded on Demand.post — restore
   * `SupplyPosition.remainingQty` and delete the ledger rows. Idempotent
   * via per-row delete (transaction wraps it).
   *
   * Returns the total cost that was reversed (used by stock-cost ledger
   * reversal in unpost).
   */
  private async reverseFifo(
    tx: Prisma.TransactionClient,
    accountId: string,
    demandPositionId: string,
  ): Promise<bigint> {
    const consumptions = await tx.demandPositionCostConsumption.findMany({
      where: { accountId, demandPositionId },
    });
    let totalCost = 0n;
    for (const c of consumptions) {
      await tx.supplyPosition.update({
        where: { id: c.supplyPositionId },
        data: { remainingQty: { increment: new Prisma.Decimal(c.quantity.toString()) } },
      });
      totalCost += c.lineCostMinor;
    }
    if (consumptions.length > 0) {
      await tx.demandPositionCostConsumption.deleteMany({
        where: { accountId, demandPositionId },
      });
    }
    return totalCost;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<DemandService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan o'tkaziladi`,
      );
    }
    if (existing.positions.length === 0) {
      throw new BadRequestException("Pozitsiyalar yo'q — provedeno qilib bo'lmaydi");
    }

    const store = await this.prisma.client.store.findFirst({
      where: { id: existing.storeId, accountId },
      select: { id: true, name: true, allowNegativeStock: true },
    });
    if (!store) throw new NotFoundException('Ombor topilmadi');

    const posted = await this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted. The updateMany takes a
        // write lock on the demand row, so a second concurrent post blocks here
        // then sees state='posted' (count 0) and gets a clean 409 — never a
        // second FIFO consumption + stock deduction. Inside the tx, so any later
        // failure (e.g. insufficient stock) rolls the claim back too.
        const claim = await tx.demand.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException("Otgruzka allaqachon o'tkazilgan yoki 'draft' holatida emas");
        }

        const assortments = existing.positions.map((p) => ({
          kind: p.assortmentKind,
          id: p.assortmentId,
        }));

        // 1. Lock Stock rows (sorted internally).
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          existing.storeId,
          assortments,
        );

        // 2. Sufficiency check (unless store allows negative).
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

        // 3. FIFO cost consumption (Sprint 17.2). Walks supply_positions in
        //    FIFO order, locks them, decrements remainingQty, writes the
        //    consumption ledger, and accumulates COGS for this demand.
        let docCostMinor = 0n;
        const positionCosts = new Map<string, bigint>();
        for (const p of existing.positions) {
          const fifo = await this.consumeFifo(tx, accountId, {
            id: p.id,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            quantity: String(p.quantity),
          });
          positionCosts.set(p.id, fifo.totalCostMinor);
          docCostMinor += fifo.totalCostMinor;
          if (p.assortmentKind === 'product' && fifo.uncoveredQty !== '0') {
            this.logger.warn(
              `Demand ${id} position ${p.id}: ${fifo.uncoveredQty} units uncovered by supply — costed at weighted-average (negative stock). allowNegativeStock=${store.allowNegativeStock}`,
            );
          }
        }

        // 4. Build StockDeltas (negative qty + negative cost for outflow).
        //    Cost decrement equals the FIFO total — Stock.costBalanceMinor
        //    decreases by exactly what we consumed.
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: `-${String(p.quantity)}`,
          costDeltaMinor: -(positionCosts.get(p.id) ?? 0n),
          docType: 'demand',
          docId: id,
          docPositionId: p.id,
          reason: 'post',
        }));

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // 5. Persist per-position avg cost (display) + doc-level COGS total.
        for (const p of existing.positions) {
          const lineCost = positionCosts.get(p.id) ?? 0n;
          const perUnit = computePerUnitCost(lineCost, String(p.quantity));
          await tx.demandPosition.update({
            where: { id: p.id },
            data: { costMinor: perUnit },
          });
        }

        // 6. Update demand state + costSumMinor.
        const updated = await tx.demand.update({
          where: { id, accountId },
          data: {
            state: 'posted',
            applicable: true,
            postedAt: new Date(),
            // OUTBOUND «Накладные расходы»: fold the sale-side overhead
            // into the себестоимость aggregate so «Прибыль» (= sumMinor −
            // costSumMinor) reflects it. docCostMinor is the fresh FIFO
            // COGS; overheadSumMinor is the stable header value → this is
            // idempotent across post→unpost(→0n)→post (the §34 pattern).
            // FIFO lots, Stock.costBalanceMinor and per-position costMinor
            // are deliberately UNTOUCHED ("FIFO-basis EMAS") — outbound
            // overhead is a sale expense, not inventory value, so the
            // post/unpost stock zero-sum is preserved unchanged.
            costSumMinor: demandOverheadCostSumMinor(docCostMinor, existing.overheadSumMinor),
          },
        });

        // 5. CustomerOrder integration (if linked).
        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.customerOrderPositionId)
            .map((p) => ({
              positionId: p.customerOrderPositionId as string,
              qtyDelta: String(p.quantity),
            }));
          if (coDeltas.length > 0) {
            await this.co.applyShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              coDeltas,
              'ship',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Demand',
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

    // After commit: announce the posting so the HR Telegram bridge listener
    // (apps/api/src/modules/hr/hr-telegram-bridge/hr-notification.listener.ts)
    // can render + enqueue an outbound Telegram message for the counterparty.
    // Listener failures are isolated by design — they MUST NOT block this call.
    const payload: DemandPostedEvent = {
      accountId,
      demandId: posted.id,
      counterpartyId: posted.agentId,
      totalMinor: posted.sumMinor,
      postedAt: posted.postedAt ?? new Date(),
    };
    this.events.emit(HR_EVENT.DEMAND_POSTED, payload);
    return posted;
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<DemandService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → draft. Faqat 'posted' holatidagidan`,
      );
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A second concurrent
        // unpost/cancel blocks on the row lock, then sees count 0 and gets a
        // clean 409 — never a second FIFO refund + stock re-add.
        const claim = await tx.demand.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Otgruzka 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        // 1. Reverse FIFO consumption — restore SupplyPosition.remainingQty
        //    and capture the cost we put back into stock.
        const positionRefunds = new Map<string, bigint>();
        for (const p of existing.positions) {
          const refundedCost = await this.reverseFifo(tx, accountId, p.id);
          positionRefunds.set(p.id, refundedCost);
        }

        // 2. Build StockDeltas (positive qty + positive cost — goods come back).
        //    No stock row lock needed for additive reversal.
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: String(p.quantity),
          costDeltaMinor: positionRefunds.get(p.id) ?? 0n,
          docType: 'demand_unpost',
          docId: id,
          docPositionId: p.id,
          reason: 'unpost',
        }));

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // 3. Reset per-position costMinor (back to null — no FIFO consumed).
        for (const p of existing.positions) {
          await tx.demandPosition.update({
            where: { id: p.id },
            data: { costMinor: null },
          });
        }

        const updated = await tx.demand.update({
          where: { id, accountId },
          data: {
            state: 'draft',
            applicable: false,
            postedAt: null,
            costSumMinor: 0n,
          },
        });

        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.customerOrderPositionId)
            .map((p) => ({
              positionId: p.customerOrderPositionId as string,
              qtyDelta: String(p.quantity),
            }));
          if (coDeltas.length > 0) {
            await this.co.applyShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              coDeltas,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Demand',
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
    existing: Awaited<ReturnType<DemandService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(
        `O'tkazilmaydi: ${existing.state} → cancelled. Faqat 'posted' holatidan`,
      );
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→cancelled (see unpost).
        const claim = await tx.demand.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'cancelled' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Otgruzka 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        // Reverse FIFO consumption (same as unpost path).
        const positionRefunds = new Map<string, bigint>();
        for (const p of existing.positions) {
          const refundedCost = await this.reverseFifo(tx, accountId, p.id);
          positionRefunds.set(p.id, refundedCost);
        }

        // Reverse stock (qty +, cost +). docType='demand_cancel'.
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: String(p.quantity),
          costDeltaMinor: positionRefunds.get(p.id) ?? 0n,
          docType: 'demand_cancel',
          docId: id,
          docPositionId: p.id,
          reason: 'cancel',
        }));

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // Reset per-position costMinor.
        for (const p of existing.positions) {
          await tx.demandPosition.update({
            where: { id: p.id },
            data: { costMinor: null },
          });
        }

        const updated = await tx.demand.update({
          where: { id, accountId },
          data: {
            state: 'cancelled',
            applicable: false,
            costSumMinor: 0n,
          },
        });

        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.customerOrderPositionId)
            .map((p) => ({
              positionId: p.customerOrderPositionId as string,
              qtyDelta: String(p.quantity),
            }));
          if (coDeltas.length > 0) {
            await this.co.applyShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              coDeltas,
              'revert',
            );
          }
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Demand',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: 'posted', after: 'cancelled' },
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
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror customer-order.service so
   * the demand filter panel reaches moysklad «Отгрузки» parity (~18 fields)
   * without the two-place drift risk the CO refactor addressed.
   *
   * «Оплата» is a derived clause comparing payedSumMinor vs sumMinor via
   * Prisma 5 field references (`fields.sumMinor`) — exactly how
   * customer-order.service handles paymentStatus. Demand carries the
   * `payedSumMinor` column (populated by the PaymentIn cascade), so the
   * cross-column compare is sound.
   */
  private buildListWhere(accountId: string, filter: DemandFilterInput): Prisma.DemandWhereInput {
    const fields = this.prisma.client.demand.fields;

    // «Оплата» — payedSumMinor vs sumMinor cross-column compare.
    const paymentClause: Prisma.DemandWhereInput | null = (() => {
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

    // Asia/Tashkent calendar-day half-open bounds (was UTC-midnight gte +
    // UTC end-of-day lte, which dropped the first 5h of the `from` day and
    // leaked 5h of the day after `to`). Same class as the report date-tz fix.
    const momentBounds = tashkentRangeBounds(filter.momentFrom, filter.momentTo);
    const momentRange = momentBounds.gte || momentBounds.lt ? { moment: momentBounds } : {};
    const updatedBounds = tashkentRangeBounds(filter.updatedFrom, filter.updatedTo);
    const updatedRange = updatedBounds.gte || updatedBounds.lt ? { updatedAt: updatedBounds } : {};
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
      ...(filter.customerOrderId ? { customerOrderId: filter.customerOrderId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.contractId ? { contractId: filter.contractId } : {}),
      ...(filter.salesChannelId ? { salesChannelId: filter.salesChannelId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(paymentClause ?? {}),
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
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private parseCreate(raw: unknown): CreateDemandInput {
    const r = CreateDemandSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateDemandInput {
    const r = UpdateDemandSchema.safeParse(raw);
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

  private async ensureCustomerOrder(accountId: string, customerOrderId: string): Promise<void> {
    const order = await this.prisma.client.customerOrder.findFirst({
      where: { id: customerOrderId, accountId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new BadRequestException('CustomerOrder topilmadi');
  }

  private async nextDemandName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'demand', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
      const rows = await this.prisma.client.demand.findMany({
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
      // Single source of truth for per-line totals (single-round in micro-tiyin),
      // so the stored sumMinor matches the server PDF and the React print preview.
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
        entity: 'Demand',
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
        `Bu qiymat bilan otgruzka allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
