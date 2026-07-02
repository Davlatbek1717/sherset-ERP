import { Prisma } from '@moysklad/db';
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
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type ReservationDelta, StockService } from '../stock/stock.service.js';
import { WebhookFireService } from '../webhook/webhook-fire.service.js';
import {
  type CreateProductionInput,
  CreateProductionSchema,
  ProductionFilterSchema,
  ProductionTransitionSchema,
  type ProductionTransitionTarget,
  type UpdateProductionInput,
  UpdateProductionSchema,
} from './production.schema.js';

const NAME_PREFIX = 'PROD';

/**
 * Pure (§115 / round-4 unit 2b): aggregate the materials a Production
 * must reserve from its child ProcessingOrders' BOMs. Exported + pure
 * so the correctness-critical math is adversarially unit-tested with
 * NO database (the §97 / CLAUDE.md mandatory-stock-QA discipline).
 *
 *   runs         = (PO.quantity / 1000) / BOM.outputQty   // qty is ×1000
 *   perComponent = component.qty × runs
 *   out[pid]     = Σ over all child POs, 6-dp (Decimal(20,6)) trimmed
 *
 * Guards: missing/zero/negative outputQty ⇒ that PO contributes 0
 * (never divide-by-zero, never negative reserve); a product summing to
 * 0 is dropped (no zero-qty ledger row).
 */
export function aggregateBomReservations(
  orders: Array<{
    quantity: string;
    outputQty: string | null;
    components: Array<{ productId: string; qty: string }>;
  }>,
): Array<{ productId: string; qty: string }> {
  const perProduct = new Map<string, number>();
  for (const o of orders) {
    if (o.outputQty == null) continue;
    const outputQty = Number(o.outputQty);
    if (!(outputQty > 0)) continue; // divide-by-zero / negative guard
    const orderedUnits = Number(o.quantity) / 1000; // PO.quantity is ×1000
    const runs = orderedUnits / outputQty;
    if (!(runs > 0)) continue;
    for (const c of o.components) {
      const add = Number(c.qty) * runs;
      if (!(add > 0)) continue;
      perProduct.set(c.productId, (perProduct.get(c.productId) ?? 0) + add);
    }
  }
  const out: Array<{ productId: string; qty: string }> = [];
  for (const [productId, qty] of perProduct) {
    const rounded = qty.toFixed(6).replace(/\.?0+$/, '');
    if (rounded === '0' || rounded === '') continue;
    out.push({ productId, qty: rounded });
  }
  return out;
}

/**
 * ProductionService — CRUD + FSM for the top-level production request.
 *
 * Doesn't own positions (Production is a header doc; the actual
 * shop-floor work is split into ProcessingOrders that link back via
 * `productionId`). Auto-generates name PROD-YYYY-NNNNN if not provided.
 *
 * FSM transitions are wrapped in webhook fire + audit log. Once posted,
 * unpost is blocked if any child ProcessingOrder has been posted —
 * defence against accidental rollback that would leave shop-floor
 * records orphaned.
 */
@Injectable()
export class ProductionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttributeMetadataService) private readonly attrs: AttributeMetadataService,
    @Inject(WebhookFireService) private readonly webhookFire: WebhookFireService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProductionFilterSchema.parse(rawFilter);
    const momentRange =
      filter.momentFrom || filter.momentTo
        ? {
            moment: tashkentRangeBounds(filter.momentFrom, filter.momentTo),
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
    const where: Prisma.ProductionWhereInput = {
      accountId,
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.customerOrderId ? { customerOrderId: filter.customerOrderId } : {}),
      ...(filter.applicable !== undefined ? { applicable: filter.applicable } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...momentRange,
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
    const rows = await this.prisma.client.production.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        customerOrder: { select: { id: true, name: true } },
        _count: { select: { processingOrders: true } },
      },
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.production.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.production.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: true,
        store: true,
        materialsStore: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        customerOrder: { select: { id: true, name: true, state: true } },
        processingOrders: {
          where: { deletedAt: null },
          select: { id: true, name: true, state: true, quantity: true, moment: true },
          orderBy: { moment: 'desc' },
          take: 100,
        },
      },
    });
    if (!row) throw new NotFoundException(`Production ${id} not found`);
    return row;
  }

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = this.parseCreate(raw);
    const name = parsed.name ?? (await this.nextName(accountId));

    await this.ensureRefs(accountId, parsed.organizationId, parsed.storeId, parsed.customerOrderId);

    const attributes = await this.attrs.validateAndNormalize(
      accountId,
      'Production',
      parsed.attributes,
    );

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    try {
      const created = await this.prisma.client.production.create({
        data: {
          accountId,
          groupId: creatorGroupId,
          ownerId: userId,
          name,
          externalCode: parsed.externalCode ?? null,
          organizationId: parsed.organizationId,
          storeId: parsed.storeId,
          materialsStoreId: parsed.materialsStoreId ?? null,
          projectId: parsed.projectId ?? null,
          customerOrderId: parsed.customerOrderId ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          deliveryPlannedMoment: parsed.deliveryPlannedMoment
            ? new Date(parsed.deliveryPlannedMoment)
            : null,
          productionStart: parsed.productionStart ? new Date(parsed.productionStart) : null,
          productionEnd: parsed.productionEnd ? new Date(parsed.productionEnd) : null,
          reserve: parsed.reserve,
          awaiting: parsed.awaiting,
          description: parsed.description ?? null,
          vatEnabled: parsed.vatEnabled,
          vatIncluded: parsed.vatIncluded,
          currency: parsed.currency,
          rateValue: BigInt(parsed.rateValue),
          attributes: attributes as Prisma.InputJsonValue,
          state: 'draft',
        },
      });
      await this.logAudit(accountId, userId, 'create', created.id, null);
      this.webhookFire.fireForEvent(accountId, 'production', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException("Provedeno production'ni o'zgartirib bo'lmaydi");
    }

    const data: Prisma.ProductionUpdateInput = {};
    if (parsed.externalCode !== undefined) data.externalCode = parsed.externalCode;
    if (parsed.description !== undefined) data.description = parsed.description;
    if (parsed.vatEnabled !== undefined) data.vatEnabled = parsed.vatEnabled;
    if (parsed.vatIncluded !== undefined) data.vatIncluded = parsed.vatIncluded;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.deliveryPlannedMoment !== undefined) {
      data.deliveryPlannedMoment = parsed.deliveryPlannedMoment
        ? new Date(parsed.deliveryPlannedMoment)
        : null;
    }
    if (parsed.productionStart !== undefined) {
      data.productionStart = parsed.productionStart ? new Date(parsed.productionStart) : null;
    }
    if (parsed.productionEnd !== undefined) {
      data.productionEnd = parsed.productionEnd ? new Date(parsed.productionEnd) : null;
    }
    if (parsed.reserve !== undefined) data.reserve = parsed.reserve;
    if (parsed.awaiting !== undefined) data.awaiting = parsed.awaiting;
    if (parsed.organizationId) data.organization = { connect: { id: parsed.organizationId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.materialsStoreId !== undefined) {
      data.materialsStore = parsed.materialsStoreId
        ? { connect: { id: parsed.materialsStoreId } }
        : { disconnect: true };
    }
    if (parsed.projectId !== undefined) {
      data.project = parsed.projectId
        ? { connect: { id: parsed.projectId } }
        : { disconnect: true };
    }
    if (parsed.customerOrderId !== undefined) {
      data.customerOrder = parsed.customerOrderId
        ? { connect: { id: parsed.customerOrderId } }
        : { disconnect: true };
    }
    if (parsed.attributes !== undefined) {
      const validated = await this.attrs.validateAndNormalize(
        accountId,
        'Production',
        parsed.attributes,
      );
      data.attributes = validated as Prisma.InputJsonValue;
    }

    try {
      // Optimistic-lock (lost-update guard): the version filter + increment go
      // on this single header update. Production is header-only (no child
      // arrays, no two-step totals write), so no $transaction is needed — a
      // stale version matches zero rows → P2025 → 409, nothing else to roll
      // back. transition()/post()/unpost()/cancel() are NOT locked here.
      const updated = await this.prisma.client.production.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      this.webhookFire.fireForEvent(accountId, 'production', 'UPDATE', id);
      return updated;
    } catch (e) {
      mapVersionedUpdateError(e, 'Production');
      this.handlePrisma(e);
    }
  }

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = ProductionTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: ProductionTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    const result =
      target === 'post'
        ? await this.post(accountId, userId, id, existing)
        : target === 'unpost'
          ? await this.unpost(accountId, userId, id, existing)
          : await this.cancel(accountId, userId, id, existing);
    this.webhookFire.fireForEvent(accountId, 'production', 'UPDATE', id, ['state']);
    return result;
  }

  async delete(accountId: string, userId: string, id: string) {
    // findById gives a clean 404 for a missing / wrong-tenant id.
    await this.findById(accountId, id);
    // TOCTOU guard: the not-applicable check + soft-delete are ONE atomic
    // conditional write, so a concurrent post() flipping it applicable can't
    // slip a delete through — count 0 → rejected.
    const res = await this.prisma.client.production.updateMany({
      where: { id, accountId, applicable: false, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException("Provedeno production'ni o'chirib bo'lmaydi");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    this.webhookFire.fireForEvent(accountId, 'production', 'DELETE', id);
    return { ok: true };
  }

  async clone(accountId: string, userId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);
    try {
      const created = await this.prisma.client.production.create({
        data: {
          accountId,
          groupId: creatorGroupId,
          ownerId: userId,
          name,
          externalCode: null,
          organizationId: src.organizationId,
          storeId: src.storeId,
          materialsStoreId: src.materialsStoreId,
          projectId: src.projectId,
          customerOrderId: src.customerOrderId,
          moment: new Date(),
          deliveryPlannedMoment: src.deliveryPlannedMoment,
          productionStart: null,
          productionEnd: null,
          reserve: src.reserve,
          awaiting: src.awaiting,
          description: src.description,
          vatEnabled: src.vatEnabled,
          vatIncluded: src.vatIncluded,
          currency: src.currency,
          rateValue: src.rateValue,
          attributes: src.attributes as Prisma.InputJsonValue,
          state: 'draft',
        },
      });
      await this.logAudit(accountId, userId, 'clone', created.id, { sourceId });
      this.webhookFire.fireForEvent(accountId, 'production', 'CREATE', created.id);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // ----- transitions ----------------------------------------------------

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProductionService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → posted. Faqat draft'dan`);
    }
    // §115 — state change + material reservation are ONE atomic tx. If
    // reserve=true and a materials store is set, hold the BOM materials
    // of every child ProcessingOrder in that store (over-reservation is
    // allowed by design — moysklad parity). No materials store or no
    // child-PO BOMs ⇒ post still succeeds, nothing reserved (honest V1:
    // the header-only Production has no materials of its own).
    const updated = await this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: atomically claim draft→posted as the first op so a second
      // concurrent post blocks on the row lock, then sees count 0 → clean 409 —
      // never a second material reservation hold.
      const claim = await tx.production.updateMany({
        where: { id, accountId, state: 'draft' },
        data: { state: 'posted' },
      });
      if (claim.count === 0) {
        throw new ConflictException("Production allaqachon o'tkazilgan yoki 'draft' holatida emas");
      }
      const u = await tx.production.update({
        where: { id, accountId },
        data: { state: 'posted', applicable: true, postedAt: new Date() },
      });
      if (existing.reserve && existing.materialsStoreId) {
        const deltas = await this.resolveProductionReservations(
          tx,
          accountId,
          id,
          existing.materialsStoreId,
        );
        if (deltas.length > 0) {
          await this.stock.lockBalances(
            tx,
            accountId,
            existing.materialsStoreId,
            deltas.map((d) => ({ kind: d.assortmentKind, id: d.assortmentId })),
          );
          await this.stock.applyReservationDeltas(tx, accountId, userId, deltas);
        }
      }
      return u;
    });
    await this.logAudit(accountId, userId, 'transition:posted', id, {
      from: { before: 'draft', after: 'posted' },
    });
    return updated;
  }

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProductionService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`O'tkazilmaydi: ${existing.state} → draft. Faqat posted'dan`);
    }
    // Block unpost if any child ProcessingOrder has been posted —
    // unposting would orphan shop-floor execution records.
    const postedChildren = await this.prisma.client.processingOrder.count({
      where: { accountId, productionId: id, state: 'posted', deletedAt: null },
    });
    if (postedChildren > 0) {
      throw new BadRequestException(
        `Bu production'ga bog'liq ${postedChildren} ta provedeno ProcessingOrder bor — avval ularni snyat qiling`,
      );
    }
    // §115 — state change + EXACT reservation release in one atomic tx.
    // releaseReservationByDoc reverses the recorded net (idempotent —
    // a doc that reserved nothing is a clean no-op).
    const updated = await this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: atomically claim posted→draft. A second concurrent
      // unpost/cancel blocks on the row lock, then sees count 0 → clean 409 —
      // never a second reservation release.
      const claim = await tx.production.updateMany({
        where: { id, accountId, state: 'posted' },
        data: { state: 'draft' },
      });
      if (claim.count === 0) {
        throw new ConflictException(
          "Production 'posted' holatida emas (allaqachon o'zgartirilgan)",
        );
      }
      const u = await tx.production.update({
        where: { id, accountId },
        data: { state: 'draft', applicable: false, postedAt: null },
      });
      await this.releaseDocReservations(tx, accountId, userId, id, 'release_unpost');
      return u;
    });
    await this.logAudit(accountId, userId, 'transition:draft', id, {
      from: { before: 'posted', after: 'draft' },
    });
    return updated;
  }

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProductionService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Oldin cancel qilingan');
    }
    // §115 — cancel from draft (never reserved ⇒ no-op release) or from
    // posted (release the held materials). Atomic; idempotent.
    const updated = await this.prisma.client.$transaction(async (tx) => {
      // TOCTOU guard: claim the EXACT snapshotted state→cancelled. A concurrent
      // unpost (posted→draft) that already ran makes this count 0 → 409, so we
      // never double-release reservations.
      const claim = await tx.production.updateMany({
        where: { id, accountId, state: existing.state },
        data: { state: 'cancelled' },
      });
      if (claim.count === 0) {
        throw new ConflictException("Production holati o'zgargan (allaqachon o'zgartirilgan)");
      }
      const u = await tx.production.update({
        where: { id, accountId },
        data: { state: 'cancelled', applicable: false },
      });
      await this.releaseDocReservations(tx, accountId, userId, id, 'release_cancel');
      return u;
    });
    await this.logAudit(accountId, userId, 'transition:cancelled', id, {
      from: { before: existing.state, after: 'cancelled' },
    });
    return updated;
  }

  // ----- reservation helpers (§115 / round-4 unit 2b) -------------------

  /**
   * Resolve the materials a Production should reserve = aggregate of
   * every child ProcessingOrder's BOM components, scaled by ordered qty.
   * Header-only Production owns no materials; they come from its
   * ProcessingOrders' processingPlan (BillOfMaterials).
   *
   *   runs          = (PO.quantity / 1000) / BOM.outputQty   // qty is ×1000
   *   perComponent  = component.qty × runs
   *   reserved[pid] = Σ over all child POs
   *
   * The reservation amount is a soft-hold ESTIMATE (Number math, 6-dp
   * rounded — Decimal(20,6)); the correctness-critical invariant
   * (release == exactly what was reserved) is guaranteed by the ledger
   * (releaseReservationByDoc reverses recorded deltas), NOT by
   * recomputing this — so estimate rounding here is safe + documented.
   */
  private async resolveProductionReservations(
    tx: Prisma.TransactionClient,
    accountId: string,
    productionId: string,
    storeId: string,
  ): Promise<ReservationDelta[]> {
    const orders = await tx.processingOrder.findMany({
      where: {
        accountId,
        productionId,
        deletedAt: null,
        processingPlanId: { not: null },
      },
      select: {
        quantity: true,
        processingPlan: {
          select: {
            outputQty: true,
            components: { select: { productId: true, qty: true } },
          },
        },
      },
    });

    return aggregateBomReservations(
      orders.map((o) => ({
        quantity: o.quantity.toString(),
        outputQty: o.processingPlan?.outputQty.toString() ?? null,
        components: (o.processingPlan?.components ?? []).map((c) => ({
          productId: c.productId,
          qty: c.qty.toString(),
        })),
      })),
    ).map((r) => ({
      storeId,
      assortmentKind: 'product',
      assortmentId: r.productId,
      qtyDelta: r.qty,
      docType: 'production',
      docId: productionId,
      reason: 'reserve',
    }));
  }

  /**
   * Lock the affected stock rows (from this doc's reservation ledger)
   * then release the outstanding net EXACTLY. No ledger rows (reserve
   * was false / no materials store) ⇒ clean no-op.
   */
  private async releaseDocReservations(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    productionId: string,
    reason: 'release_unpost' | 'release_cancel',
  ): Promise<void> {
    const rows = await tx.stockReservation.findMany({
      where: { accountId, docType: 'production', docId: productionId },
      select: { storeId: true, assortmentKind: true, assortmentId: true },
    });
    if (rows.length === 0) return;

    const byStore = new Map<string, Array<{ kind: string; id: string }>>();
    for (const r of rows) {
      const list = byStore.get(r.storeId) ?? [];
      if (!list.some((x) => x.id === r.assortmentId && x.kind === r.assortmentKind)) {
        list.push({ kind: r.assortmentKind, id: r.assortmentId });
      }
      byStore.set(r.storeId, list);
    }
    for (const [storeId, assortments] of byStore) {
      await this.stock.lockBalances(tx, accountId, storeId, assortments);
    }
    await this.stock.releaseReservationByDoc(
      tx,
      accountId,
      userId,
      'production',
      productionId,
      reason,
    );
  }

  // ----- helpers --------------------------------------------------------

  private async nextName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${NAME_PREFIX}-${year}-`;
    const next = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.production.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      const tail = last?.name.slice(prefix.length) ?? '0';
      return Number.parseInt(tail, 10) || 0;
    });
    return `${prefix}${next.toString().padStart(5, '0')}`;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    storeId: string,
    customerOrderId: string | null | undefined,
  ): Promise<void> {
    const [org, store] = await Promise.all([
      this.prisma.client.organization.findFirst({
        where: { id: organizationId, accountId },
        select: { id: true },
      }),
      this.prisma.client.store.findFirst({
        where: { id: storeId, accountId },
        select: { id: true },
      }),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
    if (customerOrderId) {
      const co = await this.prisma.client.customerOrder.findFirst({
        where: { id: customerOrderId, accountId, deletedAt: null },
        select: { id: true },
      });
      if (!co) throw new BadRequestException('Mijoz buyurtmasi topilmadi');
    }
  }

  private async logAudit(
    accountId: string,
    userId: string,
    action: string,
    entityId: string,
    fieldChanges: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: {
        accountId,
        userId,
        entity: 'Production',
        entityId,
        action,
        fieldChanges: fieldChanges ?? Prisma.JsonNull,
      },
    });
  }

  private parseCreate(raw: unknown): CreateProductionInput {
    const r = CreateProductionSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateProductionInput {
    const r = UpdateProductionSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private handlePrisma(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ConflictException('Bunday nom yoki kod allaqachon mavjud');
      }
    }
    throw e;
  }
}
