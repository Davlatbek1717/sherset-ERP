import type { Prisma } from '@moysklad/db';
import { scaleMinorByQty } from '@moysklad/money';
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
import { type CurrencyRate, toBaseMinor } from '../currency/currency-convert.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
// Pure, dependency-free largest-remainder helper (16 adversarial tests,
// §12). Оприходование is structurally identical to Приёмка so the same
// money math applies — reused, not duplicated.
import { type OverheadLineInput, distributeOverhead } from '../supply/overhead-distribution.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateEnterInput,
  CreateEnterSchema,
  type EnterFilterInput,
  EnterFilterSchema,
  type EnterOverheadDistribution,
  EnterTransitionSchema,
  type EnterTransitionTarget,
  type UpdateEnterInput,
  UpdateEnterSchema,
} from './enter.schema.js';

@Injectable()
export class EnterService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = EnterFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization / store (the
    // list-view exposes these column headers as sortable). Mirror
    // move.service.ts / supply.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'store'
          ? { store: { name: filter.sortDir } }
          : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.enter.findMany({
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
    const total = await this.prisma.client.enter.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad «Итого» — the pinned footer total over the ACTIVE filter set
   * (not just the visible page). Reuses buildListWhere so the aggregate
   * respects exactly the same filters as list(). Mirrors move.aggregateTotals.
   * Enter is carried in the org's base currency (UZS), but the currency-guard
   * (groupBy currency → «—» on a mixed set) is kept so the footer never sums
   * unlike currencies, identical to the moves/PO footers.
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = EnterFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);
    const [result, currencyGroups] = await Promise.all([
      this.prisma.client.enter.aggregate({
        where,
        _sum: { sumMinor: true },
        _count: { _all: true },
      }),
      this.prisma.client.enter.groupBy({ by: ['currency'], where }),
    ]);
    return {
      count: result._count._all,
      sumMinor: (result._sum.sumMinor ?? 0n).toString(),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror move.service.ts so the
   * Enter filter panel reaches moysklad «Оприходования» parity (~10 backed
   * fields) without two-place drift. Preserves the accountId tenant guard
   * + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: Enter is an internal warehouse doc — it has NO agentId,
   * agentAccountId, contractId, organizationAccountId, or salesChannelId
   * (no counterparty). DO NOT add those clauses.
   */
  private buildListWhere(accountId: string, filter: EnterFilterInput): Prisma.EnterWhereInput {
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
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      // «Товар или группа» (multi-select) — match Enters whose positions contain
      // ANY of the selected products.
      ...(filter.productIds
        ? { positions: { some: { productId: { in: filter.productIds } } } }
        : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      // «Кто изменил» — Enter.modifiedById (last editor).
      ...(filter.modifiedById ? { modifiedById: filter.modifiedById } : {}),
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
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
            ],
          }
        : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const e = await this.prisma.client.enter.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        store: true,
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        // «Владелец-отдел» — resolve the department name for the owner popover
        // (mirror PurchaseOrder findById; Enter HAS an EnterGroup relation).
        group: { select: { id: true, name: true } },
        positions: {
          include: {
            // weightG / volumeML drive «Накладные расходы» WEIGHT / VOLUME.
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                uom: true,
                weightG: true,
                volumeML: true,
                // Main image id only (not the bytes) → «Наименование» cell thumbnail
                // via GET /images/:id/raw (moysklad shows the product image inline,
                // mirror CustomerOrder findById). Main first, else lowest position.
                images: {
                  orderBy: [{ isMain: 'desc' }, { position: 'asc' }],
                  take: 1,
                  select: { id: true },
                },
              },
            },
            // «Страна» — resolve country name for the position row (mirror supply §41).
            country: { select: { id: true, name: true, code: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!e) throw new NotFoundException(`Enter ${id} not found`);

    // «Остаток» — moysklad shows each line's CURRENT on-hand at the document's
    // «Склад» (a real number, «0» when none — never a dash). Batch-fetch the Stock
    // on-hand for this store + the line products (indexed PK lookup, one query) and
    // attach it as `stockOnHand` (string; «0» when the product has no stock row).
    const productIds = [
      ...new Set(
        e.positions.filter((p) => p.assortmentKind === 'product').map((p) => p.assortmentId),
      ),
    ];
    const stockRows = productIds.length
      ? await this.prisma.client.stock.findMany({
          where: {
            accountId,
            storeId: e.storeId,
            assortmentKind: 'product',
            assortmentId: { in: productIds },
          },
          select: { assortmentId: true, qty: true },
        })
      : [];
    const onHandByProduct = new Map(stockRows.map((s) => [s.assortmentId, s.qty.toString()]));
    return {
      ...e,
      positions: e.positions.map((p) => ({
        ...p,
        stockOnHand: onHandByProduct.get(p.assortmentId) ?? '0',
      })),
    };
  }

  /**
   * moysklad toolbar «N из ВСЕГО ‹ ›» — the document's 1-based position in the
   * full list + the immediate neighbours, so the detail toolbar shows the REAL
   * total (e.g. «1 из 956») and the arrows walk the whole set even on a direct
   * URL. Mirrors PurchaseOrder.findPosition: the default list order is
   * `[{moment desc},{id desc}]`, so a row is ABOVE the current (smaller position)
   * iff its (moment,id) tuple is strictly GREATER → position = count(above) + 1.
   * Enter has no record-scope (tenant accountId is the only scope).
   */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.enter.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`Enter ${id} not found`);

    const filter = EnterFilterSchema.parse({});
    const where = this.buildListWhere(accountId, filter);
    const aboveCurrent: Prisma.EnterWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.EnterWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.enter.count({ where }),
      this.prisma.client.enter.count({ where: { AND: [where, aboveCurrent] } }),
      this.prisma.client.enter.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      this.prisma.client.enter.findFirst({
        where: { AND: [where, belowCurrent] },
        orderBy: [{ moment: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return { current: above + 1, total, prevId: prev?.id ?? null, nextId: next?.id ?? null };
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.organizationId, parsed.storeId);

    const name = await this.nextName(accountId);
    const attributes = await this.attrs.validateAndNormalize(accountId, 'Enter', parsed.attributes);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // «Владелец»/«Владелец-отдел» from the owner-access popover (else fall back
    // to the creator + their department). Tenant-validate the refs so a
    // hand-crafted request can't point ownerId/groupId at another account
    // (mirrors the PurchaseOrder create + mass-edit guards).
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
      // moysklad «Проведено» on save: when applicable, the document is created
      // AND posted ATOMICALLY (create + stock apply in ONE transaction) so a
      // post failure rolls back the whole thing — no half-created posted doc.
      const result = await this.prisma.client.$transaction(
        async (tx) => {
          const created = await tx.enter.create({
            data: {
              accountId,
              ownerId: parsed.ownerId ?? userId,
              modifiedById: userId,
              groupId: parsed.groupId ?? creatorGroupId,
              shared: parsed.shared ?? false,
              name,
              organizationId: parsed.organizationId,
              storeId: parsed.storeId,
              projectId: parsed.projectId ?? null,
              externalCode: parsed.externalCode ?? null,
              // «Валюта документа» + rate — cost columns are in this currency.
              currency: parsed.currency,
              rateValue: BigInt(parsed.rateValue),
              moment: parsed.moment ? new Date(parsed.moment) : new Date(),
              description: parsed.description,
              overheadSumMinor: BigInt(parsed.overheadSumMinor),
              overheadDistribution: parsed.overheadDistribution,
              overheadCurrency: parsed.overheadCurrency,
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
                  costMinor: BigInt(p.costMinor),
                  // «Причина оприходования» — per-position free text (moysklad parity).
                  reason: p.reason ?? null,
                  // «Номер ГТД» / «Сумма ГТД» / «Страна» — customs block (mirror supply §41).
                  gtdNumber: p.gtdNumber ?? null,
                  gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
                  countryId: p.countryId ?? null,
                  // «РНПТ» / «Ячейка» — free-text batch/bin reference (#enter grid).
                  rnpt: p.rnpt ?? null,
                  cell: p.cell ?? null,
                })),
              },
            },
            include: {
              positions: {
                include: { product: { select: { weightG: true, volumeML: true } } },
                orderBy: { position: 'asc' },
              },
            },
          });
          if (!parsed.applicable) return created;
          // overhead-inclusive line costs (overhead=0 ⇒ original base cost).
          const { byPos, totalCost } = this.lineCostsByPosition(created);
          // «Валюта документа» — the cost columns are in `parsed.currency`. The FIFO
          // stock lot must be valued in the account BASE, so convert each line cost
          // via the document rate (UZS ⇒ rate 1e8 ⇒ toBaseMinor is identity = no-op,
          // zero change for the 99% UZS case). `sumMinor` stays in the document
          // currency (the list footer groups by currency).
          const docRate: CurrencyRate = {
            rateValue: BigInt(parsed.rateValue),
            multiplicity: 1n,
            indirect: false,
          };
          const deltas: StockDelta[] = created.positions.map((p) => ({
            storeId: created.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(p.quantity),
            costDeltaMinor: toBaseMinor(byPos.get(p.id) ?? 0n, docRate),
            docType: 'enter',
            docId: created.id,
            docPositionId: p.id,
            reason: 'post',
          }));
          await this.stock.applyDeltas(tx, accountId, userId, deltas);
          const posted = await tx.enter.update({
            where: { id: created.id, accountId },
            data: {
              state: 'posted',
              applicable: true,
              postedAt: new Date(),
              sumMinor: totalCost,
              modifiedById: userId,
            },
          });
          await tx.auditLog.create({
            data: {
              accountId,
              userId,
              entity: 'Enter',
              entityId: created.id,
              action: 'transition:posted',
              fieldChanges: { from: { before: 'draft', after: 'posted' } } as Prisma.InputJsonValue,
            },
          });
          return posted;
        },
        parsed.applicable ? { isolationLevel: 'Serializable', timeout: 15000 } : undefined,
      );
      await this.logAudit(accountId, userId, 'create', result.id, null);
      this.webhookFire.fireForEvent(accountId, 'enter', 'CREATE', result.id);
      if (parsed.applicable) {
        this.webhookFire.fireForEvent(accountId, 'enter', 'UPDATE', result.id, ['state']);
      }
      return result;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    // moysklad parity: a CANCELLED document is locked; a POSTED one stays EDITABLE
    // — but editing a posted Оприходование moves stock, so it goes through the
    // stock-safe path (reverse the old inbound, re-apply the new, atomically).
    if (existing.state === 'cancelled') {
      throw new BadRequestException("Bekor qilingan hujjatni o'zgartirib bo'lmaydi");
    }
    if (existing.applicable) {
      return this.updatePosted(accountId, userId, id, existing, parsed);
    }
    const data: Prisma.EnterUpdateInput = {};
    // «Кто изменил» — stamp the current user as last editor on every update.
    data.modifiedBy = { connect: { id: userId } };
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.overheadSumMinor !== undefined) {
      data.overheadSumMinor = BigInt(parsed.overheadSumMinor);
    }
    if (parsed.overheadDistribution !== undefined) {
      data.overheadDistribution = parsed.overheadDistribution;
    }
    if (parsed.overheadCurrency !== undefined) {
      data.overheadCurrency = parsed.overheadCurrency;
    }
    // «Валюта документа» + rate — editable while the enter is a draft (the cost
    // columns are entered in this currency). Mirror create()/PurchaseOrder update.
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    // «Владелец» / «Владелец-отдел» / «Общий доступ» — owner-access popover.
    // Tenant-validate the refs (a hand-crafted body can't point at another
    // account); explicitly handled so the fields can't silently vanish on save
    // (the rateValue bug-class). Mirrors PurchaseOrder.update().
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
        data.group = { connect: { id: parsed.groupId } };
      } else {
        data.group = { disconnect: true };
      }
    }
    if (parsed.shared !== undefined) data.shared = parsed.shared;
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Enter',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    if (parsed.positions !== undefined) {
      // The destructive deleteMany is deferred into the $transaction below so a
      // version conflict (409) rolls back the delete instead of leaving the
      // positions destroyed (Class A — data-corruption guard).
      data.positions = {
        create: parsed.positions.map((p, idx) => ({
          accountId,
          position: idx + 1,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          productId: p.assortmentKind === 'product' ? p.assortmentId : null,
          quantity: p.quantity,
          costMinor: BigInt(p.costMinor),
          reason: p.reason ?? null,
          gtdNumber: p.gtdNumber ?? null,
          gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
          countryId: p.countryId ?? null,
          rnpt: p.rnpt ?? null,
          cell: p.cell ?? null,
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the update touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. Single
      // versioned update — Enter has NO two-step totals write (sumMinor is set
      // at post time only), so there is no second update to key off {id}.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.enterPosition.deleteMany({ where: { enterId: id, accountId } });
        }
        return tx.enter.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      // «История изменений» — record WHICH fields changed (moysklad «Поле/Было/Стало»)
      // instead of a bare «update». null when only positions/internal fields changed.
      const changes = this.diff(
        existing as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
      );
      await this.logAudit(
        accountId,
        userId,
        'update',
        id,
        Object.keys(changes).length > 0 ? changes : null,
      );
      this.webhookFire.fireForEvent(accountId, 'enter', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Enter');
      this.handlePrisma(e);
    }
  }

  /**
   * Are the stock-affecting inputs (positions / store / currency / rate / overhead)
   * UNCHANGED vs the posted document? When true a posted-edit is pure-metadata and
   * needs NO stock dance. Positions compare ALL fields — a customs-only change still
   * deletes+recreates the rows, so it must re-apply (re-point the stock ledger) too.
   */
  private stockInputsUnchanged(
    existing: Awaited<ReturnType<EnterService['findById']>>,
    parsed: ReturnType<EnterService['parseUpdate']>,
  ): boolean {
    if (parsed.storeId !== undefined && parsed.storeId !== existing.storeId) return false;
    if (parsed.currency !== undefined && parsed.currency !== existing.currency) return false;
    if (parsed.rateValue !== undefined && BigInt(parsed.rateValue) !== existing.rateValue)
      return false;
    if (
      parsed.overheadSumMinor !== undefined &&
      BigInt(parsed.overheadSumMinor) !== existing.overheadSumMinor
    ) {
      return false;
    }
    if (
      parsed.overheadDistribution !== undefined &&
      parsed.overheadDistribution !== existing.overheadDistribution
    ) {
      return false;
    }
    if (parsed.positions !== undefined) {
      const key = (p: {
        assortmentId: string;
        quantity: unknown;
        costMinor: unknown;
        reason?: unknown;
        gtdNumber?: unknown;
        gtdSumMinor?: unknown;
        countryId?: unknown;
        rnpt?: unknown;
        cell?: unknown;
      }) =>
        [
          p.assortmentId,
          String(p.quantity),
          String(p.costMinor),
          p.reason ?? '',
          p.gtdNumber ?? '',
          p.gtdSumMinor ?? '',
          p.countryId ?? '',
          p.rnpt ?? '',
          p.cell ?? '',
        ].join('|');
      const oldKey = existing.positions.map(key).join(';');
      const newKey = parsed.positions.map(key).join(';');
      if (oldKey !== newKey) return false;
    }
    return true;
  }

  /**
   * moysklad-parity edit of a POSTED Оприходование (moysklad never locks a posted
   * doc). Editing one moves stock, so this REVERSES the document's current inbound,
   * applies the field/position changes, then RE-APPLIES the new inbound — all in ONE
   * serializable, version-guarded transaction (the same zero-sum stock math
   * post()/unpost() use). A pure-metadata edit skips the stock dance entirely.
   */
  private async updatePosted(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<EnterService['findById']>>,
    parsed: ReturnType<EnterService['parseUpdate']>,
  ) {
    // tenant-validate refs that can change on a posted doc too (mirror update()).
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
    if (parsed.organizationId || parsed.storeId) {
      await this.ensureRefs(
        accountId,
        parsed.organizationId ?? existing.organizationId,
        parsed.storeId ?? existing.storeId,
      );
    }
    const attributes =
      parsed.attributes !== undefined
        ? await this.attrs.validateAndNormalize(accountId, 'Enter', parsed.attributes)
        : undefined;
    const stockUnchanged = this.stockInputsUnchanged(existing, parsed);

    try {
      const result = await this.prisma.client.$transaction(
        async (tx) => {
          // version + still-posted guard (one atomic claim — a concurrent edit/unpost
          // makes count 0 → clean 409, never a double stock write).
          const claim = await tx.enter.updateMany({
            where: { id, accountId, state: 'posted', version: parsed.version },
            data: { version: { increment: 1 }, modifiedById: userId },
          });
          if (claim.count === 0) {
            throw new ConflictException("Hujjat boshqa joyda o'zgardi — sahifani yangilang");
          }

          // 1. REVERSE the currently-posted inbound (exact mirror of unpost) — only
          //    when a stock input actually changed.
          if (!stockUnchanged) {
            const { byPos: oldByPos } = this.lineCostsByPosition(existing);
            const oldRate: CurrencyRate = {
              rateValue: existing.rateValue,
              multiplicity: 1n,
              indirect: false,
            };
            const reverse: StockDelta[] = existing.positions.map((p) => ({
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              qtyDelta: `-${String(p.quantity)}`,
              costDeltaMinor: -toBaseMinor(oldByPos.get(p.id) ?? 0n, oldRate),
              docType: 'enter_unpost',
              docId: id,
              docPositionId: p.id,
              reason: 'unpost',
            }));
            await this.stock.applyDeltas(tx, accountId, userId, reverse);
          }

          // 2. Header fields + (when stock changed) replace positions.
          const data: Prisma.EnterUpdateInput = {};
          if (parsed.description !== undefined) data.description = parsed.description;
          if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
          if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
          if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
          if (parsed.projectId !== undefined) {
            data.project = parsed.projectId
              ? { connect: { id: parsed.projectId } }
              : { disconnect: true };
          }
          if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
          if (parsed.overheadSumMinor !== undefined) {
            data.overheadSumMinor = BigInt(parsed.overheadSumMinor);
          }
          if (parsed.overheadDistribution !== undefined) {
            data.overheadDistribution = parsed.overheadDistribution;
          }
          if (parsed.overheadCurrency !== undefined)
            data.overheadCurrency = parsed.overheadCurrency;
          if (parsed.currency !== undefined) data.currency = parsed.currency;
          if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
          if (parsed.ownerId !== undefined) {
            data.owner = parsed.ownerId
              ? { connect: { id: parsed.ownerId } }
              : { disconnect: true };
          }
          if (parsed.groupId !== undefined) {
            data.group = parsed.groupId
              ? { connect: { id: parsed.groupId } }
              : { disconnect: true };
          }
          if (parsed.shared !== undefined) data.shared = parsed.shared;
          if (attributes !== undefined) data.attributes = attributes as Prisma.InputJsonValue;
          if (!stockUnchanged && parsed.positions !== undefined) {
            await tx.enterPosition.deleteMany({ where: { enterId: id, accountId } });
            data.positions = {
              create: parsed.positions.map((p, idx) => ({
                accountId,
                position: idx + 1,
                assortmentKind: p.assortmentKind,
                assortmentId: p.assortmentId,
                productId: p.assortmentKind === 'product' ? p.assortmentId : null,
                quantity: p.quantity,
                costMinor: BigInt(p.costMinor),
                reason: p.reason ?? null,
                gtdNumber: p.gtdNumber ?? null,
                gtdSumMinor: p.gtdSumMinor != null ? BigInt(p.gtdSumMinor) : null,
                countryId: p.countryId ?? null,
                rnpt: p.rnpt ?? null,
                cell: p.cell ?? null,
              })),
            };
          }
          await tx.enter.update({ where: { id, accountId }, data });

          // 3. RE-APPLY the new inbound (mirror post) + recompute sumMinor — stock-changed only.
          if (!stockUnchanged) {
            const reloaded = await tx.enter.findFirst({
              where: { id, accountId },
              include: {
                positions: {
                  include: { product: { select: { weightG: true, volumeML: true } } },
                  orderBy: { position: 'asc' },
                },
              },
            });
            if (!reloaded) throw new Error(`Enter ${id} reload failed`);
            const { byPos: newByPos, totalCost } = this.lineCostsByPosition(reloaded);
            const newRate: CurrencyRate = {
              rateValue: reloaded.rateValue,
              multiplicity: 1n,
              indirect: false,
            };
            const apply: StockDelta[] = reloaded.positions.map((p) => ({
              storeId: reloaded.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              qtyDelta: String(p.quantity),
              costDeltaMinor: toBaseMinor(newByPos.get(p.id) ?? 0n, newRate),
              docType: 'enter',
              docId: id,
              docPositionId: p.id,
              reason: 'post',
            }));
            await this.stock.applyDeltas(tx, accountId, userId, apply);
            return tx.enter.update({ where: { id, accountId }, data: { sumMinor: totalCost } });
          }
          return tx.enter.findFirstOrThrow({ where: { id, accountId } });
        },
        { isolationLevel: 'Serializable', timeout: 20000 },
      );

      const changes = this.diff(
        existing as unknown as Record<string, unknown>,
        result as unknown as Record<string, unknown>,
      );
      await this.logAudit(
        accountId,
        userId,
        'update',
        id,
        Object.keys(changes).length > 0 ? changes : null,
      );
      this.webhookFire.fireForEvent(accountId, 'enter', 'UPDATE', id);
      return result;
    } catch (e) {
      mapVersionedUpdateError(e, 'Enter');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = EnterTransitionSchema.safeParse(targetRaw);
    if (!r.success) throw new BadRequestException(`Notog'ri transition: ${String(targetRaw)}`);
    const target: EnterTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);
    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'enter', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: the draft-state check + soft-delete are ONE atomic
    // conditional write, so a concurrent post() flipping draft→posted can't slip
    // a delete through — count 0 → rejected.
    const res = await this.prisma.client.enter.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagini o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'enter', 'DELETE', id);
    return { ok: true };
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.enter.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Postuplenie topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.enter.create({
      data: {
        accountId,
        ownerId: userId,
        modifiedById: userId,
        groupId: creatorGroupId,
        name,
        organizationId: source.organizationId,
        storeId: source.storeId,
        projectId: source.projectId,
        externalCode: source.externalCode,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» preserves all header fields (§8.3).
        overheadSumMinor: source.overheadSumMinor,
        overheadDistribution: source.overheadDistribution,
        overheadCurrency: source.overheadCurrency,
        // §61: moysklad «Скопировать» preserves custom-field values
        // (доп. поля) — clone() dropped them (§39 lossless precedent).
        attributes: (source.attributes ?? {}) as Prisma.InputJsonValue,
        state: 'draft',
        applicable: false,
        positions: {
          create: source.positions.map((p) => ({
            accountId,
            position: p.position,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            productId: p.productId,
            quantity: p.quantity,
            costMinor: p.costMinor,
            // §61 lossless clone — preserve per-position «Причина оприходования»
            // + the «ГТД» / «Страна» customs block (mirror supply §41).
            reason: p.reason,
            gtdNumber: p.gtdNumber,
            gtdSumMinor: p.gtdSumMinor,
            countryId: p.countryId,
            rnpt: p.rnpt,
            cell: p.cell,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'enter', 'CREATE', created.id);
    return created;
  }

  /**
   * moysklad «Массовое редактирование» — apply ownerId / projectId /
   * description to one enter (called per-id by the controller's runBulk).
   * Metadata-only (no stock effect), so it intentionally skips the
   * applicable-guard that update() enforces — owner/comment can change on a
   * posted enter, mirroring move.massEditApply. assertMassEditRefsInTenant
   * blocks a cross-tenant ownerId/projectId before the write.
   */
  async massEditApply(
    accountId: string,
    userId: string,
    id: string,
    patch: { ownerId?: string | null; projectId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = { modifiedById: userId };
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('projectId' in patch) data.projectId = patch.projectId;
    if ('description' in patch) data.description = patch.description;
    const updated = await this.prisma.client.enter.update({ where: { id, accountId }, data });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'enter', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  // =====================================================================

  /**
   * Per-position line cost (tiyin), optionally «Накладные расходы»-
   * inclusive. Deterministic pure function of the Enter's own STABLE
   * inputs (position.costMinor/quantity, product weight/volume,
   * overheadSumMinor, method) — post() / unpost() / cancel() all derive
   * the IDENTICAL map, so a post→unpost (or cancel) cycle is exactly
   * zero-sum WITHOUT persisting anything, and post→unpost→post is
   * idempotent by construction. overhead=0 ⇒ byte-for-byte the original
   * base cost (the helper is not even called) so existing Оприходование
   * behaviour and the test suite are unaffected.
   */
  /**
   * Field-level diff for the «История изменений» modal (moysklad «Поле/Было/Стало»).
   * Compares the before (findById) vs after (post-update row) over the user-facing
   * scalar columns — skipping bookkeeping + relation/position keys. BigInt-safe
   * (overheadSumMinor etc. → string) since JSON.stringify throws on a raw BigInt.
   * Mirrors PurchaseOrder.diff so the shared HistoryTimeline renders enter changes
   * identically (the modal localises field names + filters its own INTERNAL_FIELDS).
   */
  private diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { before: unknown; after: unknown }> {
    const SKIP = new Set([
      'id',
      'accountId',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'version',
      'modifiedById',
      'postedAt',
      'name',
      'rateValue',
      'sumMinor',
      'attributes',
      'positions',
      'organization',
      'store',
      'project',
      'owner',
      'group',
      'country',
      'modifiedBy',
      '_count',
    ]);
    const norm = (v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
    const d: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (SKIP.has(k)) continue;
      const b = norm(before[k]);
      const a = norm(after[k]);
      if (JSON.stringify(b) !== JSON.stringify(a)) d[k] = { before: b, after: a };
    }
    return d;
  }

  private lineCostsByPosition(existing: {
    overheadSumMinor: bigint;
    overheadDistribution: string;
    positions: ReadonlyArray<{
      id: string;
      quantity: unknown;
      costMinor: bigint;
      product?: { weightG: number | null; volumeML: number | null } | null;
    }>;
  }): {
    byPos: Map<string, bigint>;
    totalCost: bigint;
  } {
    const baseLineOf = (p: (typeof existing.positions)[number]): bigint =>
      scaleMinorByQty(p.costMinor, String(p.quantity));
    const byPos = new Map<string, bigint>();
    if (existing.overheadSumMinor > 0n) {
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
        existing.overheadDistribution as EnterOverheadDistribution,
      );
      for (const d of dist) {
        const p = existing.positions[d.index];
        if (!p) {
          throw new Error(
            `Overhead distribution index ${d.index} out of range (positions=${existing.positions.length})`,
          );
        }
        byPos.set(p.id, d.lineCostMinor);
      }
    } else {
      for (const p of existing.positions) byPos.set(p.id, baseLineOf(p));
    }
    let totalCost = 0n;
    for (const v of byPos.values()) totalCost += v;
    return { byPos, totalCost };
  }

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<EnterService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted (current: ${existing.state})`);
    }
    if (existing.positions.length === 0) throw new BadRequestException("Pozitsiyalar yo'q");

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 and
        // gets a clean 409 — never a second inbound write. Inside the tx, so a
        // later failure rolls the claim back.
        const claim = await tx.enter.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Postuplenie allaqachon o'tkazilgan yoki 'draft' holatida emas",
          );
        }

        // overhead-inclusive line costs (overhead=0 ⇒ original base cost).
        const { byPos, totalCost } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: String(p.quantity),
          costDeltaMinor: byPos.get(p.id) ?? 0n,
          docType: 'enter',
          docId: id,
          docPositionId: p.id,
          reason: 'post',
        }));
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.enter.update({
          where: { id, accountId },
          data: {
            state: 'posted',
            applicable: true,
            postedAt: new Date(),
            sumMinor: totalCost,
            modifiedById: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Enter',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
              reason: existing.reason,
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
    existing: Awaited<ReturnType<EnterService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft (current: ${existing.state})`);
    }
    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A second concurrent
        // unpost/cancel blocks on the row lock, then sees count 0 → clean 409 —
        // never a second stock reversal.
        const claim = await tx.enter.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Postuplenie 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        // Identical computation to post() ⇒ exact reversal (zero-sum).
        const { byPos } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: `-${String(p.quantity)}`,
          costDeltaMinor: -(byPos.get(p.id) ?? 0n),
          docType: 'enter_unpost',
          docId: id,
          docPositionId: p.id,
          reason: 'unpost',
        }));
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.enter.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null, modifiedById: userId },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Enter',
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
    existing: Awaited<ReturnType<EnterService['findById']>>,
  ) {
    if (existing.state === 'cancelled') throw new BadRequestException('Oldin cancel qilingan');
    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: claim the EXACT snapshotted state→cancelled. A concurrent
      // unpost (posted→draft) that already ran makes this count 0 → 409, so we
      // never double-reverse stock.
      const claim = await tx.enter.updateMany({
        where: { id, accountId, state: existing.state },
        data: { state: 'cancelled' },
      });
      if (claim.count === 0) {
        throw new ConflictException("Postuplenie holati o'zgargan (allaqachon o'zgartirilgan)");
      }
      const wasApplicable = existing.applicable;
      if (wasApplicable) {
        // Same overhead-aware computation ⇒ exact reversal of what post()
        // wrote (zero-sum), consistent with unpost().
        const { byPos } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = existing.positions.map((p) => ({
          storeId: existing.storeId,
          assortmentKind: p.assortmentKind,
          assortmentId: p.assortmentId,
          qtyDelta: `-${String(p.quantity)}`,
          costDeltaMinor: -(byPos.get(p.id) ?? 0n),
          docType: 'enter_cancel',
          docId: id,
          docPositionId: p.id,
          reason: 'cancel',
        }));
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      }
      const updated = await tx.enter.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false, modifiedById: userId },
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'Enter',
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
  private parseCreate(raw: unknown): CreateEnterInput {
    const r = CreateEnterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdateEnterInput {
    const r = UpdateEnterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    storeId: string,
  ): Promise<void> {
    const [org, store] = await Promise.all([
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: storeId, accountId } }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async nextName(accountId: string): Promise<string> {
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'enter', async () => {
      // moysklad-parity: plain 5-digit zero-padded «Номер» (no prefix). Seed = highest
      // TRAILING number across all names (handles legacy prefixed + new plain) → continues.
      const rows = await this.prisma.client.enter.findMany({
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
        entity: 'Enter',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(`Bu qiymat bilan enter mavjud: ${err.meta?.target?.join(', ')}`);
    }
    throw e as Error;
  }
}
