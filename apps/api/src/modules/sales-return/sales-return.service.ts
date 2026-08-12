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
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
import { CustomerOrderService } from '../customer-order/customer-order.service.js';
import { HR_EVENT, type SalesReturnPostedEvent } from '../hr/hr-shared/hr-events.types.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { runBulk } from '../shared/bulk.js';
import {
  addDecimals,
  compareDecimals,
  computePerUnitCost,
  subtractDecimals,
} from '../shared/decimal.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant, assertStateInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  assertAgentAccountMatchesAgent,
  assertOrgAccountMatchesOrg,
} from '../shared/org-account.js';
import { searchTokenGroups } from '../shared/search-tokens.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
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
 *   4. Counterparty balance: −sumMinor (P14/`H1` — see below).
 *   5. Audit event 'salesreturn.posted'.
 *
 * P14 (`H1`, 2026-08-12) — KONTRAGENT BALANSI. Ilgari bu servis FAQAT qoldiqqa
 * yozardi: mijoz tovarni qaytarsa ombor to'lardi, lekin uning qarzi (`InvoiceOut.post`
 * yozgan `+sumMinor`) abadiy osilib qolardi va kassada o'sha yolg'on summa
 * to'lanadigan qarz bo'lib ko'rinardi (P1/P2 `debtPayable = max(reyestr, balans)`).
 * Endi post `−sumMinor`, unpost/cancel esa aynan teskarisini yozadi —
 * `purchase-return` (`PP-02`) ning mijoz tomonidagi ko'zgusi.
 *
 * 🔴 O'LCHANGAN ASIMMETRIYA (P14 auditi, ataylab shu fazada TUZATILMADI):
 * savdo tomonida qarzni GOODS hujjati emas, MOLIYAVIY hujjat tug'diradi —
 * `Demand` (Отгрузка) balansga UMUMAN yozmaydi, `InvoiceOut` yozadi. Xarid
 * tomonida esa aksincha (`Supply` yozadi, `InvoiceIn` yozmaydi — QAROR-B).
 * Ya'ni hisob-fakturasiz sotilgan (faqat Отгрузка) tovar qaytarilsa, bu yerdagi
 * `−sumMinor` balansni MANFIY tomonga suradi («biz qarzdormiz») — vaholanki
 * dastlab hech qanday qarz yozilmagan edi. `SalesReturn` da `invoiceOutId` FK
 * YO'Q (faqat `demandId`/`customerOrderId`), shuning uchun deltani manbaga
 * bog'lab gate qilishning ishonchli yo'li yo'q. Shartli («invoice bo'lsa yoz»)
 * variant ataylab RAD ETILDI — u jimgina yarim-qo'llanish bo'lardi. To'g'ri
 * yechim — savdo tomoni uchun ham QAROR-B ga o'xshash egasi qarori
 * (Demand↔InvoiceOut'dan qaysi biri qarz kanali). P14 hisobotida ochiq xavf.
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
    @Inject(CounterpartyBalanceService)
    private readonly balance: CounterpartyBalanceService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SalesReturnFilterSchema.parse(rawFilter);
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);

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
        // «Статус» — account-defined custom status pill (moysklad #salesreturn).
        status: { select: { id: true, name: true, color: true } },
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
    const extraIdFilter = await this.resolveModifiedByIdFilter(accountId, filter);
    const where = this.buildListWhere(accountId, filter, extraIdFilter);
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

    // Base-currency (UZS) total — only for mixed-currency sets (the dashed
    // case). Prisma's aggregate can't multiply columns, so fetch (sum, rate)
    // tuples and reduce in BigInt (no float drift). rateValue = doc→base ×1e8.
    // Mirror purchase-return / invoice-in aggregateTotals.
    const RATE_SCALE = 100000000n;
    let baseSumMinor = '0';
    if (currencyGroups.length > 1) {
      const rows = await this.prisma.client.salesReturn.findMany({
        where,
        select: { sumMinor: true, rateValue: true },
      });
      let bs = 0n;
      for (const r of rows) bs += (r.sumMinor * r.rateValue) / RATE_SCALE;
      baseSumMinor = bs.toString();
    }

    return {
      count: agg._count,
      sumMinor: toStr(agg._sum.sumMinor),
      vatSumMinor: toStr(agg._sum.vatSumMinor),
      payedSumMinor: toStr(agg._sum.payedSumMinor),
      currencies: currencyGroups.map((g) => g.currency),
      baseSumMinor,
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
  /**
   * «Кто изменил» (modifiedById) — SalesReturn has no modifiedById column, so
   * approximate "modified by employee X" via the auditLog: the DISTINCT entityIds
   * this account's returns were `update`d on by the requested user. Returns
   * `undefined` when none requested (no narrowing), or `[]` when requested but no
   * audit rows match (forces an EMPTY result, not match-all). Mirror purchase-return.
   * Remove once a real modifiedById column lands.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: SalesReturnFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedById) return undefined;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'SalesReturn',
        userId: filter.modifiedById,
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  private buildListWhere(
    accountId: string,
    filter: SalesReturnFilterInput,
    extraIdFilter?: string[],
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
    // «Оплата» — cross-column refund state (payed vs sum). sumMinor>0 so a
    // zero-amount return doesn't trivially match `paid`. Mirror purchase-return.
    const paymentClause: Prisma.SalesReturnWhereInput | null = (() => {
      if (!filter.paymentState) return null;
      const f = this.prisma.client.salesReturn.fields;
      switch (filter.paymentState) {
        case 'paid':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gte: f.sumMinor } };
        case 'partlyPaid':
          return { sumMinor: { gt: 0n }, payedSumMinor: { gt: 0n, lt: f.sumMinor } };
        case 'unpaid':
          return { payedSumMinor: 0n };
      }
    })();
    // «Оплата» and «Сумма» range BOTH constrain `sumMinor`; the search groups ALSO
    // key on `AND`. Merge everything into ONE `AND` array so no object key collides
    // (side-by-side spread would silently drop a predicate — last-wins).
    const combinedAnd: Prisma.SalesReturnWhereInput[] = [
      ...[paymentClause, sumRange].filter(
        (c): c is Prisma.SalesReturnWhereInput => !!c && Object.keys(c).length > 0,
      ),
      ...(filter.search
        ? searchTokenGroups(filter.search, (tok): Prisma.SalesReturnWhereInput[] => [
            { name: { contains: tok, mode: 'insensitive' as const } },
            { reason: { contains: tok, mode: 'insensitive' as const } },
            { description: { contains: tok, mode: 'insensitive' as const } },
            { agent: { name: { contains: tok, mode: 'insensitive' as const } } },
          ])
        : []),
    ];

    // «Группа контрагента» + «Владелец контрагента» BOTH narrow the SAME `agent`
    // relation — merge into ONE clause so the object keys don't collide (a second
    // `agent:` spread would silently drop the first). Mirror invoice-in / PR.
    const agentSub = {
      ...(filter.agentGroupId ? { groupId: filter.agentGroupId } : {}),
      ...(filter.agentOwnerId ? { ownerId: filter.agentOwnerId } : {}),
    };
    const agentRelation = Object.keys(agentSub).length ? { agent: agentSub } : {};

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      // «Кто изменил» — auditLog-resolved id set (undefined ⇒ no narrowing,
      // [] ⇒ force empty result). Mirror purchase-return.
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.statusIds ? { statusId: { in: filter.statusIds } } : {}),
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
      // «Товар или группа» — returns having ≥1 position with this assortment.
      ...(filter.productId ? { positions: { some: { assortmentId: filter.productId } } } : {}),
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
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...momentRange,
      ...updatedRange,
      // «Оплата» + «Сумма» range + search «содержит» all fold into one AND (see
      // combinedAnd above) so the sumMinor predicates and search groups coexist.
      ...(combinedAnd.length ? { AND: combinedAnd } : {}),
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
        // «Статус» — account custom status pill on the detail header.
        status: { select: { id: true, name: true, color: true } },
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
    // #18 «Остаток» — attach per-position live PHYSICAL on-hand at the return's store.
    // moysklad's position «Остаток» = on-hand (NOT the in-transit «Доступно», which is
    // a separate concept — see stock.service §2c). reserved from the same balance;
    // available = on-hand − reserved (physical). Read-only display only.
    const stockBalances = await this.stock.getBalances(
      accountId,
      sr.storeId,
      sr.positions.map((p) => ({ kind: p.assortmentKind, id: p.assortmentId })),
    );
    // #25 «Прибыль» — total COGS = Σ(per-unit costMinor × qty), decimal-precise via
    // scaleMinorByQty. Frozen post-time (0 on a draft); the FE gates the profit row on
    // cost>0 so a draft never shows full revenue as profit. Mirror demand.costSumMinor.
    const costSumMinor = sr.positions
      .reduce((acc, p) => acc + scaleMinorByQty(p.costMinor ?? 0n, p.quantity.toString()), 0n)
      .toString();
    return {
      ...sr,
      costSumMinor,
      positions: sr.positions.map((p) => {
        const b = stockBalances.get(p.assortmentId);
        const onHand = b?.qty ?? '0';
        const reserved = b?.reservedQty ?? '0';
        return {
          ...p,
          stock: {
            onHand,
            reserved,
            inTransit: '0',
            // STK-12, third copy (Faza Q17). Faza 34 replaced the float form in
            // customer-order and internal-order; this one survived and shipped
            // artifacts like "2.8000000000000003" to the client.
            available: subtractDecimals(onHand, reserved),
          },
        };
      }),
    };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    // Empty positions are allowed ONLY for a DRAFT (moysklad «⊕ Задача»/«⊕ Файл» on a
    // new return persists an empty draft). Posting an empty return is meaningless.
    if (parsed.applicable && parsed.positions.length === 0) {
      throw new BadRequestException('at least one position required');
    }
    await this.ensureRefs(accountId, parsed.agentId, parsed.organizationId, parsed.storeId);
    if (parsed.customerOrderId) await this.ensureCustomerOrder(accountId, parsed.customerOrderId);
    await assertOrgAccountMatchesOrg(
      this.prisma.client,
      accountId,
      parsed.organizationId,
      parsed.organizationAccountId,
    );
    // «Ячейка» — every picked bin must belong to the document's store (mirror supply).
    await this.stock.assertCellsInStore(
      accountId,
      parsed.storeId,
      parsed.positions.map((p) => p.cellId),
    );
    // «Счёт контрагента» must belong to THIS tenant + agent (else a crafted payload
    // routes a refund to a foreign account). Mirror purchase-return / customer-order.
    await assertAgentAccountMatchesAgent(
      this.prisma.client,
      accountId,
      parsed.agentId,
      parsed.agentAccountId ?? null,
    );
    // «Основание» (Отгрузка) integrity: a linked return must match the demand
    // (контрагент / организация / валюта) and every demandPositionId must belong to
    // THAT demand — else a crafted payload could revert an unrelated CustomerOrder line.
    if (parsed.demandId) {
      const demand = await this.prisma.client.demand.findFirst({
        where: { id: parsed.demandId, accountId, deletedAt: null },
        select: {
          agentId: true,
          organizationId: true,
          currency: true,
          positions: { select: { id: true } },
        },
      });
      if (!demand) throw new BadRequestException('Отгрузка topilmadi');
      if (
        demand.agentId !== parsed.agentId ||
        demand.organizationId !== parsed.organizationId ||
        demand.currency !== parsed.currency
      ) {
        throw new BadRequestException(
          'Возврат Отгрузка bilan mos kelmaydi (контрагент / организация / валюта)',
        );
      }
      const demandPosIds = new Set(demand.positions.map((p) => p.id));
      for (const p of parsed.positions) {
        if (p.demandPositionId && !demandPosIds.has(p.demandPositionId)) {
          throw new BadRequestException('Pozitsiya boshqa Отгрузка-ga tegishli');
        }
      }
    } else {
      for (const p of parsed.positions) {
        if (p.demandPositionId) {
          throw new BadRequestException('demandPositionId талаб қилади: demandId');
        }
      }
    }

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'SalesReturn',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Статус» — validate the account custom status belongs to this tenant and the
    // salesreturn entityType BEFORE create (mirror setStatus) — never trust a
    // client-sent id to FK-connect a foreign-tenant / wrong-type state.
    if (parsed.statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: parsed.statusId, accountId, entityType: 'salesreturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${parsed.statusId}`);
    }

    try {
      const created = await this.prisma.client.salesReturn.create({
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
              cellId: p.cellId ?? null,
              cell: p.cell ?? null,
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
      // «Проведено» on save — run the SAME verified posting path the detail
      // «Провести» uses (deduction + sufficiency guard, Serializable tx). The
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

    // Cumulative return cap (moysklad): a shipment line may be returned at most
    // the SHIPPED qty across ALL active returns — NOT the original qty each
    // time. Subtract qty already returned by other active returns (draft+posted
    // both claim the remaining; the authoritative stock-affecting re-check is in
    // post()). Mirror purchase-return.createFromSupply, direction-flipped.
    const demandPosIds = demand.positions.map((dp) => dp.id);
    const returnedAgg = await this.prisma.client.salesReturnPosition.groupBy({
      by: ['demandPositionId'],
      where: {
        demandPositionId: { in: demandPosIds },
        accountId,
        salesReturn: { deletedAt: null, state: { not: 'cancelled' } },
      },
      _sum: { quantity: true },
    });
    const returnedByDp = new Map(
      returnedAgg.map((g) => [g.demandPositionId, String(g._sum.quantity ?? 0)]),
    );

    // `SALES-10` class (Faza Q17). The remaining-to-return used to be computed
    // in float and then STRINGIFIED back into the position payload: after three
    // 0.1 returns of a 0.3 line the residue is 5.5e-17, so `String(remaining)`
    // produced "5.5e-17" — an exponent literal that is not a valid Decimal —
    // and a phantom line was pre-filled for a fully returned position. The
    // `+ 1e-7` slack on the over-return guard existed only to paper over the
    // same drift; with exact decimals both sides are correct without it.
    const positions = demand.positions
      .map((dp) => {
        const alreadyReturned = returnedByDp.get(dp.id) ?? '0';
        const remaining = subtractDecimals(String(dp.quantity), alreadyReturned);
        const want =
          parsed.quantities?.[dp.id] ?? (compareDecimals(remaining, '0') > 0 ? remaining : '0');
        if (compareDecimals(want, '0') <= 0) return null;
        if (compareDecimals(want, remaining) > 0) {
          throw new BadRequestException(
            `Position ${dp.id}: qaytarish mumkin = ${remaining} (jo'natilgan ${String(dp.quantity)} − qaytarilgan ${alreadyReturned}), so'ralmoqda ${want}`,
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
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — the schema accepts them (a
    // .partial of Create) but update() dropped them, so a changed owner / department /
    // shared flag silently vanished (the rateValue bug-class). Mirror purchase-return:
    // both refs tenant-validated before the connect / scalar set.
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
          cellId: p.cellId ?? null,
          cell: p.cell ?? null,
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
    // Serializable konfliktida (40001) AVTOMAT qayta urinish — o'lchangan:
    // 20 qoldiqqa 10 parallel post yuborilganda atigi 2 tasi o'tardi, 8 tasi
    // xom baza xatosi bilan yiqilardi.
    //
    // ⚠️ `findById` HAR URINISHDA qaytadan chaqiriladi (closure ichida). Bu
    // MAJBURIY: yakuniy `update` holat sharti bilan yozmaydi (`where: { id }`),
    // shuning uchun eski `existing` bilan qayta urinilsa, raqib tranzaksiya
    // allaqachon post qilgan hujjat IKKINCHI marta post bo'lib, qoldiqni ikki
    // marta harakatlantirardi. Qayta o'qilgan holat `draft` bo'lmasa, post()
    // biznes-xatosi bilan to'xtaydi va u qayta urinilmaydi.
    const result = await withSerializationRetry(async () => {
      const existing = await this.findById(accountId, id);
      return target === 'post'
        ? this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? this.unpost(accountId, userId, id, existing)
          : this.cancel(accountId, userId, id, existing);
    });
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
        await assertStateInTenant(this.prisma, accountId, patch.stateId, 'salesreturn');
      data.statusId = patch.stateId;
    }
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

  /**
   * «Статус» — assign an account-defined custom status (State row,
   * entityType="salesreturn") to a single return, or clear it (`statusId: null`).
   * Applied IMMEDIATELY (moysklad parity — the pill is a live mutation, not a
   * save-on-edit field). Mirror of purchase-return / supply.setStatus.
   */
  async setStatus(accountId: string, userId: string, id: string, statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'salesreturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    const sr = await this.prisma.client.salesReturn.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { statusId: true },
    });
    if (!sr) throw new NotFoundException(`SalesReturn ${id} not found`);
    await this.prisma.client.salesReturn.update({
      where: { id, accountId },
      data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
    });
    await this.logAudit(accountId, userId, 'set-status', id, {
      status: { before: sr.statusId, after: statusId },
    });
    this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id, ['statusId']);
    return this.findById(accountId, id);
  }

  /**
   * «Статус ▾» toolbar menu — set (or clear) the custom status on N selected
   * returns at once. Validates the target State ONCE before fanning out so an
   * invalid id is a single 400, not a per-row 500 (mirror purchase-return.bulkSetStatus).
   */
  async bulkSetStatus(accountId: string, userId: string, ids: string[], statusId: string | null) {
    if (statusId) {
      const status = await this.prisma.client.state.findFirst({
        where: { id: statusId, accountId, entityType: 'salesreturn', archived: false },
        select: { id: true },
      });
      if (!status) throw new BadRequestException(`Unknown status: ${statusId}`);
    }
    return runBulk(ids, async (id) => {
      const sr = await this.prisma.client.salesReturn.findFirst({
        where: { id, accountId, deletedAt: null },
        select: { statusId: true },
      });
      if (!sr) throw new NotFoundException(`SalesReturn ${id} not found`);
      await this.prisma.client.salesReturn.update({
        where: { id, accountId },
        data: { status: statusId ? { connect: { id: statusId } } : { disconnect: true } },
      });
      await this.logAudit(accountId, userId, 'set-status', id, {
        status: { before: sr.statusId, after: statusId },
      });
      this.webhookFire.fireForEvent(accountId, 'salesreturn', 'UPDATE', id, ['statusId']);
      return id;
    });
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

        // «Основание» (Отгрузка) qty integrity (authoritative, in-tx). Σ(POSTED
        // returns for each linked shipment line, incl. this one) must not exceed
        // the SHIPPED qty. Without this, two full-remaining drafts would both post
        // → 2× stock added + CO shippedQty reverted 2× (can drive it negative).
        // Serializable isolation makes the concurrent two-post race abort one of
        // the pair. Mirror purchase-return.post, direction-flipped.
        const linkedDpIds = [
          ...new Set(
            existing.positions.map((p) => p.demandPositionId).filter((x): x is string => x != null),
          ),
        ];
        if (linkedDpIds.length > 0) {
          const demandPositions = await tx.demandPosition.findMany({
            where: { id: { in: linkedDpIds }, accountId },
            select: { id: true, quantity: true },
          });
          const demandQtyById = new Map(demandPositions.map((dp) => [dp.id, String(dp.quantity)]));
          const otherPosted = await tx.salesReturnPosition.groupBy({
            by: ['demandPositionId'],
            where: {
              demandPositionId: { in: linkedDpIds },
              accountId,
              salesReturn: { applicable: true, deletedAt: null, id: { not: id } },
            },
            _sum: { quantity: true },
          });
          const otherById = new Map(
            otherPosted.map((g) => [g.demandPositionId, String(g._sum.quantity ?? 0)]),
          );
          const thisById = new Map<string, string>();
          for (const p of existing.positions) {
            if (p.demandPositionId) {
              thisById.set(
                p.demandPositionId,
                addDecimals(thisById.get(p.demandPositionId) ?? '0', String(p.quantity)),
              );
            }
          }
          for (const dpId of linkedDpIds) {
            const cap = demandQtyById.get(dpId) ?? '0';
            const total = addDecimals(otherById.get(dpId) ?? '0', thisById.get(dpId) ?? '0');
            if (compareDecimals(total, cap) > 0) {
              throw new ConflictException(
                `Отгрузка позицияси: qaytarilgan jami (${total}) jo'natilgan (${cap}) dan oshib ketdi`,
              );
            }
          }
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
            cellId: p.cellId ?? null,
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

        // Mijoz qarzi — tovar BIZGA qaytdi ⇒ uning qarzi kamayadi → −sumMinor.
        // `InvoiceOut.post` (+sumMinor) ning aynan teskarisi. `source` ATAYLAB
        // berilmaydi: u faqat egaga «yangi qarz paydo bo'ldi» Telegram xabari
        // uchun, qarz KAMAYISHI esa bunday xabar chiqarmaydi (notifier no-op).
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          -existing.sumMinor,
          {
            docType: 'salesReturn',
            docId: id,
            organizationId: existing.organizationId,
          },
        );

        // Cascade to CustomerOrder if we can resolve it via linked Demand
        // positions' customerOrderPositionId back-links.
        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.demandPositionId)
            .map(async (p) => {
              // Find the Demand position → its customerOrderPositionId
              const dp = await tx.demandPosition.findFirst({
                where: { id: p.demandPositionId as string, accountId },
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
            // Returned goods restore a POSTED order's stock hold (reservation
            // invariant); runs BEFORE applyShipment — the hold math derives
            // the post-change shippedQty itself from the stored value ± delta.
            await this.co.adjustReservationForShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              resolved,
              'revert',
            );
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
            cellId: p.cellId ?? null,
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

        // Balans reversali — post() ning −sumMinor'i qaytariladi (qarz tiklandi).
        await this.balance.applyDelta(
          tx,
          accountId,
          existing.agentId,
          existing.currency,
          existing.sumMinor,
          {
            docType: 'salesReturn',
            docId: id,
            organizationId: existing.organizationId,
          },
        );

        // Revert CO cascade: re-apply shipment (direction='ship') — this
        // restores shippedQty on CO positions that we decremented during post.
        if (existing.customerOrderId) {
          const coDeltas = existing.positions
            .filter((p) => p.demandPositionId)
            .map(async (p) => {
              const dp = await tx.demandPosition.findFirst({
                where: { id: p.demandPositionId as string, accountId },
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
            // Un-doing the return re-consumes the order's hold for the
            // re-shipped goods; MUST precede applyShipment (hold math derives
            // shippedAfter from the stored value ± delta).
            await this.co.adjustReservationForShipment(
              tx,
              accountId,
              userId,
              existing.customerOrderId,
              resolved,
              'ship',
            );
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
              cellId: p.cellId ?? null,
              qtyDelta: `-${String(p.quantity)}`,
              costDeltaMinor: -valueMinor,
              docType: 'salesreturn_cancel',
              docId: id,
              docPositionId: p.id,
              reason: 'cancel',
            };
          });
          await this.stock.applyDeltas(tx, accountId, userId, deltas);

          // Balans reversali — faqat applicable bo'lgan (ya'ni post() delta
          // yozgan) qaytarish uchun. Draft hujjatni cancel qilish balansga
          // tegmaydi (yozilmagan deltani qaytarib bo'lmaydi).
          await this.balance.applyDelta(
            tx,
            accountId,
            existing.agentId,
            existing.currency,
            existing.sumMinor,
            {
              docType: 'salesReturn',
              docId: id,
              organizationId: existing.organizationId,
            },
          );

          if (existing.customerOrderId) {
            const coDeltas = existing.positions
              .filter((p) => p.demandPositionId)
              .map(async (p) => {
                const dp = await tx.demandPosition.findFirst({
                  where: { id: p.demandPositionId as string, accountId },
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
              // Un-doing the return re-consumes the order's hold for the
              // re-shipped goods; MUST precede applyShipment (hold math
              // derives shippedAfter from the stored value ± delta).
              await this.co.adjustReservationForShipment(
                tx,
                accountId,
                userId,
                existing.customerOrderId,
                resolved,
                'ship',
              );
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
