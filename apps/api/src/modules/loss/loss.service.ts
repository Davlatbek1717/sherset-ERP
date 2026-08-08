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
import { computePerUnitCost } from '../demand/fifo-consumer.js';
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { withSerializationRetry } from '../shared/serialization-retry.js';
import { transitionWithClaim } from '../shared/transition-with-claim.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateLossInput,
  CreateLossSchema,
  type LossFilterInput,
  LossFilterSchema,
  LossTransitionSchema,
  type LossTransitionTarget,
  type UpdateLossInput,
  UpdateLossSchema,
} from './loss.schema.js';

@Injectable()
export class LossService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = LossFilterSchema.parse(rawFilter);
    const [extraIdFilter, expenseItemNames] = await Promise.all([
      this.resolveModifiedByIdFilter(accountId, filter),
      this.resolveExpenseItemNames(accountId, filter),
    ]);
    const where = this.buildListWhere(accountId, filter, extraIdFilter, expenseItemNames);

    // moysklad parity: relational sort for organization / store (the
    // list-view exposes these column headers as sortable). Mirror
    // move.service.ts / supply.service.ts buildListWhere orderBy. The «№»
    // column (sortBy='name') sorts by the document SEQUENCE — our names mix
    // formats («00001» legacy + «СП-2026-00045»), so a raw string sort would
    // misorder them. Map a 'name' sort to (moment, id) like invoice-in /
    // purchase-orders: a stable newest-first sequence under the «№» arrow.
    const orderBy: Prisma.LossOrderByWithRelationInput | Prisma.LossOrderByWithRelationInput[] =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'store'
          ? { store: { name: filter.sortDir } }
          : filter.sortBy === 'name'
            ? [{ moment: filter.sortDir }, { id: filter.sortDir }]
            : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.loss.findMany({
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
    const total = await this.prisma.client.loss.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad-parity pinned «Итого» footer total — sums ALL filtered records
   * (not just the visible page), over the SAME WHERE the list uses so the
   * footer and the grid always agree on scope. Loss is an internal write-off
   * stored in the account base currency (UZS), so the only money cell is
   * Сумма; `currencies` is returned for the shared footer currency-guard
   * (mirror invoice-in / purchase-order — renders «—» on a mixed set).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = LossFilterSchema.parse(rawFilter);
    const [extraIdFilter, expenseItemNames] = await Promise.all([
      this.resolveModifiedByIdFilter(accountId, filter),
      this.resolveExpenseItemNames(accountId, filter),
    ]);
    const where = this.buildListWhere(accountId, filter, extraIdFilter, expenseItemNames);

    const [agg, currencyGroups] = await Promise.all([
      this.prisma.client.loss.aggregate({ where, _count: true, _sum: { sumMinor: true } }),
      this.prisma.client.loss.groupBy({ by: ['currency'], where }),
    ]);

    return {
      count: agg._count,
      sumMinor: (agg._sum.sumMinor ?? 0n).toString(),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror move.service.ts so the
   * Loss filter panel reaches moysklad «Списания» parity (~10 backed
   * fields) without two-place drift. Preserves the accountId tenant guard
   * + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: Loss is an internal warehouse doc — it has NO agentId,
   * agentAccountId, contractId, organizationAccountId, or salesChannelId
   * (no counterparty). DO NOT add those clauses.
   */
  private buildListWhere(
    accountId: string,
    filter: LossFilterInput,
    // «Кто изменил» — Loss has NO modifiedById column, so list()/
    // aggregateTotals() pre-query the auditLog and pass the matched entityIds
    // here. `[]` (requested but zero audit rows) forces an EMPTY result.
    extraIdFilter?: string[],
    // «Статья расходов» — ExpenseItem ids resolved to the Loss.expenseItem
    // names they tag. `[]` (requested but no item matched) forces empty.
    expenseItemNames?: string[],
  ): Prisma.LossWhereInput {
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
      ...(extraIdFilter ? { id: { in: extraIdFilter } } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.storeIds ? { storeId: { in: filter.storeIds } } : {}),
      ...(filter.reason ? { reason: filter.reason } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.projectIds ? { projectId: { in: filter.projectIds } } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.groupIds ? { groupId: { in: filter.groupIds } } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.ownerIds ? { ownerId: { in: filter.ownerIds } } : {}),
      ...(filter.productIds
        ? { positions: { some: { productId: { in: filter.productIds } } } }
        : {}),
      ...(expenseItemNames ? { expenseItem: { in: expenseItemNames } } : {}),
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

  /**
   * «Кто изменил» (modifiedByIds) — Loss has no modifiedById column, so we
   * approximate via the auditLog: the DISTINCT entityIds this account's Loss
   * rows were `update`d on by the requested users. Returns `undefined` when
   * none requested (no narrowing) or `[]` when requested but no audit rows
   * match (forces an EMPTY result, not match-all). Mirror invoice-in.
   */
  private async resolveModifiedByIdFilter(
    accountId: string,
    filter: LossFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.modifiedByIds?.length) return undefined;
    const rows = await this.prisma.client.auditLog.findMany({
      where: {
        accountId,
        entity: 'Loss',
        userId: { in: filter.modifiedByIds },
        action: { contains: 'update' },
      },
      select: { entityId: true },
      distinct: ['entityId'],
    });
    return rows.map((r) => r.entityId);
  }

  /**
   * «Статья расходов» (expenseItemIds) — Loss.expenseItem is a free-form
   * string (the item's NAME), so we resolve the picked ExpenseItem ids to
   * their names and filter `expenseItem IN (names)`. Returns `undefined` when
   * none requested or `[]` when requested but no item matched (forces empty).
   */
  private async resolveExpenseItemNames(
    accountId: string,
    filter: LossFilterInput,
  ): Promise<string[] | undefined> {
    if (!filter.expenseItemIds?.length) return undefined;
    const rows = await this.prisma.client.expenseItem.findMany({
      where: { accountId, id: { in: filter.expenseItemIds } },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  /**
   * moysklad toolbar «N из ВСЕГО ‹ ›» — the loss's 1-based position in the full
   * list + immediate neighbours, so a direct-URL visit still shows the REAL total
   * and the arrows walk the whole set. Mirrors Enter/PurchaseOrder.findPosition:
   * the default list order is (moment desc, id desc), so a row is ABOVE the
   * current iff its (moment,id) tuple is strictly GREATER → position = above + 1.
   * Loss has no record-scope (tenant accountId is the only scope).
   */
  async findPosition(accountId: string, id: string) {
    const current = await this.prisma.client.loss.findFirst({
      where: { id, accountId, deletedAt: null },
      select: { id: true, moment: true },
    });
    if (!current) throw new NotFoundException(`Loss ${id} not found`);

    const filter = LossFilterSchema.parse({});
    const where = this.buildListWhere(accountId, filter);
    const aboveCurrent: Prisma.LossWhereInput = {
      OR: [{ moment: { gt: current.moment } }, { moment: current.moment, id: { gt: current.id } }],
    };
    const belowCurrent: Prisma.LossWhereInput = {
      OR: [{ moment: { lt: current.moment } }, { moment: current.moment, id: { lt: current.id } }],
    };

    const [total, above, prev, next] = await Promise.all([
      this.prisma.client.loss.count({ where }),
      this.prisma.client.loss.count({ where: { AND: [where, aboveCurrent] } }),
      this.prisma.client.loss.findFirst({
        where: { AND: [where, aboveCurrent] },
        orderBy: [{ moment: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
      this.prisma.client.loss.findFirst({
        where: { AND: [where, belowCurrent] },
        orderBy: [{ moment: 'desc' }, { id: 'desc' }],
        select: { id: true },
      }),
    ]);

    return { current: above + 1, total, prevId: prev?.id ?? null, nextId: next?.id ?? null };
  }

  async findById(accountId: string, id: string) {
    const l = await this.prisma.client.loss.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        store: true,
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        positions: {
          // buyPrice = the product cost shown as «Цена» on a DRAFT line that has no
          // frozen costMinor yet (себестоимость is a product property, not stock-derived).
          include: {
            product: { select: { id: true, name: true, code: true, uom: true, buyPrice: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!l) throw new NotFoundException(`Loss ${id} not found`);
    return l;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(accountId, parsed.organizationId, parsed.storeId);
    await this.stock.assertCellsInStore(
      accountId,
      parsed.storeId,
      parsed.positions.map((p) => p.cellId),
    );

    const name = await this.nextName(accountId);
    const attributes = await this.attrs.validateAndNormalize(accountId, 'Loss', parsed.attributes);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    try {
      const created = await this.prisma.client.loss.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          name,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          projectId: parsed.projectId ?? null,
          // moysklad «Статья расходов» (stored as the item NAME) + «Валюта
          // документа» (+ rate). Base currency ⇒ rateValue 1e8 (a no-op).
          expenseItem: parsed.expenseItem ?? null,
          currency: parsed.currency,
          rateValue: parsed.rateValue ? BigInt(parsed.rateValue) : undefined,
          externalCode: parsed.externalCode ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          reason: parsed.reason,
          description: parsed.description,
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
              // «Причина списания» / «Ячейка» — per-line free text (the cost is
              // NOT entered; it is computed at post — 066d55fb valuation parity).
              reason: p.reason ?? null,
              cellId: p.cellId ?? null,
              cell: p.cell ?? null,
              // «Цена» — the editable себестоимость (default buyPrice); post() books it.
              costMinor: p.costMinor ? BigInt(p.costMinor) : null,
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'loss', 'CREATE', created.id);
      // «Проведено» on save — run the SAME verified posting path the detail
      // «Провести» uses (write-off deduction + valuation, Serializable tx). The
      // draft is already committed; a post failure surfaces its error with the
      // draft saved (moysklad parity — the doc is kept, not lost).
      if (parsed.applicable) {
        return await this.transition(accountId, userId, created.id, 'post');
      }
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    // A posted (applicable) OR cancelled (voided, terminal) write-off must NOT be
    // mutated — editing a voided document pollutes history (the record would no
    // longer reflect what was actually written off). FE locks both; guard here too.
    if (existing.applicable) {
      throw new BadRequestException("Provedeno loss'ni o'zgartirib bo'lmaydi");
    }
    if (existing.state === 'cancelled') {
      throw new BadRequestException("Bekor qilingan loss'ni o'zgartirib bo'lmaydi");
    }
    if (parsed.positions) {
      await this.stock.assertCellsInStore(
        accountId,
        parsed.storeId ?? existing.storeId,
        parsed.positions.map((p) => p.cellId),
      );
    }
    const data: Prisma.LossUpdateInput = {};
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.reason !== undefined) data.reason = parsed.reason;
    // moysklad «Статья расходов» / «Валюта документа» (+ rate) — round-tripped
    // so an edit preserves them (mirror create()/PurchaseOrder.update()).
    if (parsed.expenseItem !== undefined) data.expenseItem = parsed.expenseItem;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.rateValue !== undefined) data.rateValue = BigInt(parsed.rateValue);
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(accountId, 'Loss', parsed.attributes);
      data.attributes = validated as Prisma.InputJsonValue;
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
          quantity: p.quantity,
          // Round-trip «Причина списания» / «Ячейка» — the destructive
          // delete+recreate would otherwise WIPE them on every edit.
          reason: p.reason ?? null,
          cellId: p.cellId ?? null,
          cell: p.cell ?? null,
          costMinor: p.costMinor ? BigInt(p.costMinor) : null,
        })),
      };
    }

    try {
      // Single-store write-off: ONE version-guarded update (no two-step totals).
      // The child-row replacement (deleteMany) + the version-guarded header
      // update run in ONE transaction. If the optimistic-lock version filter
      // misses (concurrent edit), the update touches zero rows → P2025 → the
      // deleteMany rolls back, so the positions are NOT lost.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.lossPosition.deleteMany({ where: { lossId: id, accountId } });
        }
        return tx.loss.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'loss', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Loss');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = LossTransitionSchema.safeParse(targetRaw);
    if (!r.success) throw new BadRequestException(`Notog'ri transition: ${String(targetRaw)}`);
    const target: LossTransitionTarget = r.data;
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
    this.webhookFire.fireForEvent(accountId, 'loss', 'UPDATE', id, ['state']);
    return result;
  }

  /**
   * moysklad «Массовое редактирование» — apply one patch to a single Loss
   * (the controller fans runBulk over the ids). Mirrors
   * invoice-out.service.massEditApply; Списание's wizard adds groupId
   * («Владелец-отдел»), shared («Общий доступ») and expenseItem
   * («Статья расходов», stored as the item NAME per Loss.expenseItem).
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
      expenseItem?: string | null;
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
    if ('expenseItem' in patch) data.expenseItem = patch.expenseItem;
    const updated = await this.prisma.client.loss.update({ where: { id, accountId }, data });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'loss', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async delete(accountId: string, userId: string, id: string) {
    const l = await this.findById(accountId, id);
    if (l.applicable || l.state !== 'draft') {
      throw new BadRequestException("Faqat 'draft' holatidagini o'chirish mumkin");
    }
    await this.prisma.client.loss.update({
      where: { id, accountId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'loss', 'DELETE', id);
    return { ok: true };
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.loss.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Spisanie topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.loss.create({
      data: {
        accountId,
        ownerId: userId,
        groupId: creatorGroupId,
        name,
        organizationId: source.organizationId,
        storeId: source.storeId,
        projectId: source.projectId,
        externalCode: source.externalCode,
        // moysklad «Скопировать» preserves «Статья расходов» + «Валюта документа».
        expenseItem: source.expenseItem,
        currency: source.currency,
        rateValue: source.rateValue,
        moment: new Date(),
        description: source.description,
        // moysklad «Скопировать» keeps the write-off reason (§8.3 header
        // preservation — was dropped, a cloned Loss reset to default).
        reason: source.reason,
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
            // preserve per-line «Причина списания» / «Ячейка» on copy.
            reason: p.reason,
            cellId: p.cellId,
            cell: p.cell,
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'loss', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<LossService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted (current: ${existing.state})`);
    }
    // Owner 2026-07-08: «Проведено» toggles freely — an empty doc may be posted
    // (0 positions ⇒ 0 stock delta; moysklad allows it). No position precondition.

    const store = await this.prisma.client.store.findFirst({
      where: { id: existing.storeId, accountId },
      select: { id: true, allowNegativeStock: true },
    });
    if (!store) throw new NotFoundException('Store topilmadi');

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the FIRST op so a
        // second concurrent post sees count 0 and gets a clean 409 — never a
        // second write-off. Inside the tx, so a later failure rolls it back.
        //
        // 2026-07-29: Loss was the ONLY stock document missing this claim (the
        // other seven — enter/move/inventory/sales-return/purchase-return/
        // supply/demand — all had it). Serializable + lockBalances hid the hole
        // whenever positions existed (both txs touch the same Stock rows ⇒ the
        // loser aborts with 40001), but an EMPTY write-off locks nothing, so two
        // concurrent posts could both succeed. The pre-tx `existing.state`
        // check is a read on a stale snapshot and cannot close this.
        const claim = await tx.loss.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException("Spisanie allaqachon o'tkazilgan yoki 'draft' holatida emas");
        }

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

        // Cost-of-goods for the write-off (moysklad «Себестоимость
        // списания»). The Loss form is qty-only — the user never enters a
        // cost — so LossPosition.costMinor is NULL on a draft. The basis is
        // the store's current WEIGHTED-AVERAGE unit cost, i.e.
        // Stock.costBalanceMinor ÷ qty-on-hand — the same average the inbound
        // enter/supply maintain (stock.service applyDeltas mirrors every
        // costDeltaMinor into costBalanceMinor). Without this, sumMinor was
        // always 0 and costDeltaMinor was 0n, so a write-off dropped qty but
        // NEVER decremented inventory VALUE → valuation drift (the buyPrice/
        // cost runtime bug-class, 066d55fb; Phase-1 audit called this page
        // "clean"). Per-unit cost is frozen onto the position so unpost/
        // cancel reverse the identical value (post↔unpost cost zero-sum —
        // they read p.costMinor with the same valueMinor formula below).
        // «Себестоимость» FALLBACK — when the store has NO stock (costBal ≤ 0 /
        // qty ≤ 0) the weighted-average is undefined, so book the product's COST
        // (buyPrice): a write-off cost is a product property, NOT derived from the
        // current «Остаток» — a 0/negative-stock write-off still removes value
        // (booking 0 was the empty-«Цена» bug the user flagged). Mirrors the FE
        // «Цена» (avg when stocked, else buyPrice).
        const productIds = existing.positions
          .map((p) => p.productId)
          .filter((x): x is string => !!x);
        const buyPriceByProduct = new Map<string, bigint>();
        if (productIds.length > 0) {
          const prods = await tx.product.findMany({
            where: { accountId, id: { in: productIds } },
            select: { id: true, buyPrice: true },
          });
          for (const pr of prods) buyPriceByProduct.set(pr.id, pr.buyPrice ?? 0n);
        }
        const perUnitByPos = new Map<string, bigint>();
        for (const p of existing.positions) {
          const bal = balances.get(p.assortmentId);
          const onHand = bal?.qty ?? '0';
          const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
          const fallback = p.productId ? (buyPriceByProduct.get(p.productId) ?? 0n) : 0n;
          // The user's entered «Цена» (costMinor) wins; otherwise the store
          // weighted-average (computePerUnitCost rounds half-up) when there IS
          // stock, else the product cost fallback (no stock-cost basis).
          const perUnit =
            p.costMinor != null
              ? BigInt(p.costMinor)
              : costBal > 0n
                ? computePerUnitCost(costBal, onHand)
                : fallback;
          perUnitByPos.set(p.id, perUnit);
        }

        let totalCost = 0n;
        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = perUnitByPos.get(p.id) ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          totalCost += valueMinor;
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -valueMinor,
            docType: 'loss',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          };
        });

        // Freeze the per-unit cost on positions so unpost/cancel reverse the
        // exact same value (they recompute from p.costMinor).
        for (const p of existing.positions) {
          await tx.lossPosition.update({
            where: { id: p.id },
            data: { costMinor: perUnitByPos.get(p.id) ?? 0n },
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.loss.update({
          where: { id, accountId },
          data: {
            state: 'posted',
            applicable: true,
            postedAt: new Date(),
            sumMinor: totalCost,
          },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Loss',
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
    existing: Awaited<ReturnType<LossService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft (current: ${existing.state})`);
    }
    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard (STK-01, Faza 5): claim posted→draft as the FIRST op.
        // `existing` comes from a read OUTSIDE this transaction, so without the
        // claim two concurrent unposts both saw `posted` and both credited the
        // stock back. Serializable alone only hid it while positions existed
        // (both txs touch the same Stock rows ⇒ the loser aborts with 40001) —
        // an EMPTY write-off locks nothing. Same reasoning as post() below.
        await transitionWithClaim(tx.loss, {
          id,
          accountId,
          fromStates: ['posted'],
          toState: 'draft',
          message: "Spisanie holati o'zgargan — allaqachon o'zgartirilgan",
        });

        const deltas: StockDelta[] = existing.positions.map((p) => {
          const costPerUnit = p.costMinor ?? 0n;
          const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
          return {
            storeId: existing.storeId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            cellId: p.cellId ?? null,
            qtyDelta: String(p.quantity),
            costDeltaMinor: valueMinor,
            docType: 'loss_unpost',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          };
        });
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.loss.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Loss',
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
    existing: Awaited<ReturnType<LossService['findById']>>,
  ) {
    if (existing.state === 'cancelled') throw new BadRequestException('Oldin cancel qilingan');
    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard (STK-01, Faza 5): claim the EXACT snapshotted state →
        // cancelled as the FIRST op. Loss was the only stock document whose
        // cancel() had NEITHER the claim NOR Serializable (move/enter/inventory
        // all do), so two parallel cancels — or a cancel racing an unpost that
        // already flipped posted→draft — both ran `applyDeltas(+qty)` and gave
        // the write-off back TWICE (phantom qty AND phantom costBalanceMinor,
        // two `loss_cancel` ledger rows). A state LITERAL cannot close the
        // cancel-vs-unpost variant; the snapshotted state can.
        await transitionWithClaim(tx.loss, {
          id,
          accountId,
          fromStates: [existing.state],
          toState: 'cancelled',
          message: "Spisanie holati o'zgargan — allaqachon o'zgartirilgan",
        });

        const wasApplicable = existing.applicable;
        if (wasApplicable) {
          const deltas: StockDelta[] = existing.positions.map((p) => {
            const costPerUnit = p.costMinor ?? 0n;
            const valueMinor = scaleMinorByQty(costPerUnit, String(p.quantity));
            return {
              storeId: existing.storeId,
              assortmentKind: p.assortmentKind,
              assortmentId: p.assortmentId,
              cellId: p.cellId ?? null,
              qtyDelta: String(p.quantity),
              costDeltaMinor: valueMinor,
              docType: 'loss_cancel',
              docId: id,
              docPositionId: p.id,
              reason: 'cancel',
            };
          });
          await this.stock.applyDeltas(tx, accountId, userId, deltas);
        }
        const updated = await tx.loss.update({
          where: { id, accountId },
          data: { state: 'cancelled', applicable: false },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Loss',
            entityId: id,
            action: 'transition:cancelled',
            fieldChanges: {
              from: { before: existing.state, after: 'cancelled' },
            } as Prisma.InputJsonValue,
          },
        });
        return updated;
      },
      // Serializable + `withSerializationRetry` (transition()) — the same
      // discipline post()/unpost() already run under. cancel() was the one
      // stock-reversing path still on the default ReadCommitted.
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }

  // =====================================================================
  private parseCreate(raw: unknown): CreateLossInput {
    const r = CreateLossSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdateLossInput {
    const r = UpdateLossSchema.safeParse(raw);
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
    const year = new Date().getFullYear();
    const prefix = `СП-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.loss.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    return `${prefix}${String(n).padStart(5, '0')}`;
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
        entity: 'Loss',
        entityId,
        action,
        fieldChanges: fieldChanges as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException(`Bu qiymat bilan loss mavjud: ${err.meta?.target?.join(', ')}`);
    }
    throw e as Error;
  }
}
