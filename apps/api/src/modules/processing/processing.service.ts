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
import { tashkentRangeBounds } from '../report/report-date-bounds.util.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
import { assertMassEditRefsInTenant } from '../shared/mass-edit.js';
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import {
  type ReservationDelta,
  type StockDelta,
  StockService,
  netOutstandingReservations,
} from '../stock/stock.service.js';
import { distributeOutputCost } from './output-cost-distribution.js';
import {
  type CreateProcessingInput,
  CreateProcessingSchemaChecked,
  type ProcessingFilter,
  ProcessingFilterSchema,
  ProcessingTransitionSchema,
  type ProcessingTransitionTarget,
  type UpdateProcessingInput,
  UpdateProcessingSchema,
} from './processing.schema.js';

/**
 * Processing (Техоперация) — shop-floor execution that actually moves stock.
 *
 * Lifecycle vs. ProcessingOrder:
 *   ProcessingOrder = planning header ("we want N units of P")  ← no stock effects
 *   Processing      = execution record  ("we made M units today") ← stock cascade
 *
 * post() contract (Serializable $tx):
 *   1. Reload BOM (with components) inside the tx — we never trust the cached
 *      copy on `existing`, because a clerk might have edited the BOM between
 *      draft creation and post.
 *   2. Compute per-component required qty:
 *        recipeRuns = processing.quantityMicro / bom.outputQtyMicro
 *        materialQty (whole) = component.qty × recipeRuns   (Decimal-safe)
 *      We work in human-units (Decimal) for stock deltas because that's what
 *      Stock.qty is stored in. We only round at the boundary.
 *   3. Lock material Stock rows on materialsStoreId (ordered by assortmentId
 *      to prevent AB/BA deadlocks against concurrent Processing/Demand posts).
 *   4. assertAvailable — Processing always demands sufficient stock (no
 *      negative-stock override; this is a manufacturing op, not a sale).
 *   5. Apply deltas:
 *        - For each component: -qty on materialsStoreId, docType=processing_consume
 *        - For BOM.product:    +qty on productsStoreId,   docType=processing_produce
 *      Cost basis = REAL weighted-average from Stock.costBalanceMinor /
 *      Stock.qty per consumed material (the actual Supply/InvoiceIn cost
 *      already in stock), NOT BOM.standardCost. The output product's
 *      costDeltaMinor = Σ(consumed material cost) so a later Demand bills
 *      the correct margin. (This docstring previously claimed a stale
 *      "v1: BOM.standardCost / Stock has no per-row cost" — corrected
 *      §87; the code uses weighted-avg, schema.prisma:5658 documents
 *      Stock.costBalanceMinor, cf. §65 Move.)
 *   6. Persist costSumMinor + a materialsSnapshot [{productId,qty,
 *      costMinor}] on the row, and bump linked ProcessingOrder.
 *      movedSumMinor so the planning report progresses toward fulfilment.
 *   7. Audit.
 *
 * unpost / cancel-from-posted:
 *   - Reverse using the PERSISTED materialsSnapshot (exact, regardless
 *     of subsequent BOM or Stock edits). Pre-snapshot legacy rows fall
 *     back to re-reading the CURRENT BOM (documented legacy path,
 *     covered by processing.service.test.ts). The "v2 should snapshot"
 *     note was stale — the snapshot IS implemented (§87).
 *   - Reverse the qty deltas (same numbers, opposite signs)
 *   - Reverse the costSumMinor and movedSumMinor bump
 *
 * Race-safety:
 *   - $transaction with isolationLevel='Serializable' prevents phantom reads
 *     between sufficiency check and delta apply.
 *   - lockBalances() takes FOR UPDATE locks ordered by assortmentId.
 *   - State check ('draft' for post, 'posted' for unpost) is inside the tx so
 *     two concurrent posts of the same Processing can't both succeed.
 */

/**
 * Exact Decimal(≤6dp) string → integer micro-units (×1e6). No float.
 * Defensive: any non-numeric/garbage input (NaN, undefined, "abc",
 * empty) ⇒ 0n — never throws, never NaN (money discipline; the
 * adversarial-QA contract).
 */
function decToMicro(v: string): bigint {
  const s = (v ?? '0').trim();
  const neg = s.startsWith('-');
  const abs = neg ? s.slice(1) : s;
  const [whole = '', frac = ''] = abs.split('.');
  // Only plain digit runs are valid; anything else ⇒ 0.
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac) || (whole === '' && frac === '')) {
    return 0n;
  }
  const micro = BigInt(`${whole || '0'}${frac.padEnd(6, '0').slice(0, 6)}`);
  return neg ? -micro : micro;
}

/** Exact integer micro-units → trimmed Decimal(≤6dp) string. */
function microToDec(micro: bigint): string {
  const neg = micro < 0n;
  const abs = (neg ? -micro : micro).toString().padStart(7, '0');
  const whole = abs.slice(0, -6);
  const frac = abs.slice(-6).replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * §2c / round-4 — pure release-on-consume planner. When a Production's
 * own child Processing consumes materials, the Production's soft
 * reservation for those materials must be released by EXACTLY the
 * consumed amount (capped at what's still outstanding) so the
 * Production's own flow is not blocked by its own reservation, while
 * any surplus stays reserved for sibling ops. Exported + pure ⇒
 * adversarially DB-free tested (§97 / CLAUDE.md mandatory stock-QA).
 *
 *   release[p] = min( Σ consumed[p], outstandingNet[p] )   (>0 only)
 *
 * Exact via BigInt micro-units; consumed lines aggregated per product
 * first (a product may appear in >1 material line).
 */
export function computeConsumeReleases(
  outstanding: Array<{ productId: string; qty: string }>,
  consumed: Array<{ productId: string; qty: string }>,
): Array<{ productId: string; qty: string }> {
  const net = new Map<string, bigint>();
  for (const o of outstanding) {
    const m = decToMicro(o.qty);
    if (m > 0n) net.set(o.productId, (net.get(o.productId) ?? 0n) + m);
  }
  const want = new Map<string, bigint>();
  for (const c of consumed) {
    const m = decToMicro(c.qty);
    if (m > 0n) want.set(c.productId, (want.get(c.productId) ?? 0n) + m);
  }
  const out: Array<{ productId: string; qty: string }> = [];
  for (const [productId, wantMicro] of want) {
    const have = net.get(productId) ?? 0n;
    if (have <= 0n) continue;
    const rel = wantMicro < have ? wantMicro : have; // min(consumed, reserved)
    if (rel > 0n) out.push({ productId, qty: microToDec(rel) });
  }
  return out;
}

/** a(tiyin bigint) × b(decimal string, ≤6dp) → tiyin bigint, round half-up. */
function mulMinorByDec(aMinor: bigint, bDec: string): bigint {
  const aPos = aMinor < 0n ? -aMinor : aMinor;
  const bMicro = decToMicro(bDec); // b × 1e6
  const bPos = bMicro < 0n ? -bMicro : bMicro;
  // (a × bMicro + 0.5e6) / 1e6, round half-up on the positive magnitude.
  const scaled = (aPos * bPos + 500_000n) / 1_000_000n;
  const negative = aMinor < 0n !== bMicro < 0n;
  return negative ? -scaled : scaled;
}

/**
 * §117 / round-4 unit 3 — moysklad «Выполнение этапа производства»
 * cost rule. Pure + exported ⇒ adversarially unit-tested with NO DB
 * (the §97 / CLAUDE.md mandatory money/stock-QA discipline).
 *
 *   markup        = materialCost × materialMarkupPercent / 100   (½-up)
 *   labourPerUnit = enableHourAccounting
 *                     ? standardHourCost × standardHourUnit       (½-up)
 *                     : labourUnitCost                            (fixed)
 *   labourTotal   = labourPerUnit × productionVolume(units)       (½-up)
 *   effective     = materialCost + markup + labourTotal
 *
 * All money is BigInt tiyin; volume/hours are Decimal(≤6dp) strings
 * scaled exactly via micro-units. Negative/garbage inputs clamp to a
 * 0 contribution (defensive — never negative cost, never NaN). With
 * no stage ⇒ markupPercent 0 + all labour 0 ⇒ effective ===
 * materialCost ⇒ byte-identical to the pre-§117 money-engine (the
 * zero-regression guarantee the existing suite proves).
 */
export function computeStageEffectiveCost(input: {
  materialCostMinor: bigint;
  materialMarkupPercent: number;
  enableHourAccounting: boolean;
  labourUnitCostMinor: bigint;
  standardHourCostMinor: bigint;
  standardHourUnit: string;
  productionVolume: string;
}): { effectiveCostMinor: bigint; markupMinor: bigint; labourTotalMinor: bigint } {
  const material = input.materialCostMinor > 0n ? input.materialCostMinor : 0n;

  const pct =
    Number.isFinite(input.materialMarkupPercent) && input.materialMarkupPercent > 0
      ? BigInt(Math.trunc(input.materialMarkupPercent))
      : 0n;
  const markupMinor = pct > 0n ? (material * pct + 50n) / 100n : 0n;

  let labourPerUnitMinor: bigint;
  if (input.enableHourAccounting) {
    const cost = input.standardHourCostMinor > 0n ? input.standardHourCostMinor : 0n;
    labourPerUnitMinor = mulMinorByDec(cost, input.standardHourUnit);
  } else {
    labourPerUnitMinor = input.labourUnitCostMinor > 0n ? input.labourUnitCostMinor : 0n;
  }
  if (labourPerUnitMinor < 0n) labourPerUnitMinor = 0n;

  const labourTotalMinor = mulMinorByDec(labourPerUnitMinor, input.productionVolume);
  const labour = labourTotalMinor > 0n ? labourTotalMinor : 0n;

  return {
    markupMinor,
    labourTotalMinor: labour,
    effectiveCostMinor: material + markupMinor + labour,
  };
}

@Injectable()
export class ProcessingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
  ) {}

  // =========================================================================
  // List
  // =========================================================================

  async list(accountId: string, rawFilter: unknown) {
    const filter = ProcessingFilterSchema.parse(rawFilter);
    const where = this.buildListWhere(accountId, filter);

    // moysklad parity: relational sort for organization / materialsStore /
    // productsStore (the list-view exposes these column headers as
    // sortable). Mirrors internal-order.service.ts buildListWhere orderBy.
    const orderBy =
      filter.sortBy === 'organization'
        ? { organization: { name: filter.sortDir } }
        : filter.sortBy === 'materialsStore'
          ? { materialsStore: { name: filter.sortDir } }
          : filter.sortBy === 'productsStore'
            ? { productsStore: { name: filter.sortDir } }
            : { [filter.sortBy]: filter.sortDir };

    const rows = await this.prisma.client.processing.findMany({
      where,
      orderBy,
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        materialsStore: { select: { id: true, name: true } },
        productsStore: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        processingPlan: {
          select: {
            id: true,
            name: true,
            productId: true,
            product: { select: { id: true, name: true } },
          },
        },
        processingOrder: { select: { id: true, name: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.processing.count({ where });

    return { items, nextCursor, total };
  }

  /**
   * Shared WHERE builder for `list` (and any future aggregate that reuses
   * the active filter set). Extracted to mirror internal-order.service.ts
   * so the Processing filter panel reaches moysklad «Техоперации»
   * parity (~13 backed fields) without two-place drift. Preserves the
   * accountId tenant guard + deletedAt/includeDeleted soft-delete handling.
   *
   * NOTE: Processing is an internal production-execution doc — it has
   * NO agentId, agentAccountId, contractId, or salesChannelId
   * (no counterparty). DO NOT add those clauses. Dual stores
   * (materialsStoreId, productsStoreId) mirror Move's source/destination.
   */
  private buildListWhere(accountId: string, filter: ProcessingFilter): Prisma.ProcessingWhereInput {
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
            costSumMinor: {
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
      ...(filter.organizationIds ? { organizationId: { in: filter.organizationIds } } : {}),
      ...(filter.materialsStoreId ? { materialsStoreId: filter.materialsStoreId } : {}),
      ...(filter.productsStoreId ? { productsStoreId: filter.productsStoreId } : {}),
      ...(filter.processingPlanId ? { processingPlanId: filter.processingPlanId } : {}),
      ...(filter.processingOrderId ? { processingOrderId: filter.processingOrderId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
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

  // =========================================================================
  // FindById — includes BOM components for the materials display
  // =========================================================================

  async findById(accountId: string, id: string) {
    const row = await this.prisma.client.processing.findFirst({
      where: { id, accountId, deletedAt: null },
      include: {
        organization: { select: { id: true, name: true } },
        organizationAccount: { select: { id: true, name: true, accountNumber: true } },
        materialsStore: { select: { id: true, name: true } },
        productsStore: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true } },
        processingPlan: {
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
        processingOrder: { select: { id: true, name: true } },
        // §117 — the completed ProcessingStage (Этап). materialMarkup +
        // (fallback) laborCostMinor feed the post() cost cascade;
        // performer for display.
        processingStage: {
          select: { id: true, name: true, materialMarkup: true, laborCostMinor: true },
        },
        performer: { select: { id: true, name: true } },
        // §88 — explicit per-op materials (when present, post() consumes
        // these instead of exploding the BOM).
        materials: {
          orderBy: { position: 'asc' },
          include: { product: { select: { id: true, name: true, code: true, uom: true } } },
        },
        // §89 — explicit outputs (when present, post() produces these
        // instead of the single BOM product).
        products: {
          orderBy: { position: 'asc' },
          include: { product: { select: { id: true, name: true, code: true, uom: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException(`Processing ${id} topilmadi`);
    return row;
  }

  // =========================================================================
  // Create
  // =========================================================================

  async create(accountId: string, ownerId: string, raw: unknown) {
    const data = this.parseCreate(raw);

    await this.ensureRefs(
      accountId,
      data.organizationId,
      data.materialsStoreId,
      data.productsStoreId,
      data.processingPlanId ?? null,
    );

    const name = await this.nextName(accountId);
    const quantityMicro = this.toMicroqty(data.quantity);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);

    try {
      const created = await this.prisma.client.processing.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          name,
          organizationId: data.organizationId,
          organizationAccountId: data.organizationAccountId ?? null,
          materialsStoreId: data.materialsStoreId,
          productsStoreId: data.productsStoreId,
          projectId: data.projectId ?? null,
          processingPlanId: data.processingPlanId ?? null,
          processingOrderId: data.processingOrderId ?? null,
          moment: data.moment ? new Date(data.moment) : new Date(),
          quantity: quantityMicro,
          description: data.description ?? null,
          externalCode: data.externalCode ?? null,
          // §117 — stage-completion fields (defaulted ⇒ stage-less op
          // is byte-identical to pre-§117).
          processingStageId: data.processingStageId ?? null,
          performerId: data.performerId ?? null,
          defect: data.defect ?? false,
          enableHourAccounting: data.enableHourAccounting ?? false,
          labourUnitCostMinor: BigInt(data.labourUnitCostMinor ?? '0'),
          standardHourCostMinor: BigInt(data.standardHourCostMinor ?? '0'),
          standardHourUnit: new Prisma.Decimal(data.standardHourUnit ?? '0'),
          state: 'draft',
          applicable: false,
          ...(data.materials && data.materials.length > 0
            ? {
                materials: {
                  create: data.materials.map((m, i) => ({
                    accountId,
                    productId: m.productId,
                    qty: m.qty,
                    position: i,
                  })),
                },
              }
            : {}),
          ...(data.products && data.products.length > 0
            ? {
                products: {
                  create: data.products.map((p, i) => ({
                    accountId,
                    productId: p.productId,
                    qty: p.qty,
                    position: i,
                  })),
                },
              }
            : {}),
        },
      });
      await this.logAudit(accountId, ownerId, 'create', created.id, null);
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Update
  // =========================================================================

  async update(accountId: string, userId: string, id: string, raw: unknown) {
    const data = this.parseUpdate(raw);
    const existing = await this.findById(accountId, id);

    if (existing.applicable) {
      throw new BadRequestException(
        'Provedeno hujjatni tahrirlash mumkin emas — avval unpost qiling',
      );
    }

    const updateData: Prisma.ProcessingUpdateInput = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.externalCode !== undefined) updateData.externalCode = data.externalCode;
    if (data.moment !== undefined) updateData.moment = new Date(data.moment);
    if (data.organizationId) updateData.organization = { connect: { id: data.organizationId } };
    if (data.organizationAccountId !== undefined) {
      updateData.organizationAccount = data.organizationAccountId
        ? { connect: { id: data.organizationAccountId } }
        : { disconnect: true };
    }
    if (data.materialsStoreId) {
      updateData.materialsStore = { connect: { id: data.materialsStoreId } };
    }
    if (data.productsStoreId) {
      updateData.productsStore = { connect: { id: data.productsStoreId } };
    }
    if (data.projectId !== undefined) {
      updateData.project = data.projectId
        ? { connect: { id: data.projectId } }
        : { disconnect: true };
    }
    if (data.processingPlanId !== undefined && data.processingPlanId !== null) {
      updateData.processingPlan = { connect: { id: data.processingPlanId } };
    }
    if (data.processingOrderId !== undefined) {
      updateData.processingOrder = data.processingOrderId
        ? { connect: { id: data.processingOrderId } }
        : { disconnect: true };
    }
    if (data.quantity !== undefined) {
      updateData.quantity = this.toMicroqty(data.quantity);
    }
    // §117 — stage-completion editable fields. `defect` is NOT in
    // UpdateProcessingSchema (.strict() rejects it) ⇒ immutable after
    // create, moysklad parity.
    if (data.processingStageId !== undefined) {
      updateData.processingStage = data.processingStageId
        ? { connect: { id: data.processingStageId } }
        : { disconnect: true };
    }
    if (data.performerId !== undefined) {
      updateData.performer = data.performerId
        ? { connect: { id: data.performerId } }
        : { disconnect: true };
    }
    if (data.enableHourAccounting !== undefined) {
      updateData.enableHourAccounting = data.enableHourAccounting;
    }
    if (data.labourUnitCostMinor !== undefined) {
      updateData.labourUnitCostMinor = BigInt(data.labourUnitCostMinor);
    }
    if (data.standardHourCostMinor !== undefined) {
      updateData.standardHourCostMinor = BigInt(data.standardHourCostMinor);
    }
    if (data.standardHourUnit !== undefined) {
      updateData.standardHourUnit = new Prisma.Decimal(data.standardHourUnit);
    }
    // §88 — replace the explicit materials list (draft only; the
    // applicable guard above already blocked posted edits). [] clears.
    if (data.materials !== undefined) {
      updateData.materials = {
        deleteMany: {},
        create: data.materials.map((m, i) => ({
          accountId,
          productId: m.productId,
          qty: m.qty,
          position: i,
        })),
      };
    }
    // §89 — replace explicit outputs (draft only; same guard).
    if (data.products !== undefined) {
      updateData.products = {
        deleteMany: {},
        create: data.products.map((p, i) => ({
          accountId,
          productId: p.productId,
          qty: p.qty,
          position: i,
        })),
      };
    }

    try {
      // Optimistic-lock: the version filter rides on this SINGLE update.
      // The two child arrays (materials / products) are NESTED relation ops
      // (`{ deleteMany, create }`) on `updateData`, so they run ATOMICALLY
      // with the parent update — a stale-version P2025 means the row matched
      // zero rows and NEITHER the deleteMany NOR the create ran (no lost child
      // rows). Hence no $transaction is needed here (cf. Move's Class A,
      // which pulled deleteMany OUT into a tx; Processing keeps it nested).
      await this.prisma.client.processing.update({
        where: { id, accountId, version: data.version },
        data: { ...updateData, version: { increment: 1 } },
      });
      await this.logAudit(accountId, userId, 'update', id, null);
      return this.findById(accountId, id);
    } catch (e) {
      mapVersionedUpdateError(e, 'Processing');
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Soft delete
  // =========================================================================

  async softDelete(accountId: string, userId: string, id: string) {
    const row = await this.findById(accountId, id);
    if (row.applicable) {
      throw new BadRequestException(
        "Provedeno hujjatni o'chirish mumkin emas — avval unpost yoki cancel qiling",
      );
    }
    // TOCTOU guard: the draft-state check + soft-delete are ONE atomic
    // conditional write, so a concurrent post() flipping draft→posted (which
    // applies stock) can't slip a delete through without a reversal — count 0 →
    // rejected.
    const res = await this.prisma.client.processing.updateMany({
      where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
      data: { deletedAt: new Date(), state: 'cancelled' },
    });
    if (res.count === 0) {
      throw new BadRequestException("Faqat 'draft' holatidagi hujjatni o'chirish mumkin");
    }
    await this.logAudit(accountId, userId, 'delete', id, null);
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
    const updated = await this.prisma.client.processing.update({
      where: { id, accountId },
      data,
    });
    await this.logAudit(accountId, userId, 'mass-edit', id, patch);
    return updated;
  }

  async markPrinted(accountId: string, userId: string, id: string, printed: boolean) {
    await this.findById(accountId, id);
    const updated = await this.prisma.client.processing.update({
      where: { id, accountId },
      data: { printed },
    });
    await this.logAudit(accountId, userId, printed ? 'mark-printed' : 'unmark-printed', id, null);
    return updated;
  }

  // =========================================================================
  // Clone
  // =========================================================================

  async clone(accountId: string, ownerId: string, sourceId: string) {
    const src = await this.findById(accountId, sourceId);
    const name = await this.nextName(accountId);
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, ownerId);
    try {
      const created = await this.prisma.client.processing.create({
        data: {
          accountId,
          ownerId,
          groupId: creatorGroupId,
          name,
          organizationId: src.organizationId,
          organizationAccountId: src.organizationAccountId,
          materialsStoreId: src.materialsStoreId,
          productsStoreId: src.productsStoreId,
          projectId: src.projectId,
          processingPlanId: src.processingPlanId,
          processingOrderId: src.processingOrderId,
          moment: new Date(),
          quantity: src.quantity,
          description: src.description,
          externalCode: src.externalCode,
          // §117 — faithful clone of the stage-completion fields.
          processingStageId: src.processingStageId,
          performerId: src.performerId,
          defect: src.defect,
          enableHourAccounting: src.enableHourAccounting,
          labourUnitCostMinor: src.labourUnitCostMinor,
          standardHourCostMinor: src.standardHourCostMinor,
          standardHourUnit: src.standardHourUnit,
          state: 'draft',
          applicable: false,
          costSumMinor: 0n,
        },
      });
      await this.logAudit(accountId, ownerId, 'clone', created.id, { sourceId });
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  // =========================================================================
  // Transition dispatcher
  // =========================================================================

  async transition(accountId: string, userId: string, id: string, targetRaw: unknown) {
    const r = ProcessingTransitionSchema.safeParse(targetRaw);
    if (!r.success) {
      throw new BadRequestException(
        `Notog'ri transition: ${String(targetRaw)}. Ruxsat: post | unpost | cancel`,
      );
    }
    const target: ProcessingTransitionTarget = r.data;
    const existing = await this.findById(accountId, id);

    if (target === 'post') return this.post(accountId, userId, id, existing);
    if (target === 'unpost') return this.unpost(accountId, userId, id, existing);
    return this.cancel(accountId, userId, id, existing);
  }

  // =========================================================================
  // post — stock cascade (materials consumed, output produced)
  // =========================================================================

  private async post(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProcessingService['findById']>>,
  ) {
    if (existing.state !== 'draft') {
      throw new BadRequestException(`Faqat 'draft' → 'posted' (hozir: ${existing.state})`);
    }
    // §88: the output product still comes from the BOM, so a plan is
    // always required. BOM *components* are only needed when there is
    // no explicit materials[] list (explicit ⇒ BOM not exploded).
    const hasExplicitMaterials = (existing.materials?.length ?? 0) > 0;
    // §90 — the BOM (processingPlanId) supplies whichever side has no
    // explicit list. It is REQUIRED unless BOTH explicit materials[]
    // AND products[] are present (then the op is fully self-described).
    const hasExplicitProducts = (existing.products?.length ?? 0) > 0;
    if (!existing.processingPlanId && !(hasExplicitMaterials && hasExplicitProducts)) {
      throw new BadRequestException(
        'BOM majburiy — yoki materiallar va mahsulotlar ikkalasini ham kiriting',
      );
    }
    if (
      !hasExplicitMaterials &&
      existing.processingPlanId &&
      (!existing.processingPlan || existing.processingPlan.components.length === 0)
    ) {
      throw new BadRequestException('BOM komponentlari yoʻq — qaytadan tekshiring');
    }

    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically CLAIM draft→posted as the first op (replaces
        // the prior re-read-then-check, which two concurrent posts could both
        // pass). The loser matches 0 rows → 409; a later cascade failure
        // (insufficient stock) still rolls the claim back. The trailing update()
        // below re-sets state + persists the cost snapshot.
        const claim = await tx.processing.updateMany({
          where: { id, accountId, state: 'draft', applicable: false, deletedAt: null },
          data: { state: 'posted' },
        });
        if (claim.count === 0) {
          throw new ConflictException(
            'Hujjat boshqa joydan oʻzgartirilgan — sahifani qayta yuklang',
          );
        }

        // Re-load BOM inside tx (clerk may have edited it after draft
        // was created). §90 — null when no plan (both-explicit op).
        const bom = existing.processingPlanId
          ? await tx.billOfMaterials.findFirst({
              where: { id: existing.processingPlanId, accountId },
              include: {
                components: {
                  orderBy: { position: 'asc' },
                  include: { product: { select: { id: true, name: true } } },
                },
              },
            })
          : null;
        if (existing.processingPlanId && !bom) {
          throw new BadRequestException('BOM topilmadi');
        }
        if (!hasExplicitMaterials && (!bom || bom.components.length === 0)) {
          throw new BadRequestException('BOM komponentlari yoʻq');
        }
        if (!hasExplicitProducts && !bom) {
          throw new BadRequestException('Output mahsulot yoʻq — BOM yoki products[] kiriting');
        }
        if (!hasExplicitMaterials && bom && bom.outputQty.lessThanOrEqualTo(0)) {
          throw new BadRequestException('BOM outputQty 0 dan katta boʻlishi shart');
        }

        // §88 — material requirements source:
        //   explicit ProcessingMaterial rows ⇒ ACTUAL absolute qty (no
        //     recipe-run scaling; the operator recorded what was really
        //     consumed: substitutions, wastage, qty ≠ BOM standard);
        //   else ⇒ BOM-explode (unchanged v1):
        //     materialQty = component.qty × processingQty / bom.outputQty.
        // Everything downstream (lock, sufficiency, weighted-avg cost,
        // snapshot, consume deltas, exact reversal) is UNCHANGED — it
        // consumes whatever (productId, qty) list it is handed.
        const processingQtyDec = this.fromMicroqty(existing.quantity);
        let materialReqs: Array<{
          productId: string;
          productName?: string;
          qtyDec: Prisma.Decimal;
        }>;
        if (hasExplicitMaterials) {
          materialReqs = (existing.materials ?? []).map((m) => ({
            productId: m.productId,
            productName: m.product?.name,
            qtyDec: new Prisma.Decimal(m.qty.toString()),
          }));
        } else {
          // §90 — reached only when no explicit materials; the guards
          // above guarantee a BOM here. The throw both satisfies that
          // invariant and narrows `bom` for the compiler (no assertion).
          if (!bom) throw new BadRequestException('BOM komponentlari yoʻq');
          materialReqs = bom.components.map((c) => ({
            productId: c.productId,
            productName: c.product?.name,
            qtyDec: c.qty.mul(processingQtyDec).div(bom.outputQty),
          }));
        }

        // Lock + (release-on-consume) + sufficiency.
        const assortments = materialReqs.map((m) => ({ kind: 'product', id: m.productId }));
        await this.stock.lockBalances(tx, accountId, existing.materialsStoreId, assortments);

        // §2c — release-on-consume. If this Техоперация belongs to a
        // Production that soft-reserved these materials (§115), free
        // EXACTLY the consumed portion of THAT Production's reservation
        // first, so the Production's own execution is never blocked by
        // its own reservation (`available = qty − reservedQty`), while
        // any surplus stays held for sibling ops. No production / no
        // reservation ⇒ inert (zero-regression — reservedQty stays 0).
        if (existing.processingOrderId) {
          const po = await tx.processingOrder.findFirst({
            where: { id: existing.processingOrderId, accountId },
            select: { productionId: true },
          });
          if (po?.productionId) {
            const resRows = await tx.stockReservation.findMany({
              where: {
                accountId,
                docType: 'production',
                docId: po.productionId,
                storeId: existing.materialsStoreId,
                assortmentKind: 'product',
              },
              select: {
                storeId: true,
                assortmentKind: true,
                assortmentId: true,
                qtyDelta: true,
              },
            });
            const net = netOutstandingReservations(
              resRows.map((r) => ({
                storeId: r.storeId,
                assortmentKind: r.assortmentKind,
                assortmentId: r.assortmentId,
                qtyDelta: r.qtyDelta.toString(),
              })),
            );
            const releases = computeConsumeReleases(
              net.map((n) => ({ productId: n.assortmentId, qty: n.net })),
              materialReqs.map((m) => ({ productId: m.productId, qty: m.qtyDec.toString() })),
            );
            if (releases.length > 0) {
              const relDeltas: ReservationDelta[] = releases.map((r) => ({
                storeId: existing.materialsStoreId,
                assortmentKind: 'product',
                assortmentId: r.productId,
                qtyDelta: `-${r.qty}`,
                docType: 'production',
                docId: po.productionId as string,
                reason: 'release_consume',
              }));
              await this.stock.applyReservationDeltas(tx, accountId, userId, relDeltas);
            }
          }
        }

        // Re-read the (still-locked) rows so sufficiency sees the
        // post-release reservedQty.
        const balances = await this.stock.lockBalances(
          tx,
          accountId,
          existing.materialsStoreId,
          assortments,
        );
        this.stock.assertAvailable(
          false, // Processing never allows negative material stock
          materialReqs.map((m) => ({
            assortmentKind: 'product',
            assortmentId: m.productId,
            name: m.productName,
            requested: m.qtyDec.toString(),
          })),
          balances,
        );

        // Cost cascade — proper weighted-average from Stock.costBalanceMinor.
        //
        // For each material:
        //   per-unit-cost = stock.costBalanceMinor / stock.qty   (when qty > 0)
        //   consumedCost  = per-unit-cost × consumed-qty
        //
        // BigInt-safe via Decimal arithmetic. We don't trust BOM.standardCost
        // as the source of cost truth — actual material cost (from Supply /
        // InvoiceIn cost basis already in Stock) is what flows through.
        //
        // The output product receives:
        //   costDeltaMinor = SUM(consumedCost across materials)
        // This is the real FIFO-weighted output cost; on a subsequent sale,
        // Demand's cost cascade reads this same Stock.costBalanceMinor /
        // qty ratio and bills the correct margin.
        //
        // Snapshot of (materialId, qtyDec, costMinor) is persisted on the
        // Processing row so unpost/cancel can reverse with exact precision
        // regardless of subsequent BOM or Stock edits.
        const deltas: StockDelta[] = [];
        const snapshotItems: Array<{
          productId: string;
          qty: string;
          costMinor: string;
        }> = [];
        let totalCostMinor = 0n;

        for (const m of materialReqs) {
          const bal = balances.get(m.productId);
          const stockQtyDec = bal ? new Prisma.Decimal(bal.qty) : new Prisma.Decimal(0);
          const stockCostMinor = BigInt(bal?.costBalanceMinor ?? '0');

          // Proportional cost share. When stock has been seeded without a
          // cost basis (legacy data, manual Enter doc, ...), costBalanceMinor
          // is 0 and the consumed cost is 0 — the output ends up with
          // zero cost basis, which is honest about the missing data.
          let consumedCostMinor = 0n;
          if (stockQtyDec.greaterThan(0) && stockCostMinor !== 0n) {
            // Scale via Decimal to keep precision: (costMinor × qty / stockQty)
            const scaled = new Prisma.Decimal(stockCostMinor.toString())
              .mul(m.qtyDec)
              .div(stockQtyDec);
            // Round half-up to whole minor (tiyin)
            consumedCostMinor = BigInt(scaled.round().toFixed(0));
          }

          totalCostMinor += consumedCostMinor;
          snapshotItems.push({
            productId: m.productId,
            qty: m.qtyDec.toString(),
            costMinor: consumedCostMinor.toString(),
          });

          deltas.push({
            storeId: existing.materialsStoreId,
            assortmentKind: 'product',
            assortmentId: m.productId,
            qtyDelta: m.qtyDec.negated().toString(),
            costDeltaMinor: -consumedCostMinor,
            docType: 'processing_consume',
            docId: id,
            docPositionId: null,
            reason: 'post',
          });
        }

        // §89 — output products: explicit ProcessingProduct rows
        // (multi-output / by-products / co-products) else the single
        // BOM product (unchanged v1). Total consumed cost is split
        // across outputs by qty-proportion (largest-remainder,
        // Σ === totalCostMinor exactly; N=1 ⇒ all to it ⇒ byte-
        // identical to pre-§89).
        const explicitOutputs = existing.products ?? [];
        let outputs: Array<{ productId: string; qtyDec: Prisma.Decimal }>;
        if (explicitOutputs.length > 0) {
          outputs = explicitOutputs.map((p) => ({
            productId: p.productId,
            qtyDec: new Prisma.Decimal(p.qty.toString()),
          }));
        } else {
          // §90 — reached only when no explicit products; guards above
          // guarantee a BOM here (throw narrows `bom`, no assertion).
          if (!bom) throw new BadRequestException('Output mahsulot yoʻq');
          outputs = [{ productId: bom.productId, qtyDec: processingQtyDec }];
        }
        // §117 — fold the completed ProcessingStage's material markup +
        // labour into the OUTPUT cost (the value the operation adds).
        // materialMarkup comes from the linked stage; labour from this
        // op's own moysklad fields. No stage / all-zero ⇒ effective ===
        // totalCostMinor ⇒ byte-identical to the pre-§117 money-engine
        // (the existing suite proves zero regression). Materials-axis
        // deltas + snapshot are UNCHANGED (they record real consumed
        // material cost); the markup+labour is value created by the op,
        // absorbed into the produced stock — moysklad cost parity.
        // Defensive `?? default`: in production these fields are always
        // present (DB defaults), so this is a no-op there; it only makes
        // the helper robust to partial fixtures and GUARANTEES the
        // zero-regression invariant (no stage / missing ⇒ effective ===
        // totalCostMinor ⇒ byte-identical to the pre-§117 engine).
        const { effectiveCostMinor } = computeStageEffectiveCost({
          materialCostMinor: totalCostMinor,
          materialMarkupPercent: existing.processingStage?.materialMarkup ?? 0,
          enableHourAccounting: existing.enableHourAccounting ?? false,
          labourUnitCostMinor: existing.labourUnitCostMinor ?? 0n,
          standardHourCostMinor: existing.standardHourCostMinor ?? 0n,
          standardHourUnit: (existing.standardHourUnit ?? '0').toString(),
          productionVolume: processingQtyDec.toString(),
        });
        const outputCosts = distributeOutputCost(
          outputs.map((o) => o.qtyDec),
          effectiveCostMinor,
        );
        outputs.forEach((o, i) => {
          deltas.push({
            storeId: existing.productsStoreId,
            assortmentKind: 'product',
            assortmentId: o.productId,
            qtyDelta: o.qtyDec.toString(),
            costDeltaMinor: outputCosts[i] ?? 0n,
            docType: 'processing_produce',
            docId: id,
            docPositionId: null,
            reason: 'post',
          });
        });

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        // `outputs` is non-empty by construction (explicit products
        // length>0, or the single BOM output). Destructure + guard so
        // the compiler narrows it without a non-null assertion.
        const [primaryOutput] = outputs;
        if (!primaryOutput) throw new BadRequestException('Output yoʻq');
        const updated = await tx.processing.update({
          where: { id, accountId },
          data: {
            state: 'posted',
            applicable: true,
            postedAt: new Date(),
            // §117 — persisted cost is the OUTPUT (effective) cost so
            // the pre-§89 single-output reversal fallback (which uses
            // costSumMinor) stays exact with labour+markup included.
            costSumMinor: effectiveCostMinor,
            materialsSnapshot: {
              // Denormalised primary (back-compat: pre-§89 readers +
              // existing single-output tests) + canonical outputs[]
              // (§89 exact multi-output reversal).
              outputProductId: primaryOutput.productId,
              outputQty: primaryOutput.qtyDec.toString(),
              outputs: outputs.map((o, i) => ({
                productId: o.productId,
                qty: o.qtyDec.toString(),
                costMinor: (outputCosts[i] ?? 0n).toString(),
              })),
              items: snapshotItems,
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // Bump linked ProcessingOrder.movedSumMinor for fulfilment
        // tracking — §117: the moved value is the OUTPUT (effective)
        // cost, incl. labour+markup (a pure-labour op with 0 material
        // still moves value).
        if (existing.processingOrderId && effectiveCostMinor > 0n) {
          await tx.processingOrder.updateMany({
            where: { id: existing.processingOrderId, accountId },
            data: { movedSumMinor: { increment: effectiveCostMinor } },
          });
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Processing',
            entityId: id,
            action: 'transition:posted',
            fieldChanges: {
              from: { before: 'draft', after: 'posted' },
              // §117 — record the persisted (effective) output cost.
              costSumMinor: effectiveCostMinor.toString(),
              materials: snapshotItems.map((m) => ({
                productId: m.productId,
                qty: m.qty,
                costMinor: m.costMinor,
              })),
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15_000 },
    );
  }

  // =========================================================================
  // unpost — reverse all deltas (state → draft)
  // =========================================================================

  private async unpost(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProcessingService['findById']>>,
  ) {
    if (existing.state !== 'posted') {
      throw new BadRequestException(`Faqat 'posted' → 'draft' (hozir: ${existing.state})`);
    }
    return this.reverseAndUpdate(accountId, userId, id, existing, 'draft');
  }

  // =========================================================================
  // cancel — reverse if posted, then state=cancelled
  // =========================================================================

  private async cancel(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProcessingService['findById']>>,
  ) {
    if (existing.state === 'cancelled') {
      throw new BadRequestException('Hujjat oldin bekor qilingan');
    }
    if (existing.state === 'posted') {
      return this.reverseAndUpdate(accountId, userId, id, existing, 'cancelled');
    }
    // draft → cancelled (no stock to reverse). TOCTOU guard: claim WHERE
    // state='draft' so a concurrent post (draft→posted, which applies stock)
    // that already ran matches 0 rows → 409 — we never cancel a now-posted doc
    // without reversing its stock.
    const res = await this.prisma.client.processing.updateMany({
      where: { id, accountId, state: 'draft', deletedAt: null },
      data: { state: 'cancelled', applicable: false },
    });
    if (res.count === 0) {
      throw new ConflictException('Hujjat holati oʻzgargan — sahifani qayta yuklang');
    }
    await this.logAudit(accountId, userId, 'transition:cancelled', id, {
      from: existing.state,
      to: 'cancelled',
    });
    return this.prisma.client.processing.findFirstOrThrow({
      where: { id, accountId },
    });
  }

  /**
   * Shared reversal logic for both unpost and cancel-from-posted.
   *
   * Uses the materials snapshot persisted at post time, NOT the live BOM.
   * This guarantees exact-inverse reversal even when:
   *   - The BOM was retariffed (standardCostMinor changed)
   *   - BOM components were added/removed/reweighted
   *   - The materials store had other docs change its costBalanceMinor
   *
   * Falls back to live-BOM recomputation only for legacy rows posted
   * before the snapshot column existed (best-effort, qty-only reversal).
   */
  private async reverseAndUpdate(
    accountId: string,
    userId: string,
    id: string,
    existing: Awaited<ReturnType<ProcessingService['findById']>>,
    targetState: 'draft' | 'cancelled',
  ) {
    return this.prisma.client.$transaction(
      async (tx) => {
        // TOCTOU guard: atomically CLAIM posted→targetState as the first op so a
        // second concurrent unpost/cancel matches 0 rows → 409 and never double-
        // reverses stock. The snapshot read below is then purely for the
        // symmetric reversal payload (state is already claimed).
        const claim = await tx.processing.updateMany({
          where: { id, accountId, state: 'posted', applicable: true, deletedAt: null },
          data: { state: targetState },
        });
        if (claim.count === 0) {
          throw new ConflictException("Hujjat 'posted' holatida emas — sahifani qayta yuklang");
        }
        // Re-read the post-time snapshot for the symmetric reversal payload.
        const fresh = await tx.processing.findFirst({
          where: { id, accountId, deletedAt: null },
          select: {
            state: true,
            applicable: true,
            costSumMinor: true,
            materialsSnapshot: true,
            quantity: true,
            processingPlanId: true,
          },
        });
        if (!fresh) {
          throw new BadRequestException('Hujjat topilmadi — sahifani qayta yuklang');
        }

        const reversalCost = fresh.costSumMinor;
        const deltas: StockDelta[] = [];

        // Source of truth: the post-time snapshot. Each item records the
        // exact qty consumed and its cost contribution, so the reversal
        // is symmetric regardless of any subsequent BOM/Stock edits.
        const snapshot = fresh.materialsSnapshot as {
          outputProductId: string;
          outputQty: string;
          // §89 — canonical multi-output list (new rows). Absent on
          // pre-§89 rows ⇒ fall back to the single outputProductId.
          outputs?: Array<{ productId: string; qty: string; costMinor: string }>;
          items: Array<{ productId: string; qty: string; costMinor: string }>;
        } | null;

        if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
          // Snapshot-based exact reversal — materials (unchanged).
          for (const item of snapshot.items) {
            const costMinor = BigInt(item.costMinor);
            deltas.push({
              storeId: existing.materialsStoreId,
              assortmentKind: 'product',
              assortmentId: item.productId,
              qtyDelta: item.qty,
              costDeltaMinor: costMinor, // restore the exact cost that was deducted
              docType:
                targetState === 'draft' ? 'processing_unpost_restore' : 'processing_cancel_restore',
              docId: id,
              docPositionId: null,
              reason: targetState === 'draft' ? 'unpost' : 'cancel',
            });
          }
          // §89 — outputs: per-output exact reversal from the canonical
          // outputs[] (Σ costMinor === reversalCost). Pre-§89 rows have
          // no outputs[] ⇒ exact single reversal via outputProductId +
          // the persisted costSumMinor (unchanged legacy behaviour).
          const outDocType =
            targetState === 'draft' ? 'processing_unpost_out' : 'processing_cancel_out';
          const outReason = targetState === 'draft' ? 'unpost' : 'cancel';
          if (Array.isArray(snapshot.outputs) && snapshot.outputs.length > 0) {
            for (const o of snapshot.outputs) {
              deltas.push({
                storeId: existing.productsStoreId,
                assortmentKind: 'product',
                assortmentId: o.productId,
                qtyDelta: `-${o.qty}`,
                costDeltaMinor: -BigInt(o.costMinor),
                docType: outDocType,
                docId: id,
                docPositionId: null,
                reason: outReason,
              });
            }
          } else {
            deltas.push({
              storeId: existing.productsStoreId,
              assortmentKind: 'product',
              assortmentId: snapshot.outputProductId,
              qtyDelta: `-${snapshot.outputQty}`,
              costDeltaMinor: -reversalCost,
              docType: outDocType,
              docId: id,
              docPositionId: null,
              reason: outReason,
            });
          }
        } else {
          // Legacy fallback: re-derive from BOM × quantity. Qty-only —
          // cost reversal uses only the persisted costSumMinor (output
          // side). Material cost reversal is 0 in this branch because we
          // never recorded per-material costs for pre-snapshot rows.
          if (!fresh.processingPlanId) {
            throw new BadRequestException('Snapshot ham, BOM ham yoʻq — qaytarib boʻlmaydi');
          }
          const bom = await tx.billOfMaterials.findFirst({
            where: { id: fresh.processingPlanId, accountId },
            include: { components: true },
          });
          if (!bom) throw new BadRequestException('BOM topilmadi');
          if (bom.outputQty.lessThanOrEqualTo(0)) {
            throw new BadRequestException('BOM outputQty 0 dan katta boʻlishi shart');
          }
          const processingQtyDec = this.fromMicroqty(fresh.quantity);
          for (const c of bom.components) {
            const matQty = c.qty.mul(processingQtyDec).div(bom.outputQty);
            deltas.push({
              storeId: existing.materialsStoreId,
              assortmentKind: 'product',
              assortmentId: c.productId,
              qtyDelta: matQty.toString(),
              costDeltaMinor: null,
              docType:
                targetState === 'draft'
                  ? 'processing_unpost_restore_legacy'
                  : 'processing_cancel_restore_legacy',
              docId: id,
              docPositionId: null,
              reason: targetState === 'draft' ? 'unpost' : 'cancel',
            });
          }
          deltas.push({
            storeId: existing.productsStoreId,
            assortmentKind: 'product',
            assortmentId: bom.productId,
            qtyDelta: processingQtyDec.negated().toString(),
            costDeltaMinor: -reversalCost,
            docType:
              targetState === 'draft'
                ? 'processing_unpost_out_legacy'
                : 'processing_cancel_out_legacy',
            docId: id,
            docPositionId: null,
            reason: targetState === 'draft' ? 'unpost' : 'cancel',
          });
        }

        await this.stock.applyDeltas(tx, accountId, userId, deltas);

        const updated = await tx.processing.update({
          where: { id, accountId },
          data: {
            state: targetState,
            applicable: false,
            ...(targetState === 'draft'
              ? { postedAt: null, costSumMinor: 0n, materialsSnapshot: Prisma.JsonNull }
              : {}),
          },
        });

        // Decrement linked ProcessingOrder fulfilment counter
        if (existing.processingOrderId && reversalCost > 0n) {
          await tx.processingOrder.updateMany({
            where: { id: existing.processingOrderId, accountId },
            data: { movedSumMinor: { decrement: reversalCost } },
          });
        }

        await tx.auditLog.create({
          data: {
            accountId,
            userId,
            entity: 'Processing',
            entityId: id,
            action: `transition:${targetState === 'draft' ? 'unposted' : 'cancelled'}`,
            fieldChanges: {
              from: { before: 'posted', after: targetState },
              reversedCost: reversalCost.toString(),
              snapshotUsed: snapshot !== null,
            } as Prisma.InputJsonValue,
          },
        });

        return updated;
      },
      { isolationLevel: 'Serializable', timeout: 15_000 },
    );
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Decimal string (whole units) → ×1000 microqty BigInt. */
  private toMicroqty(decimalStr: string): bigint {
    // Avoid Number rounding for large values: parse via manual digit math.
    // The schema accepts up to 6 dp; we store ×1000 (3 dp resolution like other docs).
    const parts = decimalStr.split('.');
    const whole = parts[0] ?? '0';
    const fracRaw = parts[1] ?? '';
    const frac = `${fracRaw}000`.slice(0, 3); // pad to 3, truncate beyond
    return BigInt(whole) * 1_000n + BigInt(frac);
  }

  /** ×1000 microqty BigInt → Prisma.Decimal-compatible string. */
  private fromMicroqty(qty: bigint): Prisma.Decimal {
    // We want a Prisma.Decimal instance for arithmetic with BomComponent.qty etc.
    // Construct from divided string to keep precision: e.g. 10500n → "10.5"
    const sign = qty < 0n ? '-' : '';
    const abs = qty < 0n ? -qty : qty;
    const whole = abs / 1_000n;
    const frac = abs % 1_000n;
    const fracStr = frac.toString().padStart(3, '0').replace(/0+$/, '');
    const literal = fracStr.length > 0 ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
    return new Prisma.Decimal(literal);
  }

  private parseCreate(raw: unknown): CreateProcessingInput {
    // §90 — refined variant enforces "plan OR (materials & products)".
    const r = CreateProcessingSchemaChecked.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private parseUpdate(raw: unknown): UpdateProcessingInput {
    const r = UpdateProcessingSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }

  private async ensureRefs(
    accountId: string,
    organizationId: string,
    materialsStoreId: string,
    productsStoreId: string,
    // §90 — nullable: the BOM is optional when both explicit
    // materials[] and products[] are supplied (Zod refine guarantees a
    // valid source combo). Only validate the BOM when a plan is given.
    processingPlanId: string | null | undefined,
  ): Promise<void> {
    const [org, matStore, prodStore, bom] = await Promise.all([
      this.prisma.client.organization.findFirst({ where: { id: organizationId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: materialsStoreId, accountId } }),
      this.prisma.client.store.findFirst({ where: { id: productsStoreId, accountId } }),
      processingPlanId
        ? this.prisma.client.billOfMaterials.findFirst({
            where: { id: processingPlanId, accountId },
          })
        : Promise.resolve(null),
    ]);
    if (!org) throw new BadRequestException('Tashkilot topilmadi');
    if (!matStore) throw new BadRequestException('Materiallar ombori topilmadi');
    if (!prodStore) throw new BadRequestException('Output ombori topilmadi');
    if (processingPlanId && !bom) {
      throw new BadRequestException('BOM (processingPlanId) topilmadi');
    }
  }

  private async nextName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TP-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.processing.findFirst({
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
        entity: 'Processing',
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
        `Bu nom bilan hujjat allaqachon mavjud: ${err.meta?.target?.join(', ')}`,
      );
    }
    throw e as Error;
  }
}
