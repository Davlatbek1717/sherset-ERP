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
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { type OverheadLineInput, distributeOverhead } from '../supply/overhead-distribution.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateMoveInput,
  CreateMoveSchema,
  type MoveFilterInput,
  MoveFilterSchema,
  type MoveOverheadDistribution,
  MoveTransitionSchema,
  type MoveTransitionTarget,
  type UpdateMoveInput,
  UpdateMoveSchema,
} from './move.schema.js';

/**
 * MoveService — stock transfer between two stores of the same account.
 *
 * post() contract (Serializable $tx):
 *   1. Lock Stock rows on SOURCE store (lockBalances + assertAvailable)
 *   2. Two StockDeltas per position:
 *        a. -qty on sourceStoreId (docType='move_out')
 *        b. +qty on destinationStoreId (docType='move_in')
 *      Cost basis carried across (costMinor from source Stock row).
 *   3. Persist position.costMinor (so unpost can reverse with exact cost).
 *   4. Audit 'move.posted'.
 *
 * Unpost reverses both legs via positive delta on source + negative on destination.
 */
@Injectable()
export class MoveService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = MoveFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization / sourceStore /
    // destinationStore (the list-view exposes these column headers as
    // sortable). Mirror supply.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'sourceStore'
          ? { sourceStore: { name: filter.sortDir } }
          : filter.sortBy === 'destinationStore'
            ? { destinationStore: { name: filter.sortDir } }
            : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.move.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        sourceStore: { select: { id: true, name: true } },
        destinationStore: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.move.count({ where });
    return { items, nextCursor, total };
  }

  /**
   * moysklad «Показать итоги → Итого» — grand total over the ENTIRE active
   * filter set (not just the current page). Reuses buildListWhere so the
   * aggregate respects exactly the same filters as list(). Move is an
   * internal transfer carried in the org's base currency (UZS for the demo
   * + climart), so a single sumMinor total is correct here — no per-currency
   * split is needed (unlike multi-currency sales docs).
   */
  async aggregateTotals(accountId: string, rawFilter: unknown) {
    const filter = MoveFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);
    const [result, currencyGroups] = await Promise.all([
      this.prisma.client.move.aggregate({
        where,
        _sum: { sumMinor: true },
        _count: { _all: true },
      }),
      // Distinct currencies in the filtered set — moves default to UZS but the
      // model allows other currencies (and the row cell formats per-row), so the
      // footer must show «—» on a mixed set instead of summing them as UZS.
      this.prisma.client.move.groupBy({ by: ['currency'], where }),
    ]);
    return {
      count: result._count._all,
      sumMinor: (result._sum.sumMinor ?? 0n).toString(),
      currencies: currencyGroups.map((g) => g.currency),
    };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror supply.service.ts so the
   * Move filter panel reaches moysklad «Перемещения» parity (~10 backed
   * fields) without two-place drift. Preserves the accountId tenant guard
   * + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: Move is an internal warehouse doc — it has NO agentId,
   * agentAccountId, contractId, organizationAccountId, or salesChannelId
   * (no counterparty). DO NOT add those clauses.
   */
  private buildListWhere(accountId: string, filter: MoveFilterInput): Prisma.MoveWhereInput {
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

    // OR-groups (search · «Движение по складу» source-OR-destination) must be
    // AND-combined so they don't clobber a single top-level `OR` key.
    const and: Prisma.MoveWhereInput[] = [];
    if (filter.search) {
      and.push({
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { description: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filter.stockStoreId) {
      and.push({
        OR: [{ sourceStoreId: filter.stockStoreId }, { destinationStoreId: filter.stockStoreId }],
      });
    }

    return {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.sourceStoreId ? { sourceStoreId: filter.sourceStoreId } : {}),
      ...(filter.destinationStoreId ? { destinationStoreId: filter.destinationStoreId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.modifiedById ? { modifiedById: filter.modifiedById } : {}),
      // «Товар или группа» — at least one position carries this product.
      ...(filter.productId ? { positions: { some: { productId: filter.productId } } } : {}),
      // «Общий доступ» — owner-access shared flag.
      ...(filter.shared !== undefined ? { shared: filter.shared } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.printed !== undefined ? { printed: filter.printed } : {}),
      ...(filter.published !== undefined ? { published: filter.published } : {}),
      ...momentRange,
      ...updatedRange,
      ...sumRange,
      ...(and.length ? { AND: and } : {}),
    };
  }

  async findById(accountId: string, id: string) {
    const m = await this.prisma.client.move.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        sourceStore: true,
        destinationStore: true,
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        positions: {
          include: {
            // weightG / volumeML drive «Накладные расходы» WEIGHT / VOLUME
            // distribution at post time (§65, mirrors Supply/Enter).
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                uom: true,
                weightG: true,
                volumeML: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!m) throw new NotFoundException(`Move ${id} not found`);
    return m;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    await this.ensureRefs(
      accountId,
      parsed.organizationId,
      parsed.sourceStoreId,
      parsed.destinationStoreId,
    );

    const name = await this.nextName(accountId);

    const attributes = await this.attrs.validateAndNormalize(accountId, 'Move', parsed.attributes);

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.move.create({
        data: {
          accountId,
          ownerId: userId,
          modifiedById: userId,
          groupId: creatorGroupId,
          name,
          organizationId: parsed.organizationId,
          sourceStoreId: parsed.sourceStoreId,
          destinationStoreId: parsed.destinationStoreId,
          projectId: parsed.projectId ?? null,
          customerOrderId: parsed.customerOrderId ?? null,
          externalCode: parsed.externalCode ?? null,
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
            })),
          },
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'move', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);
    if (existing.applicable) {
      throw new BadRequestException("Provedeno peremeshcheniyani o'zgartirib bo'lmaydi");
    }

    const data: Prisma.MoveUpdateInput = {};
    // «Кто изменил» — stamp the current user as last editor on every update.
    data.modifiedBy = { connect: { id: userId } };
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.sourceStoreId) data.sourceStore = { connect: { id: parsed.sourceStoreId } };
    if (parsed.destinationStoreId)
      data.destinationStore = { connect: { id: parsed.destinationStoreId } };
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
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(accountId, 'Move', parsed.attributes);
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
        })),
      };
    }

    try {
      // Class A: child-row replacement (deleteMany) + the version-guarded
      // header update run in ONE transaction. If the optimistic-lock version
      // filter misses (concurrent edit), the update touches zero rows → P2025 →
      // the deleteMany rolls back, so the positions are NOT lost. Move is a
      // single-update stock doc (no two-step totals write — sumMinor is set at
      // post(), not here), so only this one versioned update carries the filter.
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (parsed.positions !== undefined) {
          await tx.movePosition.deleteMany({ where: { moveId: id, accountId } });
        }
        return tx.move.update({
          where: { id, accountId, version: parsed.version },
          data: { ...data, version: { increment: 1 } },
        });
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'move', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Move');
      this.handlePrisma(e);
    }
  }

  /**
   * moysklad «Массовое редактирование» — apply ownerId / projectId /
   * description to one move (called per-id by the controller's runBulk).
   * Metadata-only (no stock effect), so it intentionally skips the
   * applicable-guard that update() enforces — owner/comment can change on a
   * posted move, mirroring supply.massEditApply. Stamps modifiedById.
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
    const updated = await this.prisma.client.move.update({ where: { id, accountId }, data });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    this.webhookFire.fireForEvent(accountId, 'move', 'UPDATE', id, Object.keys(data));
    return updated;
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = MoveTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(`Notog'ri transition: ${String(targetRaw)}`);
    }
    const target: MoveTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);
    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'move', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: the draft-state check + soft-delete are ONE atomic
    // conditional write, so a concurrent post() flipping draft→posted between a
    // naive check and the write can't slip a delete through — count 0 → rejected.
    const res = await this.prisma.client.move.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi peremeshcheniyani o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'move', 'DELETE', id);
    return { ok: true };
  }

  /** Mirrors moysklad's "Скопировать". */
  async clone(accountId: string, userId: string, id: string) {
    const source = await this.prisma.client.move.findFirst({
      where: { id, accountId, deletedAt: null },
      include: { positions: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      throw new BadRequestException('Peremeshchenie topilmadi');
    }
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    const created = await this.prisma.client.move.create({
      data: {
        accountId,
        ownerId: userId,
        modifiedById: userId,
        groupId: creatorGroupId,
        name,
        organizationId: source.organizationId,
        sourceStoreId: source.sourceStoreId,
        destinationStoreId: source.destinationStoreId,
        // moysklad Скопировать preserves header refs (was lossy before).
        projectId: source.projectId,
        externalCode: source.externalCode,
        moment: new Date(),
        description: source.description,
        // §65: moysklad «Скопировать» preserves the «Накладные расходы»
        // setup too (mirrors §34 Enter / §12 Supply clone).
        overheadSumMinor: source.overheadSumMinor,
        overheadDistribution: source.overheadDistribution,
        overheadCurrency: source.overheadCurrency,
        // §61: moysklad «Скопировать» preserves custom-field values
        // (доп. поля) too — clone() dropped them (cash/payment clone
        // already preserve them; §39 lossless-clone precedent).
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
          })),
        },
      },
    });
    await this.logAudit(accountId, userId, 'clone', created.id, { sourceId: id });
    this.webhookFire.fireForEvent(accountId, 'move', 'CREATE', created.id);
    return created;
  }

  // =====================================================================
  // Transition handlers
  // =====================================================================

  /**
   * Per-position transfer costs (tiyin). Deterministic pure function of
   * the Move's own STABLE inputs (position.costMinor — the post-time
   * source weighted-average snapshot — quantity, product weight/volume,
   * overheadSumMinor, method). post() / unpost() / cancel() all derive
   * the IDENTICAL maps from the SAME persisted snapshot, so a post→unpost
   * (or cancel) cycle is exactly zero-sum WITHOUT persisting any derived
   * value, and post→unpost→post is idempotent by construction (§34 Enter
   * precedent). overhead=0 ⇒ landed === base (distribute helper not even
   * called) so a pure relocation gives the destination exactly what the
   * source lost.
   *
   *   base   = source-store weighted-avg the goods physically carry
   *            (source −base, destination +base).
   *   landed = base + this line's «Накладные расходы» share, capitalised
   *            into the destination inventory (destination +landed). Net
   *            system value rises by exactly overheadSumMinor — the
   *            transfer cost becomes goods value (§12/§34 capitalisation).
   */
  private lineCostsByPosition(existing: Awaited<ReturnType<MoveService['findById']>>): {
    baseByPos: Map<string, bigint>;
    landedByPos: Map<string, bigint>;
    totalBase: bigint;
  } {
    const baseLineOf = (p: (typeof existing.positions)[number]): bigint =>
      scaleMinorByQty(p.costMinor ?? 0n, String(p.quantity));
    const baseByPos = new Map<string, bigint>();
    for (const p of existing.positions) baseByPos.set(p.id, baseLineOf(p));
    let totalBase = 0n;
    for (const v of baseByPos.values()) totalBase += v;

    const landedByPos = new Map<string, bigint>();
    if (existing.overheadSumMinor > 0n) {
      const inputs: OverheadLineInput[] = existing.positions.map((p, i) => ({
        index: i,
        quantity: String(p.quantity),
        baseLineMinor: baseByPos.get(p.id) ?? 0n,
        weightG: p.product?.weightG ?? null,
        volumeML: p.product?.volumeML ?? null,
      }));
      const dist = distributeOverhead(
        inputs,
        existing.overheadSumMinor,
        existing.overheadDistribution as MoveOverheadDistribution,
      );
      for (const d of dist) {
        const p = existing.positions[d.index];
        if (!p) {
          throw new Error(
            `Overhead distribution index ${d.index} out of range (positions=${existing.positions.length})`,
          );
        }
        landedByPos.set(p.id, d.lineCostMinor);
      }
    } else {
      for (const p of existing.positions) landedByPos.set(p.id, baseByPos.get(p.id) ?? 0n);
    }
    return { baseByPos, landedByPos, totalBase };
  }

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<MoveService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Only draft → posted (current: ${existing.state})`);
    }
    if (existing.positions.length === 0) {
      throw new BadRequestException("Pozitsiyalar yo'q");
    }

    const sourceStore = await this.prisma.client.store.findFirst({
      where: { id: existing.sourceStoreId, accountId },
      select: { id: true, allowNegativeStock: true },
    });
    if (!sourceStore) throw new NotFoundException('Source store topilmadi');

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim draft→posted as the first op so a
        // second concurrent post blocks on the row lock, then sees count 0 and
        // gets a clean 409 — never a second stock transfer. Inside the tx, so a
        // later failure (insufficient stock) rolls the claim back.
        const claim = await tx.move.updateMany({
          where: { id, accountId, state: 'draft' },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Peremeshchenie allaqachon o'tkazilgan yoki 'draft' holatida emas",
          );
        }

        // Lock source store balances + sufficiency check
        const assortments = existing.positions.map((p) => ({
          kind: p.assortmentKind,
          id: p.assortmentId,
        }));
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          existing.sourceStoreId,
          assortments,
        );
        this.stock.assertAvailable(
          sourceStore.allowNegativeStock,
          existing.positions.map((p) => ({
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            name: p.product?.name,
            requested: String(p.quantity),
          })),
          balances,
        );

        // §65 B1a: derive each position's base cost from the LOCKED
        // source-store weighted-average (Stock.costBalanceMinor / qty —
        // the schema's documented contract, schema.prisma:5658-5660),
        // snapshot it on MovePosition.costMinor so unpost/cancel exact-
        // reverse regardless of later source-stock changes. The prior
        // `0n` placeholder silently zeroed cost on EVERY transfer (real
        // money bug — destination goods appeared free, source overstated;
        // §36 deferred this on a stale "Stock has no cost" comment that
        // the schema itself contradicts).
        for (const p of existing.positions) {
          const bal = balances.get(p.assortmentId);
          const srcCost = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
          const srcQtyMicro = bal?.qty ? BigInt(Math.round(Number(bal.qty) * 1_000_000)) : 0n;
          const basePerUnit =
            srcQtyMicro > 0n ? (srcCost * 1_000_000n + srcQtyMicro / 2n) / srcQtyMicro : 0n;
          await tx.movePosition.update({
            where: { id: p.id },
            data: { costMinor: basePerUnit },
          });
          // Reflect the snapshot in the in-memory doc so the pure
          // lineCostsByPosition() helper (shared with unpost/cancel)
          // derives identical base/landed → zero-sum by construction.
          p.costMinor = basePerUnit;
        }

        // §65 B1b: «Накладные расходы» capitalised into the destination
        // landed cost. Source loses base only; destination gains
        // base + its overhead share. Net system inventory value rises by
        // exactly overheadSumMinor (the transfer cost becomes goods
        // value), mirroring §12 Supply / §34 Enter.
        const { baseByPos, landedByPos, totalBase } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = [];
        for (const p of existing.positions) {
          deltas.push({
            storeId: existing.sourceStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -(baseByPos.get(p.id) ?? 0n),
            docType: 'move_out',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          });
          deltas.push({
            storeId: existing.destinationStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(p.quantity),
            costDeltaMinor: landedByPos.get(p.id) ?? 0n,
            docType: 'move_in',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.move.update({
          where: { id, accountId },
          data: {
            state: 'posted',
            applicable: true,
            postedAt: new Date(),
            sumMinor: totalBase,
            modifiedById: userId,
          },
        });

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Move',
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
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<MoveService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Only posted → draft (current: ${existing.state})`);
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically claim posted→draft. A second concurrent
        // unpost/cancel blocks on the row lock, then sees count 0 → clean 409 —
        // never a second stock reversal.
        const claim = await tx.move.updateMany({
          where: { id, accountId, state: 'posted' },
          data: { state: 'draft' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            "Peremeshchenie 'posted' holatida emas (allaqachon o'zgartirilgan)",
          );
        }

        // Exact reversal of post() via the SAME pure helper on the SAME
        // persisted costMinor snapshot + Move-header overhead config →
        // zero-sum by construction (§65, §34 precedent).
        const { baseByPos, landedByPos } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = [];
        for (const p of existing.positions) {
          // Restore source (give back the base it lost)
          deltas.push({
            storeId: existing.sourceStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(p.quantity),
            costDeltaMinor: baseByPos.get(p.id) ?? 0n,
            docType: 'move_unpost_in',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          });
          // Remove from destination (take back base + capitalised overhead)
          deltas.push({
            storeId: existing.destinationStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -(landedByPos.get(p.id) ?? 0n),
            docType: 'move_unpost_out',
            docId: id,
            docPositionId: p.id,
            reason: 'unpost',
          });
        }
        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.move.update({
          where: { id, accountId },
          data: { state: 'draft', applicable: false, postedAt: null, modifiedById: userId },
        });
        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Move',
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
    existing: Awaited<ReturnType<MoveService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }
    return this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: claim the EXACT snapshotted state→cancelled. A concurrent
      // unpost (posted→draft) that already ran makes this count 0 → 409, so we
      // never double-reverse stock.
      const claim = await tx.move.updateMany({
        where: { id, accountId, state: existing.state },
        data: { state: 'cancelled' },
      });
      if (claim.count === 0) {
        throw new ConflictException("Peremeshchenie holati o'zgargan (allaqachon o'zgartirilgan)");
      }
      const wasApplicable = existing.applicable;
      if (wasApplicable) {
        // Same exact reversal as unpost() — shared pure helper on the
        // persisted snapshot → zero-sum by construction (§65).
        const { baseByPos, landedByPos } = this.lineCostsByPosition(existing);
        const deltas: StockDelta[] = [];
        for (const p of existing.positions) {
          deltas.push({
            storeId: existing.sourceStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: String(p.quantity),
            costDeltaMinor: baseByPos.get(p.id) ?? 0n,
            docType: 'move_cancel_in',
            docId: id,
            docPositionId: p.id,
            reason: 'cancel',
          });
          deltas.push({
            storeId: existing.destinationStoreId,
            assortmentKind: p.assortmentKind,
            assortmentId: p.assortmentId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -(landedByPos.get(p.id) ?? 0n),
            docType: 'move_cancel_out',
            docId: id,
            docPositionId: p.id,
            reason: 'cancel',
          });
        }
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      }
      const updated = await tx.move.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false, modifiedById: userId },
      });
      await tx.auditLog.create({
        data: {
          accountId,
          userId,
          entity: 'Move',
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
  private parseCreate(raw: unknown): CreateMoveInput {
    const r = CreateMoveSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
  private parseUpdate(raw: unknown): UpdateMoveInput {
    const r = UpdateMoveSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    sourceStoreId: string,
    destinationStoreId: string,
  ): Promise<void> {
    const [org, src, dst] = await Promise.all([
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: sourceStoreId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: destinationStoreId, accountId } }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!src) throw new BadRequestException('Source ombor topilmadi');
    if (!dst) throw new BadRequestException('Destination ombor topilmadi');
    if (sourceStoreId === destinationStoreId) {
      throw new BadRequestException("Source va destination omborlar bir xil bo'la olmaydi");
    }
  }

  private async nextName(accountId: string): Promise<string> {
    // moysklad-parity: 5-digit zero-padded «00483», no «ПЕ-YYYY-» prefix
    // (grounded on climart #move). Year-less counter key; the 2026-06-18
    // renumber migration pre-seeds it for the demo account.
    const n = await allocateDocumentNumber(this.prisma.client, accountId, 'move', async () => {
      const rows = await this.prisma.client.move.findMany({
        where: { accountId },
        select: { name: true },
      });
      let max = 0;
      for (const r of rows) {
        if (/^\d+$/.test(r.name)) max = Math.max(max, Number.parseInt(r.name, 10));
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
        entity: 'Move',
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
        `Bu qiymat bilan peremeshcheniye allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
