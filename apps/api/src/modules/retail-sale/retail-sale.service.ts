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
// F2: «Отправил кладовщику» — in-app 🔔 + SSE push to the warehouse keeper.
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
// Yagona FSM o'tish jadvali — oldindan tekshiruv va tranzaksiya ichidagi CAS
// qo'riqchisi bir manbadan oziqlanadi (ajralib qolsa qo'riqchi tor/keng bo'ladi).
import { allowedFrom, canTransition, transitionRejection } from './retail-sale-fsm.js';
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
 * FSM rules (yagona jadval: `./retail-sale-fsm.ts`):
 *   draft → picking → ready           — omborchi zanjiri (send-to-picking / mark-ready)
 *   draft | ready → posted (post())   — session must be open; payment >= sumMinor
 *   draft | picking | ready → cancelled (cancel()) — no payment taken
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

/**
 * Tovarning «uy» yacheykasi — climart tizimidan («01-02-03-05» satri).
 * Sherset'da bu 4 ta ustun edi (`locSklad/locPolka/...`); egasining qaroriga
 * ko'ra (2026-08-01) ular qaytarilmadi — bitta manzil tizimi qoladi.
 */
function cellOf(attrs: unknown): string {
  if (attrs && typeof attrs === 'object' && '__yacheyka' in attrs) {
    const v = (attrs as Record<string, unknown>).__yacheyka;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/** «01-02-03-05» → 1 (ombor raqami); kod yo'q/noraqamli bo'lsa null. */
function skladNoOf(cell: string): number | null {
  const first = cell.split('-')[0];
  const n = Number(first);
  return first !== '' && Number.isInteger(n) ? n : null;
}

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
   * F2 (user feature 2026-07-03) — «Отправил кладовщику» on a REFUND receipt.
   *
   * Guards: the receipt must be a refund mirror (refundedFromId set) and not
   * already sent (idempotent — the flag lives in attributes.__sentToWarehouse,
   * no schema migration). Recipients: the store's «Владелец-сотрудник» when
   * assigned; otherwise every other active employee of the account (the
   * cashier who pressed the button is never notified about their own send).
   * Notification fan-out is best-effort (NotificationService.emit swallows
   * failures) — the flag write is the source of truth.
   */
  async sendToWarehouse(accountId: string, userId: string, id: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      include: {
        session: { include: { store: { select: { id: true, name: true, ownerId: true } } } },
        positions: { select: { quantity: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (!sale.refundedFromId) {
      throw new BadRequestException(
        'Bu chek vozvrat emas — omborga yuborish faqat vozvrat chekida',
      );
    }
    const attrs = (sale.attributes ?? {}) as Record<string, unknown>;
    if (attrs.__sentToWarehouse) {
      throw new BadRequestException('Bu vozvrat allaqachon omborchiga yuborilgan');
    }

    // Flag FIRST (source of truth), then fan out the notifications.
    const sentToWarehouse = { at: new Date().toISOString(), by: userId };
    await this.prisma.client.retailSale.update({
      where: { id, accountId },
      data: { attributes: { ...attrs, __sentToWarehouse: sentToWarehouse } },
    });

    // Recipients: store keeper (Владелец-сотрудник) → fallback every other
    // active employee. Never the sender themselves.
    const store = sale.session.store;
    let recipientIds: string[] = [];
    if (store?.ownerId && store.ownerId !== userId) {
      recipientIds = [store.ownerId];
    } else {
      const employees = await this.prisma.client.employee.findMany({
        where: { accountId, archived: false, NOT: { id: userId } },
        select: { id: true },
      });
      recipientIds = employees.map((e) => e.id);
    }

    const itemCount = sale.positions.length;
    const title = `Возврат ${sale.name} — примите товар на склад`;
    const body = `${store?.name ?? 'Склад'} · позиций: ${itemCount}`;
    await Promise.all(
      recipientIds.map((rid) =>
        this.notifications.emit(
          accountId,
          rid,
          'return_to_warehouse',
          title,
          body,
          'RetailSale',
          sale.id,
        ),
      ),
    );

    return { ok: true, sentToWarehouse, notified: recipientIds.length };
  }

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
    const where: Prisma.RetailSaleWhereInput = {
      accountId,
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
            // currency drives the money-cell formatting on the list (the till
            // may not be UZS) — fetched so the FE never hard-codes a suffix.
            cashDesk: { select: { id: true, name: true, currency: true } },
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
    // `ready` ham to'lanadi: omborchi yig'ib bo'lgan chek kassirga shu holatda
    // keladi (`sotuv/page.tsx` «Tayyor» ro'yxati → to'lov oynasi). Ilgari bu
    // yerda `!== 'draft'` turardi — butun yig'ish zanjiri to'lovda berkilardi.
    if (!canTransition(sale.state, 'post')) {
      throw new BadRequestException(transitionRejection(sale.state, 'post'));
    }
    if (sale.session.state !== 'open') {
      throw new BadRequestException(`Session is ${sale.session.state}. Cannot post sale.`);
    }

    const cashAmount = BigInt(parsed.cashAmountMinor);
    const cardAmount = BigInt(parsed.cardAmountMinor);
    const total = sale.sumMinor;

    // §107: mixed-payment money rule via the pure, adversarially-tested
    // validator. Behaviour byte-identical to the prior inline block
    // (same insufficient message, same change formula). 'negative-input'
    // is defensive — the Zod schema already enforces `^\d+$` upstream.
    const pay = computeRetailPayment({
      cashMinor: cashAmount,
      cardMinor: cardAmount,
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
    const allowNegative = sale.session.store.allowNegativeStock;

    const posted = await this.prisma.client.$transaction(async (tx) => {
      // Atomic state guard: only a postable state ('draft' | 'ready') → 'posted'.
      // Two concurrent posts on the same receipt would otherwise both succeed
      // (both reads see the pre-state, both updates flip 'posted' → 'posted' as
      // a no-op) — but the cash inflow, session aggregates, and stock decrement
      // would fire twice. updateMany returns count=0 when the row state has
      // already moved. The IN-list comes from the same FSM table as the
      // pre-check above, so the guard can't drift narrower/wider than it.
      const flipResult = await tx.retailSale.updateMany({
        where: { id, accountId, state: { in: [...allowedFrom('post')] } },
        data: {
          state: 'posted',
          postedAt: new Date(),
          cashAmountMinor: cashAmount,
          cardAmountMinor: cardAmount,
          changeMinor: change,
        },
      });
      if (flipResult.count === 0) {
        throw new ConflictException(
          `RetailSale ${id} state changed; post aborted (already posted?)`,
        );
      }

      // Stock cascade — same lock-then-assert-then-apply pattern as DemandService.post.
      if (stockPositions.length > 0) {
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
      if (cashAmount > 0n) {
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
    // Yig'ilayotgan (`picking`) va yig'ilgan (`ready`) cheklar ham bekor
    // qilinadi — TZ §4 diagrammasi. Ilgari `!== 'draft'` edi: mijoz ketib
    // qolsa chek hech qachon yopilmasdi (post ham, cancel ham rad etardi).
    if (!canTransition(sale.state, 'cancel')) {
      throw new BadRequestException(transitionRejection(sale.state, 'cancel'));
    }

    // Atomic state guard: pre-posted holatlardan → 'cancelled'. Without this, a
    // cancel that races with a post() would silently overwrite 'posted' to
    // 'cancelled' while the cashDesk inflow and session aggregates remain —
    // leaving money in the till against a cancelled receipt.
    const flipResult = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: { in: [...allowedFrom('cancel')] } },
      data: { state: 'cancelled' },
    });
    if (flipResult.count === 0) {
      throw new ConflictException(
        `RetailSale ${id} state changed; cancel aborted (already posted?)`,
      );
    }

    // Omborchining ochiq yig'ish topshiriqlari yopiladi — aks holda bekor
    // qilingan chekning vazifasi panelda «pending» bo'lib qolardi va omborchi
    // yo'q sotuv uchun tovar yig'ib yurardi. `done` EMAS ('yig'ib bo'lindi'
    // degan yolg'on bo'lardi) — alohida `cancelled` holat.
    // Best-effort: chek allaqachon bekor qilingan, topshiriq tozalashdagi
    // xato uni orqaga qaytarmasligi kerak.
    if (sale.state === 'picking' || sale.state === 'ready') {
      await this.prisma.client.restockTask
        .updateMany({
          where: {
            accountId,
            sourceId: id,
            sourceType: 'retailsale',
            type: 'picking',
            status: { notIn: ['done', 'cancelled'] },
          },
          data: { status: 'cancelled' },
        })
        .catch((e) => {
          this.logger.error(
            `cancel[${id}]: picking-task cleanup failed: ${e instanceof Error ? e.message : e}`,
          );
        });
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
      if (refundStockRows.length > 0) {
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
            storeId: original.session.storeId,
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
      returnsCount: returnsAgg._count.id,
      returnsSumMinor: (returnsAgg._sum.sumMinor ?? 0n).toString(),
      cashReturnsMinor: (returnsAgg._sum.cashAmountMinor ?? 0n).toString(),
      cardReturnsMinor: (returnsAgg._sum.cardAmountMinor ?? 0n).toString(),
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

  async sendToPicking(accountId: string, id: string, userId: string, userName: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      select: { id: true, state: true },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (!canTransition(sale.state, 'send-to-picking')) {
      throw new BadRequestException(transitionRejection(sale.state, 'send-to-picking'));
    }
    const result = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: { in: [...allowedFrom('send-to-picking')] } },
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
                attributes: true,
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

    // Pozitsiyalar ombor raqami bo'yicha guruhlanadi (yacheyka kodining 1-bo'lagi).
    // Yacheykasi yo'q tovarlar NULL_SKLAD=-1 guruhiga, u birinchi omborchiga.
    const NULL_SKLAD = -1;
    type Pos = (typeof sale.positions)[number];
    const groups = new Map<number, Pos[]>();
    for (const pos of sale.positions) {
      // climart: manzil tovarda `attributes.__yacheyka` satri («01-02-03-05»);
      // ombor raqami = birinchi bo'lak (sherset'dagi `locSklad` ekvivalenti).
      const sklad = (pos.product ? skladNoOf(cellOf(pos.product.attributes)) : null) ?? NULL_SKLAD;
      if (sklad === NULL_SKLAD) {
        this.logger.warn(
          `createPickingTasks[${saleId}]: product ${pos.productId} yacheykasi yo'q - zaxira guruh`,
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
    // Yacheykasiz tovarlar uchun zaxira omborchi: birinchi sozlangani.
    const fallbackKeeper = keepers[0];

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
              const bin = p ? cellOf(p.attributes) : '';
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

  async markReady(accountId: string, id: string, userId: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      select: { id: true, state: true },
    });
    if (!sale) throw new NotFoundException(`RetailSale ${id} not found`);
    if (!canTransition(sale.state, 'mark-ready')) {
      throw new BadRequestException(transitionRejection(sale.state, 'mark-ready'));
    }

    // Does THIS omborchi own a picking task for this sale?
    const myTaskCount = await this.prisma.client.restockTask.count({
      where: {
        accountId,
        sourceId: id,
        sourceType: 'retailsale',
        type: 'picking',
        assigneeId: userId,
      },
    });

    if (myTaskCount > 0) {
      // Per-warehouse: close only the caller's own zone.
      await this.prisma.client.restockTask.updateMany({
        where: {
          accountId,
          sourceId: id,
          sourceType: 'retailsale',
          type: 'picking',
          assigneeId: userId,
          status: { notIn: ['done', 'cancelled'] },
        },
        data: { status: 'done' },
      });
    } else {
      // No keeper-assigned task for this user → legacy behaviour: close everything.
      await this.prisma.client.restockTask.updateMany({
        where: {
          accountId,
          sourceId: id,
          sourceType: 'retailsale',
          type: 'picking',
          status: { notIn: ['done', 'cancelled'] },
        },
        data: { status: 'done' },
      });
    }

    // Any warehouse still outstanding? Then the sale stays 'picking' — this
    // omborchi's zone is done, but another keeper hasn't collected theirs yet.
    const remaining = await this.prisma.client.restockTask.count({
      where: {
        accountId,
        sourceId: id,
        sourceType: 'retailsale',
        type: 'picking',
        status: { notIn: ['done', 'cancelled'] },
      },
    });
    if (remaining > 0) {
      return this.prisma.client.retailSale.findUniqueOrThrow({ where: { id } });
    }

    // All warehouses done → flip to 'ready' (atomic guard against a racing post/cancel).
    const result = await this.prisma.client.retailSale.updateMany({
      where: { id, accountId, state: 'picking' },
      data: { state: 'ready' },
    });
    if (result.count === 0) {
      throw new ConflictException('Sale state changed; mark-ready aborted');
    }
    return this.prisma.client.retailSale.findUniqueOrThrow({ where: { id } });
  }
}
