import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { compareDecimals } from '../demand/fifo-consumer.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import {
  type WoComponentInput,
  type WoConsumptionCost,
  buildReversalDeltas,
  computeConsumptionCost,
  negateDecimalString,
} from './work-order-cost.js';
import {
  BulkDeleteWorkOrderSchema,
  BulkTransitionWorkOrderSchema,
  CreateWorkOrderSchema,
  TransitionWorkOrderSchema,
  UpdateWorkOrderSchema,
  WorkOrderFilterSchema,
  type WorkOrderState,
} from './work-order.schema.js';

/**
 * WorkOrderService — CRUD + FSM for WorkOrder (Техническое задание / ТЗ).
 *
 * FSM transitions:
 *   draft        → in_progress  (sets startedAt = now())
 *   in_progress  → completed    (sets completedAt = now(); producedQty must be > 0)
 *   draft|in_progress → cancelled
 *   completed    → cancelled    (manual override; startedAt/completedAt preserved for audit)
 *
 * DECISION: On cancel, we do NOT clear startedAt or completedAt.
 * These timestamps are kept for audit trail purposes — knowing that the
 * order was started/completed before being cancelled is important audit data.
 *
 * STOCK CASCADES:
 *   - in_progress → completed: consumes BOM components, emits output
 *     product (applyCompleteCascade). Sufficiency check on components.
 *   - completed → cancelled: re-adds components, decrements output
 *     product (applyCancelCascade). Sufficiency check on the output —
 *     if the produced units already left the store the cancel surfaces
 *     InsufficientStock unless `store.allowNegativeStock = true`.
 *   Both run inside the same transaction as the FSM flip + audit row,
 *   guarded by a CAS update so concurrent transitions can't double-fire.
 *
 * COST (Faza Q2 / `PP-05`): both cascades carry VALUE, not just quantity —
 * components leave at the per-store weighted average (`buyPrice` fallback,
 * NULL kept as NULL), the produced good absorbs exactly that total, and the
 * cancellation reverses the completion's own ledger rows bit-for-bit rather
 * than recomputing from the (possibly edited) BOM. See `work-order-cost.ts`.
 *
 * Auto-numbering: ТЗ-YYYY-NNNNN (per-account, per-year sequence).
 */
@Injectable()
export class WorkOrderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  // =========================================================================
  // List
  // =========================================================================

  async list(accountId: string, rawFilter: unknown) {
    const filter = WorkOrderFilterSchema.parse(rawFilter);
    const where: Prisma.WorkOrderWhereInput = {
      accountId,
      deletedAt: null,
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.bomId ? { bomId: filter.bomId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.client.workOrder.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        bom: {
          select: {
            id: true,
            name: true,
            productId: true,
            product: { select: { id: true, name: true } },
          },
        },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.workOrder.count({ where });

    return {
      items: items.map((r) => this.serialize(r)),
      nextCursor,
      total,
    };
  }

  // =========================================================================
  // Find by id
  // =========================================================================

  async findById(accountId: string, id: string) {
    const wo = await this.prisma.client.workOrder.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        bom: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
            components: {
              orderBy: { position: 'asc' },
              include: {
                product: { select: { id: true, name: true, code: true, uom: true } },
              },
            },
          },
        },
        store: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!wo) throw new NotFoundException(`WorkOrder ${id} topilmadi`);
    return this.serialize(wo);
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(accountId: string, userId: string, raw: unknown) {
    const parsed = CreateWorkOrderSchema.parse(raw);
    const name = parsed.name ?? (await this.nextName(accountId));

    await this.ensureRefs(accountId, parsed.bomId, parsed.storeId);
    if (parsed.ownerId) await this.ensureOwner(accountId, parsed.ownerId);

    try {
      const wo = await this.prisma.client.workOrder.create({
        data: {
          accountId,
          ownerId: parsed.ownerId ?? userId,
          name,
          bomId: parsed.bomId,
          storeId: parsed.storeId,
          plannedQty: parsed.plannedQty,
          // «Дата документа» — honour the operator's chosen date; fall back to
          // now() (the DB default) when the create form omits it.
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          plannedStartAt: parsed.plannedStartAt ? new Date(parsed.plannedStartAt) : null,
          plannedEndAt: parsed.plannedEndAt ? new Date(parsed.plannedEndAt) : null,
          description: parsed.description,
          state: 'draft',
        },
        include: {
          bom: {
            select: {
              id: true,
              name: true,
              productId: true,
              product: { select: { id: true, name: true } },
            },
          },
          store: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      });
      await this.logAudit(accountId, userId, 'create', wo.id, null);
      return this.serialize(wo);
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Update
  // =========================================================================

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = UpdateWorkOrderSchema.parse(raw);
    const existing = await this.findById(accountId, id);

    if (existing.state === 'completed' || existing.state === 'cancelled') {
      throw new BadRequestException(
        `${existing.state} holatdagi work order tahrirlash mumkin emas`,
      );
    }

    if (parsed.bomId)
      await this.ensureRefs(accountId, parsed.bomId, parsed.storeId ?? existing.storeId);
    if (parsed.storeId && !parsed.bomId) await this.ensureStore(accountId, parsed.storeId);
    if (parsed.ownerId) await this.ensureOwner(accountId, parsed.ownerId);

    const data: Prisma.WorkOrderUpdateInput = {};
    if (parsed.bomId) data.bom = { connect: { id: parsed.bomId } };
    if (parsed.storeId) data.store = { connect: { id: parsed.storeId } };
    if (parsed.ownerId !== undefined) {
      data.owner = parsed.ownerId ? { connect: { id: parsed.ownerId } } : { disconnect: true };
    }
    if (parsed.plannedQty !== undefined) data.plannedQty = parsed.plannedQty;
    if (parsed.moment !== undefined) data.moment = new Date(parsed.moment);
    if (parsed.plannedStartAt !== undefined) {
      data.plannedStartAt = parsed.plannedStartAt ? new Date(parsed.plannedStartAt) : null;
    }
    if (parsed.plannedEndAt !== undefined) {
      data.plannedEndAt = parsed.plannedEndAt ? new Date(parsed.plannedEndAt) : null;
    }
    if (parsed.description !== undefined) data.description = parsed.description;

    try {
      const updated = await this.prisma.client.workOrder.update({
        where: { id, accountId, version: parsed.version },
        data: { ...data, version: { increment: 1 } },
        include: {
          bom: {
            select: {
              id: true,
              name: true,
              productId: true,
              product: { select: { id: true, name: true } },
            },
          },
          store: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      return this.serialize(updated);
    } catch (e) {
      // findById above already confirmed the row exists, so a P2025 here means
      // the version filter missed — a concurrent edit bumped it. Map to 409
      // FIRST, before handlePrisma() (which would otherwise mask it as a 404).
      mapVersionedUpdateError(e, 'WorkOrder');
      this.handlePrisma(e);
    }
  }

  /**
   * mass-edit single-row apply. WorkOrder has no projectId column, so the
   * patch is restricted to ownerId + description (mirrors the price-list /
   * payroll / service-request hideProject pattern).
   */
  async massEditApply(
    accountId: string,
    id: string,
    patch: { ownerId?: string | null; description?: string | null },
  ) {
    await this.findById(accountId, id);
    // Scope FKs to the caller's account — the schema validates only UUID
    // format, so the bulk path must not be a softer entry point than the
    // single-document update (which guards via ensureOwner).
    await assertMassEditRefsInTenant(this.prisma, accountId, patch);
    const data: Record<string, unknown> = {};
    if ('ownerId' in patch) data.ownerId = patch.ownerId;
    if ('description' in patch) data.description = patch.description;
    return this.prisma.client.workOrder.update({ where: { id, accountId }, data });
  }

  // =========================================================================
  // Transition (FSM)
  // =========================================================================

  async transition(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = TransitionWorkOrderSchema.parse(raw);
    const wo = await this.findById(accountId, id);
    const from = wo.state as WorkOrderState;
    const to = parsed.state;

    this.validateTransition(from, to);

    const data: Prisma.WorkOrderUpdateInput = { state: to };

    if (to === 'in_progress') {
      data.startedAt = new Date();
    }

    let producedQtyForCascade: string | null = null;
    let reverseProducedQty: string | null = null;

    if (to === 'completed') {
      const producedQty = parsed.producedQty ?? String(wo.plannedQty);
      if (Number(producedQty) <= 0) {
        throw new BadRequestException("completed holat uchun producedQty > 0 bo'lishi shart");
      }
      data.producedQty = producedQty;
      data.completedAt = new Date();
      producedQtyForCascade = producedQty;
    }

    // Cancelling a completed WO must reverse the stock movement that the
    // completion cascade applied — otherwise the output sits in stock as
    // ghost inventory and the components stay deducted. The reverse leans on
    // the same `producedQty` that completion stored on the row.
    if (from === 'completed' && to === 'cancelled') {
      const produced = String(wo.producedQty);
      if (Number(produced) > 0) {
        reverseProducedQty = produced;
      }
    }

    // DECISION: On cancelled, we do NOT clear startedAt or completedAt.
    // Preserved for audit trail — knowing the order was started or even
    // completed before manual override is important for reconstruction.

    const updated = await this.prisma.client.$transaction(async (tx) => {
      // CAS-style guard: only flip if the row is still in `from` state.
      // Two concurrent transitions could otherwise both succeed and either
      // (a) double-fire the stock cascade or (b) overwrite each other's
      // producedQty. updateMany returns count=0 when the row has moved.
      const flip = await tx.workOrder.updateMany({
        where: { id, accountId, state: from, deletedAt: null },
        data,
      });
      if (flip.count === 0) {
        throw new ConflictException(
          `WorkOrder ${id} state changed; transition aborted (already ${to}?)`,
        );
      }

      // Stock cascade for in_progress → completed:
      //   - consume components (negative deltas, sufficiency-checked)
      //   - emit output product (positive delta)
      // All inside the same tx — atomic with the FSM flip + audit row.
      if (producedQtyForCascade !== null) {
        await this.applyCompleteCascade(tx, accountId, userId, {
          workOrderId: id,
          bomId: wo.bomId,
          storeId: wo.storeId,
          producedQty: producedQtyForCascade,
        });
      }

      // Reverse cascade for completed → cancelled:
      //   - re-add components (positive deltas, no sufficiency check needed)
      //   - subtract output product (negative delta, sufficiency-checked
      //     unless the store permits negative stock — same policy as completion)
      // The output qty comes from the persisted producedQty on the row at the
      // moment of completion, so the reversal is exact.
      if (reverseProducedQty !== null) {
        await this.applyCancelCascade(tx, accountId, userId, {
          workOrderId: id,
          bomId: wo.bomId,
          storeId: wo.storeId,
          producedQty: reverseProducedQty,
        });
      }

      return tx.workOrder.findUniqueOrThrow({
        where: { id, accountId },
        include: {
          bom: {
            select: {
              id: true,
              name: true,
              productId: true,
              product: { select: { id: true, name: true } },
            },
          },
          store: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
        },
      });
    });

    await this.logAudit(accountId, userId, `transition:${to}`, id, {
      from: { before: from, after: to },
    });

    return this.serialize(updated);
  }

  /**
   * Stock cascade for the in_progress → completed transition. Pulls the BOM
   * (output product, output qty per run, component list) inside the same
   * transaction as the FSM flip so the cascade and the state change are
   * inseparable. Component qty is scaled by `producedQty / outputQty`, so
   * a BOM that yields 10 per run × 50 produced = 5 runs worth of components.
   *
   * Sufficiency: the WorkOrder's storeId.allowNegativeStock flag drives
   * whether we throw on insufficient component stock or let the ledger go
   * negative (rare — set per-store for in-house experimental builds).
   */
  private async applyCompleteCascade(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    args: {
      workOrderId: string;
      bomId: string;
      storeId: string;
      producedQty: string;
    },
  ): Promise<void> {
    const bom = await tx.billOfMaterials.findFirst({
      where: { id: args.bomId, accountId },
      select: {
        id: true,
        productId: true,
        outputQty: true,
        components: {
          select: { id: true, productId: true, qty: true },
        },
      },
    });
    if (!bom) {
      throw new NotFoundException(`BOM ${args.bomId} not found for account`);
    }

    const store = await tx.store.findFirst({
      where: { id: args.storeId, accountId },
      select: { allowNegativeStock: true },
    });
    if (!store) {
      throw new NotFoundException(`Store ${args.storeId} not found`);
    }

    const outputQty = Number(String(bom.outputQty));
    const produced = Number(args.producedQty);
    if (outputQty <= 0) {
      throw new BadRequestException(`BOM outputQty must be > 0, got ${outputQty}`);
    }
    const runs = produced / outputQty;

    // Consume components — every component carries a non-null productId by schema.
    // Scale to total consumption: componentQty × runs.
    const consumption: WoComponentInput[] = bom.components.map((c) => ({
      componentId: c.id,
      productId: c.productId,
      quantity: (Number(String(c.qty)) * runs).toString(),
    }));

    // Faza Q2 / PP-05 — the components' VALUE must leave with their quantity.
    // Basis = the per-store weighted average on the very balances the
    // sufficiency check locks below (see work-order-cost.ts for the contract).
    let consumedCost: WoConsumptionCost = { lines: [], totalCostMinor: 0n, hasCost: false };

    if (consumption.length > 0) {
      const balances = await this.stock.lockBalances(
        tx,
        accountId,
        args.storeId,
        bom.components.map((c) => ({ kind: 'product' as const, id: c.productId })),
      );
      this.stock.assertAvailable(
        store.allowNegativeStock,
        consumption.map((c) => ({
          assortmentKind: 'product',
          assortmentId: c.productId,
          requested: c.quantity,
        })),
        balances,
      );

      // `buyPrice` fallback for components the store carries no value for.
      // Only non-NULL buyPrices go into the map — an absent key means UNKNOWN,
      // which the cost helper keeps as null instead of inventing a 0.
      const buyPriceByProduct = new Map<string, bigint>();
      const productIds = [...new Set(consumption.map((c) => c.productId))];
      const prods = await tx.product.findMany({
        where: { accountId, id: { in: productIds } },
        select: { id: true, buyPrice: true },
      });
      for (const pr of prods) {
        if (pr.buyPrice !== null && pr.buyPrice !== undefined) {
          buyPriceByProduct.set(pr.id, pr.buyPrice);
        }
      }

      consumedCost = computeConsumptionCost(consumption, balances, buyPriceByProduct);

      const componentDeltas: StockDelta[] = consumedCost.lines.map((l) => ({
        storeId: args.storeId,
        assortmentKind: 'product',
        assortmentId: l.productId,
        qtyDelta: `-${l.quantity}`,
        costDeltaMinor: l.lineCostMinor === null ? null : -l.lineCostMinor,
        docType: 'workorder',
        docId: args.workOrderId,
        docPositionId: l.componentId,
        reason: 'post',
      }));
      await this.stock.applyDeltas(tx, accountId, userId, componentDeltas);
    }

    // Emit output: positive delta of producedQty against bom.productId. The
    // produced good absorbs the ENTIRE consumed material value (the Processing
    // engine's single-output case — `distributeOutputCost` with N = 1), so the
    // cascade is value-conserving: Σ costDelta over the WO is exactly 0. When
    // no component had a basis at all the output cost is UNKNOWN, not 0.
    const outputDelta: StockDelta = {
      storeId: args.storeId,
      assortmentKind: 'product',
      assortmentId: bom.productId,
      qtyDelta: args.producedQty,
      costDeltaMinor: consumedCost.hasCost ? consumedCost.totalCostMinor : null,
      docType: 'workorder',
      docId: args.workOrderId,
      docPositionId: null,
      reason: 'post',
    };
    await this.stock.applyDeltas(tx, accountId, userId, [outputDelta]);
  }

  /**
   * Reverse cascade for completed → cancelled. Symmetric mirror of
   * applyCompleteCascade: components flow back in, the output product is
   * removed. Sufficiency check is applied to the output decrement only —
   * if the produced units have already been sold or moved out, the
   * cancellation needs `store.allowNegativeStock` or it surfaces as an
   * InsufficientStock error so the operator notices the inventory drift.
   *
   * Tagged `reason: 'unpost'` to match the StockOperation enum and stay
   * consistent with how Demand/Supply cancellations annotate the ledger.
   */
  private async applyCancelCascade(
    tx: Prisma.TransactionClient,
    accountId: string,
    userId: string,
    args: {
      workOrderId: string;
      bomId: string;
      storeId: string;
      producedQty: string;
    },
  ): Promise<void> {
    const store = await tx.store.findFirst({
      where: { id: args.storeId, accountId },
      select: { allowNegativeStock: true },
    });
    if (!store) {
      throw new NotFoundException(`Store ${args.storeId} not found`);
    }

    // Faza Q2 / PP-05 — FROZEN reversal. The completion's own ledger rows are
    // the only durable record of what it booked; reversing them exactly makes
    // the post↔cancel cycle zero-sum on BOTH axes even if the BOM was edited or
    // the store restocked at a different price in between. (Reversing a
    // recomputation, as this used to do, silently drifted in both cases.)
    const postOps = await tx.stockOperation.findMany({
      where: { accountId, docType: 'workorder', docId: args.workOrderId, reason: 'post' },
      orderBy: { occurredAt: 'asc' },
      select: {
        storeId: true,
        assortmentKind: true,
        assortmentId: true,
        qtyDelta: true,
        costDeltaMinor: true,
        docPositionId: true,
        cellId: true,
      },
    });

    if (postOps.length > 0) {
      const reversals = buildReversalDeltas(
        postOps.map((op) => ({ ...op, qtyDelta: String(op.qtyDelta) })),
      );

      // Sufficiency on the OUTFLOW side only (the produced units going back
      // out). Grouped by the ledger row's own store so the lock matches the
      // rows being moved, not an assumption about the WO's current store.
      const outflowsByStore = new Map<string, typeof reversals>();
      for (const r of reversals) {
        if (compareDecimals(r.qtyDelta, '0') >= 0) continue;
        const bucket = outflowsByStore.get(r.storeId) ?? [];
        bucket.push(r);
        outflowsByStore.set(r.storeId, bucket);
      }
      for (const [storeId, outflows] of outflowsByStore) {
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          storeId,
          outflows.map((r) => ({ kind: r.assortmentKind, id: r.assortmentId })),
        );
        this.stock.assertAvailable(
          store.allowNegativeStock,
          outflows.map((r) => ({
            assortmentKind: r.assortmentKind,
            assortmentId: r.assortmentId,
            requested: negateDecimalString(r.qtyDelta),
          })),
          balances,
        );
      }

      await this.stock.applyDeltas(
        tx,
        accountId,
        userId,
        reversals.map((r) => ({
          storeId: r.storeId,
          assortmentKind: r.assortmentKind,
          assortmentId: r.assortmentId,
          cellId: r.cellId,
          qtyDelta: r.qtyDelta,
          costDeltaMinor: r.costDeltaMinor,
          docType: 'workorder',
          docId: args.workOrderId,
          docPositionId: r.docPositionId,
          reason: 'unpost',
        })),
      );
      return;
    }

    // LEGACY fallback — a completion that left no ledger rows behind. Rebuild
    // from the BOM exactly as before (qty only, cost null): zero regression for
    // any historical row the ledger read can't serve.
    const bom = await tx.billOfMaterials.findFirst({
      where: { id: args.bomId, accountId },
      select: {
        id: true,
        productId: true,
        outputQty: true,
        components: {
          select: { id: true, productId: true, qty: true },
        },
      },
    });
    if (!bom) {
      throw new NotFoundException(`BOM ${args.bomId} not found for account`);
    }

    const outputQty = Number(String(bom.outputQty));
    const produced = Number(args.producedQty);
    if (outputQty <= 0) {
      throw new BadRequestException(`BOM outputQty must be > 0, got ${outputQty}`);
    }
    const runs = produced / outputQty;

    // Output decrement — must lock + assert availability so we don't silently
    // create negative stock when the produced units have already left the
    // warehouse.
    const outputBalances = await this.stock.lockBalances(tx, accountId, args.storeId, [
      { kind: 'product', id: bom.productId },
    ]);
    this.stock.assertAvailable(
      store.allowNegativeStock,
      [
        {
          assortmentKind: 'product',
          assortmentId: bom.productId,
          requested: args.producedQty,
        },
      ],
      outputBalances,
    );

    const outputDelta: StockDelta = {
      storeId: args.storeId,
      assortmentKind: 'product',
      assortmentId: bom.productId,
      qtyDelta: `-${args.producedQty}`,
      costDeltaMinor: null,
      docType: 'workorder',
      docId: args.workOrderId,
      docPositionId: null,
      reason: 'unpost',
    };
    await this.stock.applyDeltas(tx, accountId, userId, [outputDelta]);

    // Component re-add — pure inflow, no sufficiency check needed.
    if (bom.components.length > 0) {
      const componentDeltas: StockDelta[] = bom.components.map((c) => ({
        storeId: args.storeId,
        assortmentKind: 'product',
        assortmentId: c.productId,
        qtyDelta: (Number(String(c.qty)) * runs).toString(),
        costDeltaMinor: null,
        docType: 'workorder',
        docId: args.workOrderId,
        docPositionId: c.id,
        reason: 'unpost',
      }));
      await this.stock.applyDeltas(tx, accountId, userId, componentDeltas);
    }
  }

  // =========================================================================
  // Delete (soft)
  // =========================================================================

  async delete(accountId: string, userId: string, id: string) {
    // The pre-read only buys a PRECISE message (and a clean 404); the guard
    // that actually holds is the conditional write below.
    const wo = await this.findById(accountId, id);
    if (wo.state === 'in_progress') {
      throw new BadRequestException("Ishda bo'lgan work orderni o'chirib bo'lmaydi");
    }
    // Faza Q3: a COMPLETED ТЗ has already consumed its BOM components and
    // emitted the produced good (`applyCompleteCascade`, with VALUE since Faza
    // Q2). Soft-deleting it moved NOTHING back: the components stayed written
    // off, the output stayed in stock, and the only document that could reverse
    // them (`completed → cancelled`) disappeared from every list. Deletion is
    // now allowed only from the two states that hold no stock effect; a
    // completed order must be CANCELLED first, which runs the exact reversal.
    if (wo.state === 'completed') {
      throw new BadRequestException(
        "Tugatilgan work orderni o'chirib bo'lmaydi — avval bekor qiling (ombor teskarilashi uchun)",
      );
    }
    // TOCTOU guard: the state check + the soft-delete are ONE atomic
    // conditional write, so a concurrent transition() (draft → in_progress →
    // completed) cannot slip a delete through the window the pre-read opens.
    const res = await this.prisma.client.workOrder.updateMany({
      where: { id, accountId, state: { in: ['draft', 'cancelled'] }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) {
      throw new BadRequestException(
        "Faqat 'draft' yoki 'cancelled' holatidagi work orderni o'chirish mumkin",
      );
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
    return { ok: true };
  }

  // =========================================================================
  // Bulk delete
  // =========================================================================

  async bulkDelete(accountId: string, userId: string, raw: unknown) {
    const parsed = BulkDeleteWorkOrderSchema.parse(raw);
    const results = await Promise.allSettled(
      parsed.ids.map((id) => this.delete(accountId, userId, id)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { ok, failed, total: parsed.ids.length };
  }

  /**
   * Bulk-transition many WOs to draft / in_progress / cancelled. `completed`
   * is rejected at the schema layer because each WO needs its own
   * producedQty — that flow stays single-item.
   */
  async bulkTransition(accountId: string, userId: string, raw: unknown) {
    const parsed = BulkTransitionWorkOrderSchema.parse(raw);
    const results = await Promise.allSettled(
      parsed.ids.map((id) => this.transition(accountId, userId, id, { state: parsed.state })),
    );
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    results.forEach((r, i) => {
      const id = parsed.ids[i]!;
      if (r.status === 'fulfilled') succeeded.push(id);
      else {
        const err = r.reason;
        const msg =
          err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
        failed.push({ id, error: msg });
      }
    });
    return { total: parsed.ids.length, succeeded, failed };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Auto-number: ТЗ-YYYY-NNNNN — per-account, per-year sequence. */
  private async nextName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ТЗ-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.workOrder.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  private validateTransition(from: WorkOrderState, to: WorkOrderState): void {
    const allowed: Record<WorkOrderState, WorkOrderState[]> = {
      draft: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: ['cancelled'],
      cancelled: [],
    };
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(`${from} → ${to} o'tish mumkin emas`);
    }
  }

  private async ensureRefs(accountId: string, bomId: string, storeId: string): Promise<void> {
    const [bom, store] = await Promise.all([
      this.prisma.client.billOfMaterials.findFirst({ where: { id: bomId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: storeId, accountId } }),
    ]);
    if (!bom) throw new BadRequestException('BOM topilmadi');
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async ensureStore(accountId: string, storeId: string): Promise<void> {
    const store = await this.prisma.client.store.findFirst({ where: { id: storeId, accountId } });
    if (!store) throw new BadRequestException('Ombor topilmadi');
  }

  private async ensureOwner(accountId: string, ownerId: string): Promise<void> {
    const emp = await this.prisma.client.employee.findFirst({
      where: { id: ownerId, accountId },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Xodim topilmadi');
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
        entity: 'WorkOrder',
        entityId,
        action,
        ...(fieldChanges !== null ? { fieldChanges } : {}),
      },
    });
  }

  private serialize(r: {
    id: string;
    name: string;
    state: string;
    bomId: string;
    storeId: string;
    ownerId: string | null;
    plannedQty: unknown;
    producedQty: unknown;
    moment: Date;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    [key: string]: unknown;
  }) {
    return {
      ...r,
      plannedQty: r.plannedQty?.toString() ?? '0',
      producedQty: r.producedQty?.toString() ?? '0',
    };
  }

  private handlePrisma(e: unknown): never {
    const err = e as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      throw new ConflictException('WorkOrder nomi allaqachon mavjud');
    }
    if (err.code === 'P2025') throw new NotFoundException('Yozuv topilmadi');
    throw e;
  }
}
