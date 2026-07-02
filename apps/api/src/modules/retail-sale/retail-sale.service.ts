import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { allocateDocumentNumber } from '../../prisma/document-number.js';
import { PrismaService } from '../../prisma/prisma.service.js';
// §109: loyalty accrual/reversal on POS sale/refund. Only loyalty's
// existing public API is called (computeEarnedPoints + createOperation);
// the loyalty module itself is NOT edited (DO NOT respected).
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { type MoneyDelta, MoneyService } from '../money/money.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
// Optimistic-lock (lost-update guard) for the draft field-edit update() path.
import { mapVersionedUpdateError } from '../shared/optimistic-lock.js';
import { type StockDelta, StockService } from '../stock/stock.service.js';
import { computePositions } from './compute-positions.js';
import { planLoyaltyAccrual, planLoyaltyReversal } from './retail-loyalty.js';
// Pure, adversarially-tested mixed-payment money rule (§107 — extracted
// faithfully from post(); byte-identical insufficient/change behaviour).
import { computeRetailPayment } from './retail-payment.js';
// Pure, adversarially-tested refund guards (§105 — enforces the
// schema's documented "subset of original positions" contract that
// refund() never checked: blocks over-refund of qty/products/cash).
import { validateRefundAmount, validateRefundPositions } from './retail-refund-validation.js';
import {
  CreateRetailSaleSchema,
  PostRetailSaleSchema,
  RefundRetailSaleSchema,
  RetailSaleFilterSchema,
  UpdateRetailSaleSchema,
} from './retail-sale.schema.js';

/**
 * RetailSaleService — POS receipt CRUD + FSM.
 *
 * FSM rules:
 *   draft → posted (via post())       — session must be open; payment >= sumMinor
 *   draft → cancelled (via cancel())  — no payment taken
 *   posted → refunded                 — creates a mirror RetailSale (negative)
 *
 * V1 deferred:
 *   - Stock cascades on post (TODO: deduct from session.storeId — same as WorkOrder V2 pattern)
 *   - MoneyOperation ledger writes on post (TODO: write CashDesk.balanceMinor delta inline once
 *     MoneyOperation schema is extended for 'retailsale' documentKind)
 *
 * V1 IMPLEMENTED:
 *   - CashDesk.balanceMinor incremented on post (cash portion only)
 *   - CashDesk.balanceMinor decremented on refund (cash portion)
 *   - Session aggregates (salesCount, salesSumMinor, returnsCount, returnsSumMinor) updated on post
 */
@Injectable()
export class RetailSaleService {
  private readonly logger = new Logger(RetailSaleService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StockService) private readonly stock: StockService,
    @Inject(MoneyService) private readonly money: MoneyService,
    @Inject(LoyaltyService) private readonly loyalty: LoyaltyService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  /**
   * §109 — accrue loyalty points for a posted sale. A SIDE-LEDGER:
   * runs AFTER the sale txn commits (a loyalty hiccup must not void a
   * sale the cashier already took money for). Skips anonymous sales /
   * no active program / 0 points (planLoyaltyAccrual). Idempotent —
   * never double-accrues for the same sale. Failures are LOGGED (never
   * silently swallowed — CLAUDE.md) but not rethrown (sale is valid;
   * points are reconcilable).
   */
  private async accrueLoyalty(
    accountId: string,
    userId: string,
    sale: { id: string; agentId: string | null; sumMinor: bigint },
  ): Promise<void> {
    try {
      if (!sale.agentId) return;
      const existing = await this.prisma.client.bonusOperation.findFirst({
        where: {
          accountId,
          parentEntity: 'retailsale',
          parentId: sale.id,
          transactionType: 'EARNING',
        },
        select: { id: true },
      });
      if (existing) return; // idempotent — already accrued
      const program = await this.prisma.client.bonusProgram.findFirst({
        where: { accountId, active: true, archived: false },
        orderBy: { createdAt: 'asc' },
        select: { id: true, earnRateRulesJson: true },
      });
      const plan = planLoyaltyAccrual(
        { agentId: sale.agentId, program, saleSumMinor: sale.sumMinor },
        (p, amt) => this.loyalty.computeEarnedPoints(p, amt),
      );
      if (!plan) return;
      await this.loyalty.createOperation(accountId, userId, {
        agentId: plan.agentId,
        bonusProgramId: plan.bonusProgramId,
        transactionType: 'EARNING',
        categoryType: 'REGULAR',
        bonusValue: plan.points,
        parentEntity: 'retailsale',
        parentId: sale.id,
      });
    } catch (e) {
      this.logger.error(
        `Loyalty accrual failed for retailsale ${sale.id} (sale stands; points reconcilable): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /**
   * §109 — claw back the points earned by the original sale when it is
   * refunded. Reverses the EXACT recorded earned value (never recomputes
   * — a program-rule change must not alter the clawback; §105). SPENDING
   * / categoryType RETURN, linked to the refund. Same side-ledger,
   * logged-not-rethrown discipline as accrual.
   */
  private async reverseLoyalty(
    accountId: string,
    userId: string,
    originalSaleId: string,
    refundSaleId: string,
  ): Promise<void> {
    try {
      const earned = await this.prisma.client.bonusOperation.findFirst({
        where: {
          accountId,
          parentEntity: 'retailsale',
          parentId: originalSaleId,
          transactionType: 'EARNING',
        },
        select: { agentId: true, bonusProgramId: true, bonusValue: true },
      });
      const plan = planLoyaltyReversal(earned);
      if (!plan || !earned) return;
      const alreadyReversed = await this.prisma.client.bonusOperation.findFirst({
        where: {
          accountId,
          parentEntity: 'retailsale',
          parentId: refundSaleId,
          transactionType: 'SPENDING',
        },
        select: { id: true },
      });
      if (alreadyReversed) return; // idempotent
      await this.loyalty.createOperation(accountId, userId, {
        agentId: earned.agentId,
        bonusProgramId: earned.bonusProgramId ?? undefined,
        transactionType: 'SPENDING',
        categoryType: 'RETURN',
        bonusValue: -plan.points,
        parentEntity: 'retailsale',
        parentId: refundSaleId,
      });
    } catch (e) {
      this.logger.error(
        `Loyalty reversal failed for refund ${refundSaleId} of sale ${originalSaleId} (refund stands): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  async list(accountId: string, rawFilter: unknown) {
    const filter = RetailSaleFilterSchema.parse(rawFilter);

    // assigneeId filter: find sales that have a picking RestockTask assigned to this employee.
    let assigneeIdFilter: Prisma.RetailSaleWhereInput = {};
    if (filter.assigneeId) {
      const tasks = await this.prisma.client.restockTask.findMany({
        where: {
          accountId,
          type: 'picking',
          assigneeId: filter.assigneeId,
          status: { not: 'done' },
        },
        select: { sourceId: true },
      });
      assigneeIdFilter = { id: { in: tasks.map((t) => t.sourceId) } };
    }

    const where: Prisma.RetailSaleWhereInput = {
      accountId,
      ...assigneeIdFilter,
      ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            moment: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { agent: { name: { contains: filter.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.client.retailSale.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        session: {
          select: {
            id: true,
            state: true,
            cashDesk: { select: { id: true, name: true, currency: true } },
            cashier: { select: { id: true, name: true } },
          },
        },
        agent: { select: { id: true, name: true } },
        _count: { select: { positions: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.retailSale.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      include: {
        session: {
          include: {
            cashDesk: { select: { id: true, name: true, currency: true } },
            cashier: { select: { id: true, name: true } },
            store: { select: { id: true, name: true } },
            organization: { select: { id: true, name: true, legalTitle: true } },
          },
        },
        agent: { select: { id: true, name: true, legalTitle: true } },
        refundedFrom: { select: { id: true, name: true } },
        positions: {
          include: {
            product: { select: { id: true, name: true, code: true, uom: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    return sale;
  }

  async create(accountId: string, raw: unknown) {
    const parsed = CreateRetailSaleSchema.parse(raw);

    // Validate session is open
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: parsed.sessionId, accountId },
    });
    if (!session) throw new NotFoundException(`CashierSession ${parsed.sessionId} not found`);
    if (session.state !== 'open') {
      throw new BadRequestException(`Session is ${session.state}. Cannot create sale.`);
    }

    // H4 record-scope: the cashier who opened the shift is the sale's creator.
    const creatorGroupId = await resolveCreatorGroupId(
      this.prisma.client,
      accountId,
      session.cashierId,
    );

    const name = await this.nextRetailSaleName(accountId);
    const positions = this.computePositions(parsed.positions);

    try {
      const created = await this.prisma.client.retailSale.create({
        data: {
          accountId,
          ownerId: session.cashierId,
          groupId: creatorGroupId,
          sessionId: parsed.sessionId,
          name,
          agentId: parsed.agentId ?? null,
          moment: parsed.moment ? new Date(parsed.moment) : new Date(),
          description: parsed.description ?? null,
          externalCode: parsed.externalCode ?? null,
          state: 'draft',
          sumMinor: positions.totalMinor,
          positions: {
            create: positions.rows.map((p, idx) => ({
              accountId,
              productId: p.productId,
              position: idx + 1,
              quantity: p.quantity,
              priceMinor: p.priceMinor,
              discount: p.discount,
              sumMinor: p.lineMinor,
            })),
          },
        },
        include: {
          positions: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
            orderBy: { position: 'asc' },
          },
        },
      });
      return created;
    } catch (e) {
      this.handlePrisma(e);
    }
  }

  async update(accountId: string, id: string, raw: unknown) {
    const parsed = UpdateRetailSaleSchema.parse(raw);

    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (sale.state !== 'draft') {
      throw new BadRequestException('Only draft sales can be edited');
    }

    const positions = parsed.positions ? this.computePositions(parsed.positions) : null;

    try {
      // Class A (optimistic-lock): the destructive position deleteMany + the
      // version-guarded header write run in ONE transaction. This fixes two
      // defects at once:
      //   (1) lost-update — a second user editing the same draft used to
      //       last-write-win, silently clobbering the first edit. The
      //       `version` filter now 409s the stale copy (OptimisticLockException).
      //   (2) data corruption — the position deleteMany + re-create used to
      //       run OUTSIDE any transaction, so a failure (or now a 409) after
      //       the delete but before the re-create left the receipt with ZERO
      //       positions. Folding both into the same tx makes the rewrite atomic
      //       with the version check: a stale-version miss (P2025) rolls the
      //       deleteMany back, so the positions are never lost.
      // sumMinor is computed up-front from the new positions, so there is no
      // second totals-only update (the supply two-step) — a single versioned
      // header update carries header fields + sumMinor + the nested re-create.
      return await this.prisma.client.$transaction(async (tx) => {
        if (positions) {
          await tx.retailSalePosition.deleteMany({
            where: { retailSaleId: id, accountId },
          });
        }
        return tx.retailSale.update({
          where: { id, accountId, version: parsed.version },
          data: {
            ...(parsed.agentId !== undefined ? { agentId: parsed.agentId ?? null } : {}),
            ...(parsed.description !== undefined
              ? { description: parsed.description ?? null }
              : {}),
            ...(parsed.externalCode !== undefined
              ? { externalCode: parsed.externalCode ?? null }
              : {}),
            ...(positions
              ? {
                  sumMinor: positions.totalMinor,
                  positions: {
                    create: positions.rows.map((p, idx) => ({
                      accountId,
                      productId: p.productId,
                      position: idx + 1,
                      quantity: p.quantity,
                      priceMinor: p.priceMinor,
                      discount: p.discount,
                      sumMinor: p.lineMinor,
                    })),
                  },
                }
              : {}),
            version: { increment: 1 },
          },
          include: {
            positions: {
              include: {
                product: { select: { id: true, name: true, code: true } },
              },
              orderBy: { position: 'asc' },
            },
          },
        });
      });
    } catch (e) {
      // A P2025 after the findById existence check above means the version
      // filter missed — a concurrent write bumped the row — so map it to 409
      // (OPTIMISTIC_LOCK) FIRST, before any other Prisma handling (a generic
      // handler would otherwise surface it as a 404/500).
      mapVersionedUpdateError(e, 'RetailSale');
      this.handlePrisma(e);
    }
  }

  async sendToPicking(accountId: string, id: string, userId: string, userName: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      select: { id: true, state: true },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (sale.state !== 'draft') {
      throw new BadRequestException(
        `Only draft sales can be sent to picking (current: ${sale.state})`,
      );
    }
    const result = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: 'draft' },
      data: { state: 'picking' },
    });
    if (result.count === 0) {
      throw new ConflictException('Sale state changed; send-to-picking aborted');
    }
    // Create per-sklad picking tasks for each configured warehouse keeper.
    // Best-effort: a failure here must not roll back the state change.
    this.createPickingTasksForSale(accountId, id, userId, userName).catch((e) => {
      this.logger.error(
        `createPickingTasksForSale failed for retailsale ${id}: ${e instanceof Error ? e.message : e}`,
      );
    });
    return this.prisma.client.retailSale.findUniqueOrThrow({
      where: { id },
      include: {
        positions: {
          include: { product: { select: { id: true, name: true, code: true } } },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  /**
   * After a sale is sent to picking, group its positions by product.locSklad
   * and create one RestockTask (type='picking') per sklad that has a configured
   * keeper. Each keeper receives a bell notification. Products with no locSklad
   * are skipped (no bin → no keeper to assign). Best-effort callers swallow errors.
   */
  private async createPickingTasksForSale(
    accountId: string,
    saleId: string,
    userId: string,
    userName: string,
  ): Promise<void> {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id: saleId, accountId },
      select: {
        name: true,
        storeId: true,
        store: { select: { name: true } },
        positions: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                locSklad: true,
                locPolka: true,
                locQavat: true,
                locYacheyka: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!sale || sale.positions.length === 0) {
      this.logger.warn(`createPickingTasks[${saleId}]: sale not found or no positions`);
      return;
    }

    const keepers = await this.prisma.client.skladKeeper.findMany({ where: { accountId } });
    if (keepers.length === 0) {
      this.logger.warn(`createPickingTasks[${saleId}]: no skladKeeper mappings found`);
      return;
    }
    const keeperBySklad = new Map(keepers.map((k) => [k.skladNo, k]));

    // Group positions by locSklad. Products with no locSklad fall into a
    // special NULL_SKLAD=-1 bucket that gets assigned to the first keeper.
    const NULL_SKLAD = -1;
    type Pos = (typeof sale.positions)[number];
    const groups = new Map<number, Pos[]>();
    for (const pos of sale.positions) {
      const sklad = pos.product?.locSklad ?? NULL_SKLAD;
      if (sklad === NULL_SKLAD) {
        this.logger.warn(
          `createPickingTasks[${saleId}]: product ${pos.productId} has no locSklad — fallback bucket`,
        );
      }
      const bucket = groups.get(sklad);
      if (bucket) bucket.push(pos);
      else groups.set(sklad, [pos]);
    }
    this.logger.log(
      `createPickingTasks[${saleId}]: grouped into sklads: ${[...groups.keys()].join(', ')}, keepers: ${[...keeperBySklad.keys()].join(', ')}`,
    );

    const storeId = sale.storeId ?? null;
    const storeName = sale.store?.name ?? null;
    // Fallback keeper for products with no locSklad: first configured keeper.
    const fallbackKeeper = keepers[0];

    const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
    const formatBin = (s: number | null, p: number | null, q: number | null, y: number | null) => {
      if (s == null && p == null && q == null && y == null) return '';
      return [s, p, q, y].map(pad).join('-');
    };

    for (const [skladNo, entries] of groups) {
      const keeper = skladNo === NULL_SKLAD ? fallbackKeeper : keeperBySklad.get(skladNo);
      if (!keeper) continue;

      const task = await this.prisma.client.restockTask.create({
        data: {
          accountId,
          type: 'picking',
          skladNo,
          sourceType: 'retailsale',
          sourceId: saleId,
          sourceName: sale.name,
          storeId,
          storeName,
          assigneeId: keeper.employeeId,
          assigneeName: keeper.employeeName,
          createdById: userId,
          createdByName: userName,
          status: 'pending',
          lines: {
            create: entries.map((pos, i) => {
              const p = pos.product;
              const bin = p ? formatBin(p.locSklad, p.locPolka, p.locQavat, p.locYacheyka) : '';
              return {
                accountId,
                productId: pos.productId ?? null,
                productName: p?.name ?? '—',
                quantity: pos.quantity,
                binLocation: bin || null,
                position: i,
              };
            }),
          },
        },
      });

      await this.notifications
        .emit(
          accountId,
          keeper.employeeId,
          'picking_assigned',
          "Yig'ish vazifasi",
          `${entries.length} ta mahsulot${sale.name ? ` — ${sale.name}` : ''}`,
          'RestockTask',
          task.id,
        )
        .catch(() => {});
    }
  }

  async markReady(accountId: string, id: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      select: { id: true, state: true },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (sale.state !== 'picking') {
      throw new BadRequestException(
        `Only picking sales can be marked ready (current: ${sale.state})`,
      );
    }
    const result = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: 'picking' },
      data: { state: 'ready' },
    });
    if (result.count === 0) {
      throw new ConflictException('Sale state changed; mark-ready aborted');
    }
    // Mark all picking RestockTasks for this sale as done.
    await this.prisma.client.restockTask.updateMany({
      where: {
        accountId,
        sourceId: id,
        sourceType: 'retailsale',
        type: 'picking',
        status: { not: 'done' },
      },
      data: { status: 'done' },
    });
    return this.prisma.client.retailSale.findUniqueOrThrow({ where: { id } });
  }

  async post(accountId: string, userId: string, id: string, raw: unknown) {
    const parsed = PostRetailSaleSchema.parse(raw);

    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      include: {
        session: {
          select: {
            id: true,
            state: true,
            cashDeskId: true,
            storeId: true,
            salesCount: true,
            salesSumMinor: true,
            store: { select: { allowNegativeStock: true } },
            cashDesk: { select: { currency: true } },
          },
        },
        positions: {
          select: { id: true, productId: true, quantity: true },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (sale.state !== 'draft' && sale.state !== 'ready') {
      throw new BadRequestException(
        `Only draft or ready sales can be posted (current: ${sale.state})`,
      );
    }
    if (sale.session.state !== 'open') {
      throw new BadRequestException(`Session is ${sale.session.state}. Cannot post sale.`);
    }

    const cashAmount = BigInt(parsed.cashAmountMinor);
    const cardAmount = BigInt(parsed.cardAmountMinor);
    const terminalAmount = BigInt(parsed.terminalAmountMinor);
    const debtAmount = BigInt(parsed.debtAmountMinor ?? '0');
    const total = sale.sumMinor;

    // Debt is only allowed when an agent (counterparty) is identified.
    if (debtAmount > 0n && !parsed.agentId && !sale.agentId) {
      throw new BadRequestException('Qarzga sotish uchun mijoz tanlanishi shart');
    }

    const pay = computeRetailPayment({
      cashMinor: cashAmount,
      cardMinor: cardAmount,
      terminalMinor: terminalAmount + debtAmount,
      totalMinor: total,
    });
    if (!pay.ok) {
      if (pay.reason === 'insufficient') {
        throw new BadRequestException(
          `Payment insufficient: paid ${pay.paidMinor.toString()} < total ${pay.totalMinor.toString()}`,
        );
      }
      throw new BadRequestException('Payment amounts must be non-negative');
    }

    const change = pay.changeMinor;

    // Stock cascade: rows with a productId trigger an outflow against
    // session.storeId. Service-only positions (productId === null) are
    // intentionally skipped — services don't carry stock.
    const stockPositions = sale.positions.filter(
      (p): p is typeof p & { productId: string } => p.productId !== null,
    );
    const storeId = sale.session.storeId;
    const allowNegative = sale.session.store?.allowNegativeStock ?? false;

    const posted = await this.prisma.client.$transaction(async (tx) => {
      // Atomic state guard: 'draft' or 'ready' → 'posted'. updateMany
      // returns count=0 when the row state has already moved (concurrent post).
      const effectiveAgentId = parsed.agentId ?? sale.agentId;

      const flipResult = await tx.retailSale.updateMany({
        where: { id, accountId, state: { in: ['draft', 'ready'] } },
        data: {
          state: 'posted',
          postedAt: new Date(),
          cashAmountMinor: cashAmount,
          cardAmountMinor: cardAmount,
          terminalAmountMinor: terminalAmount,
          advancePaymentSumMinor: debtAmount,
          changeMinor: change,
          ...(parsed.agentId !== undefined ? { agentId: parsed.agentId ?? null } : {}),
        },
      });
      if (flipResult.count === 0) {
        throw new ConflictException(
          `RetailSale ${id} state changed; post aborted (already posted?)`,
        );
      }

      // Stock cascade — same lock-then-assert-then-apply pattern as DemandService.post.
      if (stockPositions.length > 0 && storeId) {
        const assortments = stockPositions.map((p) => ({
          kind: 'product' as const,
          id: p.productId,
        }));
        const balances = await this.stock.lockBalances(tx, accountId, storeId, assortments);
        this.stock.assertAvailable(
          allowNegative,
          stockPositions.map((p) => ({
            assortmentKind: 'product',
            assortmentId: p.productId,
            requested: String(p.quantity),
          })),
          balances,
        );
        const deltas: StockDelta[] = stockPositions.map((p) => ({
          storeId,
          assortmentKind: 'product',
          assortmentId: p.productId,
          qtyDelta: `-${String(p.quantity)}`,
          costDeltaMinor: null,
          docType: 'retailsale',
          docId: id,
          docPositionId: p.id,
          reason: 'post',
        }));
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      }

      // Cash inflow: route through MoneyService so the ledger captures
      // both the materialized balance update and a MoneyOperation row
      // (audit trail) — atomic with the FSM flip and stock cascade.
      // Card portion is intentionally NOT booked yet — V2 requires a
      // BankAccount routing decision (which account to credit per
      // POS terminal). For now card lives only in RetailSale.cardAmountMinor.
      if (cashAmount > 0n && sale.session.cashDeskId && sale.session.cashDesk) {
        const moneyDeltas: MoneyDelta[] = [
          {
            sourceKind: 'cash_desk',
            sourceId: sale.session.cashDeskId,
            deltaMinor: cashAmount,
            currency: sale.session.cashDesk.currency,
            documentKind: 'retailsale',
            documentId: id,
            description: `POS sale ${sale.name}`,
          },
        ];
        await this.money.applyDeltas(tx, accountId, moneyDeltas);
      }

      // Debt: upsert CounterpartyBalance — positive = counterparty owes us.
      if (debtAmount > 0n && effectiveAgentId) {
        await tx.counterpartyBalance.upsert({
          where: { counterpartyId_currency: { counterpartyId: effectiveAgentId, currency: 'UZS' } },
          create: {
            accountId,
            counterpartyId: effectiveAgentId,
            currency: 'UZS',
            balanceMinor: debtAmount,
          },
          update: { balanceMinor: { increment: debtAmount } },
        });
      }

      // Update session aggregates
      await tx.cashierSession.update({
        where: { id: sale.sessionId },
        data: {
          salesCount: { increment: 1 },
          salesSumMinor: { increment: total },
        },
      });

      return tx.retailSale.findUniqueOrThrow({ where: { id, accountId } });
    });

    // §109: accrue loyalty points AFTER the sale txn commits.
    await this.accrueLoyalty(accountId, userId, {
      id: posted.id,
      agentId: posted.agentId ?? null,
      sumMinor: posted.sumMinor,
    });
    return posted;
  }

  async cancel(accountId: string, id: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      select: { id: true, state: true },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (!['draft', 'picking', 'ready'].includes(sale.state)) {
      throw new BadRequestException(
        `Only draft/picking/ready sales can be cancelled (current: ${sale.state})`,
      );
    }

    // Atomic state guard: 'draft'/'picking'/'ready' → 'cancelled'.
    const flipResult = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: { in: ['draft', 'picking', 'ready'] } },
      data: { state: 'cancelled' },
    });
    if (flipResult.count === 0) {
      throw new ConflictException(
        `RetailSale ${id} state changed; cancel aborted (already posted?)`,
      );
    }
    return this.prisma.client.retailSale.findUniqueOrThrow({ where: { id, accountId } });
  }

  async refund(accountId: string, userId: string, originalSaleId: string, raw: unknown) {
    const parsed = RefundRetailSaleSchema.parse(raw);

    const original = await this.prisma.client.retailSale.findFirst({
      where: { id: originalSaleId, accountId },
      include: {
        session: {
          select: {
            id: true,
            state: true,
            cashDeskId: true,
            storeId: true,
            cashDesk: { select: { currency: true } },
          },
        },
        // §105: needed to enforce the documented "subset of original
        // positions" contract (over-refund guard).
        positions: { select: { productId: true, quantity: true } },
      },
    });
    if (!original) throw new NotFoundException(`RetailSale ${originalSaleId} not found`);
    if (original.state !== 'posted') {
      throw new BadRequestException(`Can only refund a posted sale (current: ${original.state})`);
    }
    if (original.session.state !== 'open') {
      throw new BadRequestException(`Session is ${original.session.state}. Cannot refund.`);
    }

    // §105 over-refund guard: refunded products/qty must be a subset of
    // the original sale (the schema documents this; refund() never
    // enforced it → wrong stock inflow + over-refunded cash).
    const posError = validateRefundPositions(
      original.positions.map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
      })),
      parsed.positions.map((p) => ({ productId: p.productId, quantity: p.quantity })),
    );
    if (posError) throw new BadRequestException(posError);

    const refundPositions = this.computePositions(
      parsed.positions.map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
        priceMinor: p.priceMinor,
        discount: p.discount,
      })),
    );

    const cashReturn = BigInt(parsed.cashAmountMinor);
    const cardReturn = BigInt(parsed.cardAmountMinor);

    // §105: cannot pay back more money than the refunded goods are
    // worth (computed from the now-validated positions).
    const amtError = validateRefundAmount(refundPositions.totalMinor, cashReturn, cardReturn);
    if (amtError) throw new BadRequestException(amtError);

    const name = await this.nextRetailSaleName(accountId);

    // H4 record-scope: the refund document is created by the acting user.
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    const refunded = await this.prisma.client.$transaction(async (tx) => {
      // Atomic state guard: only flip 'posted' → 'refunded'. updateMany returns
      // count=0 if another refund already fired between our pre-read and now,
      // which prevents double-refund (mirror sale + cash decrement applied twice).
      const flipResult = await tx.retailSale.updateMany({
        where: { id: original.id, accountId, state: 'posted' },
        data: { state: 'refunded' },
      });
      if (flipResult.count === 0) {
        throw new ConflictException(
          `RetailSale ${original.id} state changed; refund aborted (already refunded?)`,
        );
      }

      const refundSale = await tx.retailSale.create({
        data: {
          accountId,
          ownerId: userId,
          groupId: creatorGroupId,
          sessionId: original.sessionId,
          name,
          agentId: original.agentId ?? null,
          moment: new Date(),
          description: parsed.description ?? `Refund for ${original.name}`,
          state: 'posted',
          postedAt: new Date(),
          sumMinor: refundPositions.totalMinor,
          cashAmountMinor: cashReturn,
          cardAmountMinor: cardReturn,
          refundedFromId: original.id,
          positions: {
            create: refundPositions.rows.map((p, idx) => ({
              accountId,
              productId: p.productId,
              position: idx + 1,
              quantity: p.quantity,
              priceMinor: p.priceMinor,
              discount: p.discount,
              sumMinor: p.lineMinor,
            })),
          },
        },
      });

      // Stock cascade — restore quantities back to session.storeId. Only
      // rows with productId trigger inflow; service-only positions are
      // skipped consistent with post().
      const refundStockRows = refundPositions.rows.filter(
        (p): p is typeof p & { productId: string } => Boolean(p.productId),
      );
      // Stock only cascades when the session is bound to a store — mirrors
      // post(), which skips the stock leg for store-less sessions.
      const refundStoreId = original.session.storeId;
      if (refundStockRows.length > 0 && refundStoreId) {
        // Re-fetch the refund sale's positions to learn their freshly-assigned
        // ids (needed for StockOperation.docPositionId provenance).
        const persistedPositions = await tx.retailSalePosition.findMany({
          where: { retailSaleId: refundSale.id, accountId },
          select: { id: true, productId: true, quantity: true, position: true },
          orderBy: { position: 'asc' },
        });
        const deltas: StockDelta[] = persistedPositions
          .filter((p): p is typeof p & { productId: string } => p.productId !== null)
          .map((p) => ({
            storeId: refundStoreId,
            assortmentKind: 'product',
            assortmentId: p.productId,
            qtyDelta: String(p.quantity), // positive — inflow back to stock
            costDeltaMinor: null,
            docType: 'retailsale',
            docId: refundSale.id,
            docPositionId: p.id,
            // 'unpost' = reversing a prior outflow. The ledger reason enum is
            // intentionally narrow; we reuse the same vocabulary other modules
            // (Demand/Supply) use for cancel/refund flows.
            reason: 'unpost',
          }));
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      }

      // Cash outflow: route through MoneyService for the ledger entry
      // (negative deltaMinor) + balance update with overdraft guard.
      if (cashReturn > 0n) {
        if (!original.session.cashDeskId || !original.session.cashDesk) {
          throw new BadRequestException('Session has no cash desk — cannot process a cash refund.');
        }
        const refundDeltas: MoneyDelta[] = [
          {
            sourceKind: 'cash_desk',
            sourceId: original.session.cashDeskId,
            deltaMinor: -cashReturn,
            currency: original.session.cashDesk.currency,
            documentKind: 'retailsale',
            documentId: refundSale.id,
            description: `POS refund for ${original.name}`,
          },
        ];
        await this.money.applyDeltas(tx, accountId, refundDeltas);
      }

      // Update session aggregates
      await tx.cashierSession.update({
        where: { id: original.sessionId },
        data: {
          returnsCount: { increment: 1 },
          returnsSumMinor: { increment: refundPositions.totalMinor },
        },
      });

      return refundSale;
    });

    // §109: claw back the original sale's earned points AFTER the
    // refund txn commits. Reverses the EXACT recorded value (§105).
    await this.reverseLoyalty(accountId, userId, original.id, refunded.id);
    return refunded;
  }

  async zReport(accountId: string, sessionId: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
      include: {
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);

    const [salesAgg, returnsAgg] = await Promise.all([
      this.prisma.client.retailSale.aggregate({
        where: {
          accountId,
          sessionId,
          state: 'posted',
          refundedFromId: null,
        },
        _sum: {
          sumMinor: true,
          cashAmountMinor: true,
          cardAmountMinor: true,
          terminalAmountMinor: true,
        },
        _count: { id: true },
      }),
      this.prisma.client.retailSale.aggregate({
        where: {
          accountId,
          sessionId,
          state: 'posted',
          refundedFromId: { not: null },
        },
        _sum: {
          sumMinor: true,
          cashAmountMinor: true,
          cardAmountMinor: true,
          terminalAmountMinor: true,
        },
        _count: { id: true },
      }),
    ]);

    return {
      session: {
        id: session.id,
        state: session.state,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        cashier: session.cashier,
        cashDesk: session.cashDesk,
        store: session.store,
        organization: session.organization,
        openingCashMinor: session.openingCashMinor.toString(),
        closingCashMinor: session.closingCashMinor?.toString() ?? null,
        expectedCashMinor: session.expectedCashMinor?.toString() ?? null,
        discrepancyMinor: session.discrepancyMinor?.toString() ?? null,
      },
      salesCount: salesAgg._count.id,
      salesSumMinor: (salesAgg._sum.sumMinor ?? 0n).toString(),
      cashSalesMinor: (salesAgg._sum.cashAmountMinor ?? 0n).toString(),
      cardSalesMinor: (salesAgg._sum.cardAmountMinor ?? 0n).toString(),
      terminalSalesMinor: (salesAgg._sum.terminalAmountMinor ?? 0n).toString(),
      returnsCount: returnsAgg._count.id,
      returnsSumMinor: (returnsAgg._sum.sumMinor ?? 0n).toString(),
      cashReturnsMinor: (returnsAgg._sum.cashAmountMinor ?? 0n).toString(),
      cardReturnsMinor: (returnsAgg._sum.cardAmountMinor ?? 0n).toString(),
      terminalReturnsMinor: (returnsAgg._sum.terminalAmountMinor ?? 0n).toString(),
      netSumMinor: ((salesAgg._sum.sumMinor ?? 0n) - (returnsAgg._sum.sumMinor ?? 0n)).toString(),
    };
  }

  // ---- Private helpers ----

  // Pure compute-positions logic lives in `./compute-positions.ts` so the
  // BigInt-precision invariants are unit-testable without mocking Prisma.
  private computePositions = computePositions;

  private async nextRetailSaleName(accountId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ТРН-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailSale.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  private handlePrisma(e: unknown): never {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code: string }).code === 'P2002'
    ) {
      throw new ConflictException('Duplicate name or unique constraint violation');
    }
    throw e;
  }
}
