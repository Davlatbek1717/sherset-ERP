import type { Prisma } from '@moysklad/db';
import { scaleMinorByQty } from '@moysklad/money';
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
// Kassa TZ §7.1 — qarzga sotish mijoz balansiga yoziladi (moysklad «Баланс»
// ishora konventsiyasi: musbat = mijoz bizga qarzdor).
import { CounterpartyBalanceService } from '../counterparty-balance/counterparty-balance.service.js';
// Faza 18a (QAROR-A weighted-average, STK-02): the POS stock outflow is priced
// from the per-store locked balance with the same helpers Loss uses.
import { compareDecimals, computePerUnitCost } from '../demand/fifo-consumer.js';
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
import {
  CASHIER_EVENT,
  type CashierAuditEventInput,
  planCancelAuditEvent,
  planCreditSaleAuditEvent,
  planRefundAuditEvent,
  planSaleAuditEvents,
} from './cashier-audit.js';
import { computePositions } from './compute-positions.js';
// Kassa TZ §5.3 — pure cost/base-price snapshot rules (NULL = "not collected",
// never 0), kept testable without a Prisma mock.
import {
  type FrozenPrices,
  type SalePricesJson,
  resolveWholesaleMinor,
  snapshotPricesByProduct,
} from './price-snapshot.js';
import { planLoyaltyAccrual, planLoyaltyReversal } from './retail-loyalty.js';
// Faza 18a: refund returns EXACTLY the value the original sale's outflow
// booked (cumulative remainder over partial refunds; NULL mirror for legacy
// sales posted before the fix) — see retail-refund-cogs.test.ts.
import { buildRefundCostBasis, consumeRefundCost } from './retail-refund-cogs.js';
// Pure, adversarially-tested refund guards (§105 — enforces the
// schema's documented "subset of original positions" contract that
// refund() never checked: blocks over-refund of qty/products/cash).
import {
  computeRefundSettlementCaps,
  isFullyRefunded,
  priceRefundFromOriginal,
  validateRefundAmount,
  validateRefundPositions,
  validateRefundSettlement,
} from './retail-refund-validation.js';
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
// Kassa TZ §6 — aralash to'lov qoidalari (sof, testlangan).
import { TENDER, computeTenders, legacyTotals } from './retail-tenders.js';

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
    // Kassa TZ §7.1 — qarzga sotilgan qism mijozning umumiy balansiga tushadi.
    @Inject(CounterpartyBalanceService)
    private readonly counterpartyBalance: CounterpartyBalanceService,
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
  /**
   * SALES-04 — whose debt did this receipt create?
   *
   * Normally the receipt itself says so (`agentId`, persisted by post()).
   * Receipts posted before that fix have it NULL even though the balance was
   * moved, because `/sotuv` sends the customer only in the post payload. The
   * SOLD_ON_CREDIT audit event is written inside the same transaction as the
   * balance delta, so it is the one faithful record of the debtor — a
   * fallback, never a substitute (a receipt with a customer never reads it).
   */
  private async resolveCreditDebtorId(
    accountId: string,
    original: { id: string; agentId: string | null },
  ): Promise<string | null> {
    if (original.agentId) return original.agentId;
    const event = await this.prisma.client.cashierAuditEvent.findFirst({
      where: { accountId, docId: original.id, type: CASHIER_EVENT.soldOnCredit },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    const payload = event?.payload;
    if (payload && typeof payload === 'object' && 'agentId' in payload) {
      const agentId = (payload as { agentId?: unknown }).agentId;
      if (typeof agentId === 'string' && agentId.length > 0) return agentId;
    }
    return null;
  }

  private async reverseLoyalty(
    accountId: string,
    userId: string,
    originalSaleId: string,
    refundSaleId: string,
    /** SALES-05 — the share this refund represents of the original receipt. */
    share: { refundSumMinor: bigint; originalSumMinor: bigint },
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
      const plan = planLoyaltyReversal(earned, share.refundSumMinor, share.originalSumMinor);
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
            // buyPrice + salePrices ride along so the POS can show cost / the
            // wholesale floor / live profit when the cashier pulls a picked
            // receipt back into the cart. Before post() the line's own
            // costMinor is still NULL — the card is the only source there.
            product: {
              select: {
                id: true,
                name: true,
                code: true,
                uom: true,
                buyPrice: true,
                salePrices: true,
              },
            },
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
          // priceMinor + product name ride along for the audit events (kassa
          // TZ §9): the log has to say WHAT was sold and at what price, not
          // just that something was.
          select: {
            id: true,
            productId: true,
            quantity: true,
            priceMinor: true,
            product: { select: { name: true } },
          },
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

    // `expectedSumMinor` — kassir EKRANDA ko'rgan summa. Ilgari u qabul
    // qilinardi-yu hech qayerda solishtirilmasdi (sxema izohidagi «server
    // revalidates against DB sum» da'vosi yolg'on edi). Oqibati: chek yuklangan
    // va to'lov olingan on orasida hujjat o'zgarsa (boshqa foydalanuvchi
    // tahrirlasa), kassir ekrandagidan BOSHQA summaga pul olardi va buni hech
    // kim sezmasdi. Endi bu 409 — optimistik qulf bilan bir klass.
    if (BigInt(parsed.expectedSumMinor) !== sale.sumMinor) {
      throw new ConflictException(
        `Chek summasi o'zgargan: ekranda ${parsed.expectedSumMinor}, bazada ${sale.sumMinor.toString()}. Chekni qayta oching.`,
      );
    }

    const cashAmount = BigInt(parsed.cashAmountMinor);
    const cardAmount = BigInt(parsed.cardAmountMinor);
    const terminalAmount = BigInt(parsed.terminalAmountMinor);
    const debtAmount = BigInt(parsed.debtAmountMinor);
    const total = sale.sumMinor;

    // Kassa TZ §6 — aralash to'lov (naqd · karta · terminal · qarz).
    // `/sotuv` to'lov oynasi to'rttasini ham ALLAQACHON yuborardi; server
    // ikkitasini bilardi va qolgani jimgina tashlanardi → terminal/qarz chek
    // 400 olardi. Qoidalar `retail-tenders.ts` da (sof, testlangan).
    const pay = computeTenders({
      cashMinor: cashAmount,
      cardMinor: cardAmount,
      terminalMinor: terminalAmount,
      debtMinor: debtAmount,
      totalMinor: total,
    });
    if (!pay.ok) {
      if (pay.reason === 'insufficient') {
        throw new BadRequestException(
          `Payment insufficient: paid ${pay.paidMinor.toString()} < total ${pay.totalMinor.toString()}`,
        );
      }
      if (pay.reason === 'debt-overpaid') {
        throw new BadRequestException(
          `Qarzli chekda to'lov + qarz JAMIga teng bo'lishi kerak: ${pay.paidMinor.toString()} ≠ ${pay.totalMinor.toString()}`,
        );
      }
      if (pay.reason === 'change-exceeds-cash') {
        // TZ §6.2: qaytim faqat naqddan. Aks holda kassa mijozga bank pulidan
        // naqd qaytim berib, o'z kassasidan pul yo'qotadi.
        throw new BadRequestException(
          `Qaytim faqat naqddan beriladi: qaytim ${pay.changeMinor.toString()} > naqd ${pay.cashMinor.toString()}`,
        );
      }
      throw new BadRequestException('Payment amounts must be non-negative');
    }

    // Faza Q1: to'lov oynasidagi mijoz CHEKDAGIsiga ZID bo'lsa — 400.
    //
    // Ilgari `parsed.agentId` chekdagi mavjud `sale.agentId` dan USTUN turardi,
    // lekin chek qatori faqat u BO'SH bo'lganda yangilanardi. Ya'ni chekda A,
    // oynada B bo'lsa: qarz daftariga B yozilar, chek A ni ko'rsatar, qaytarish
    // esa `resolveCreditDebtorId` orqali A ni tanlab qarzni BOSHQA mijozdan
    // yechardi. Ikkalasi ham noto'g'ri saldo, hech bir gate ko'rmasdi.
    //
    // NEGA ustidan yozmaymiz: chek — huquqiy hujjat, to'lov oynasi uning
    // kontragentini JIMGINA almashtira olmasligi kerak (Faza 7/8 bo'ylab
    // quvilgan «jim divergensiya» klassining o'zi). Kassir chekni ochib
    // mijozni to'g'irlaydi — ma'lumot yo'qolmaydi.
    if (parsed.agentId && sale.agentId && parsed.agentId !== sale.agentId) {
      throw new BadRequestException(
        `Chekdagi mijoz to'lov oynasidagidan farq qiladi (chek: ${sale.agentId}, to'lov: ${parsed.agentId}). Chekni ochib mijozni to'g'rilang.`,
      );
    }

    // Qarzga sotishda kontragent MAJBURIY — aks holda qarz kimningdir
    // balansiga emas, hech qayerga yozilgan bo'lardi (TZ §7.1).
    const debtAgentId = parsed.agentId ?? sale.agentId ?? null;
    if (debtAmount > 0n && !debtAgentId) {
      throw new BadRequestException('Qarzga sotish uchun mijoz tanlanishi shart');
    }

    const change = pay.changeMinor;
    const legacy = legacyTotals(pay.lines);

    // Stock cascade: rows with a productId trigger an outflow against
    // session.storeId. Service-only positions (productId === null) are
    // intentionally skipped — services don't carry stock.
    const stockPositions = sale.positions.filter(
      (p): p is typeof p & { productId: string } => p.productId !== null,
    );
    const storeId = sale.session.storeId;
    const allowNegative = sale.session.store.allowNegativeStock;

    // Kassa TZ §5.3 — read the price snapshot BEFORE the transaction opens. The
    // product cards are not part of the sale's consistency set (nobody may edit
    // a card and expect a mid-flight receipt to follow), and keeping the read
    // outside keeps the money/stock transaction as short as possible.
    const frozen = await this.loadFrozenPrices(
      accountId,
      sale.positions.map((p) => p.productId),
    );

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
          // Qarz to'lov oynasida tanlangan mijozga yozilsa, MIJOZ CHEKDA HAM
          // qolishi shart: `/sotuv` kontragentni faqat post payloadida
          // yuboradi, chek qatorida esa `agentId` NULL bo'lib qolardi —
          // keyin qaytarishda qarz kimniki ekani noma'lum edi (SALES-04).
          ...(debtAmount > 0n && debtAgentId && !sale.agentId ? { agentId: debtAgentId } : {}),
          // TZ §6.3 — bu ikki ustun endi to'lov qatorlaridan HISOBLANADI
          // (terminal `card` yig'indisiga kiradi: ikkalasi ham naqdsiz).
          // Ustunlar saqlanadi, chunki mavjud hisobotlar va moysklad-compat
          // ularni o'qiydi.
          ...legacy,
          changeMinor: change,
        },
      });
      if (flipResult.count === 0) {
        throw new ConflictException(
          `RetailSale ${id} state changed; post aborted (already posted?)`,
        );
      }

      // Faza Q1 (SALES-07) — SMENA CLAIM'i: agregat inkrementi endi SHARTLI.
      //
      // Yuqoridagi `sale.session.state !== 'open'` tekshiruvi tranzaksiyadan
      // TASHQARIDA o'qilgan (eskirgan) nusxa ustida ishlaydi. O'sha o'qish
      // bilan bu yer orasida `close()` yugursa, chek YOPILGAN smenaga post
      // bo'lardi: pul yashiqqa tushadi, `close()` esa uni allaqachon sanab
      // bo'lgan ⇒ smena naqdi hech qachon to'g'ri chiqmaydi va kassirga
      // tushuntirib bo'lmaydigan farq akti yoziladi.
      //
      // Shart `close()` ning flip'i bilan AYNI ustunda (`state`), ya'ni
      // Postgres qator-qulfi ikkalasini ketma-ketlashtiradi: kim ikkinchi
      // bo'lsa `count = 0` oladi. Qulf PUL/OMBOR kaskadidan OLDIN olinadi va
      // agregat inkrementi ATAYLAB shu yerga ko'chirildi — alohida shartsiz
      // `update` qolganida qulf va hisob ajralib, poyga oynasi qayta ochilardi.
      const sessionClaim = await tx.cashierSession.updateMany({
        where: { id: sale.sessionId, accountId, state: 'open' },
        data: {
          salesCount: { increment: 1 },
          salesSumMinor: { increment: total },
        },
      });
      if (sessionClaim.count === 0) {
        throw new ConflictException(
          `Smena ${sale.sessionId} yopilgan; chek rasmiylashtirilmadi. Yangi smena oching.`,
        );
      }

      // Kassa TZ §5.3 — pin cost + base price onto the lines, inside the same
      // transaction as the state flip. If the stock or money cascade below
      // rolls back, the snapshot rolls back with it: a receipt is never left
      // holding frozen numbers for a sale that did not happen.
      // Grouped by product so a receipt with repeated products still costs one
      // statement per distinct product, not one per line.
      await this.freezePositionPrices(tx, accountId, id, sale.positions, frozen);

      // Kassa TZ §9 — narx erkinligi ISHLATILGAN bo'lsa, iz qoladi.
      // Chegaralar server tomonda hal qilinadi (yuqoridagi `frozen`), POS
      // aytganiga emas — auditni auditdan o'tayotgan odam yozmasligi kerak.
      await this.writeAuditEvents(
        tx,
        accountId,
        sale.sessionId,
        userId,
        planSaleAuditEvents(
          id,
          sale.positions
            .filter((p): p is typeof p & { productId: string } => p.productId !== null)
            .map((p) => {
              const snap = frozen.get(p.productId);
              return {
                productId: p.productId,
                productName: p.product?.name ?? null,
                quantity: String(p.quantity),
                priceMinor: p.priceMinor,
                costMinor: snap?.costMinor ?? null,
                basePriceMinor: snap?.basePriceMinor ?? null,
                wholesaleMinor: snap?.wholesaleMinor ?? null,
              };
            }),
        ),
      );

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
        // Faza 18a (STK-02): price the outflow VALUE, not just the qty. The
        // old `costDeltaMinor: null` left Stock.costBalanceMinor untouched
        // while qty fell, so every POS sale inflated the store's per-unit
        // weighted average for all later consumers (Loss, Demand, reports).
        // The basis is the per-store locked balance's average — identical to
        // Loss — with the receipt's frozen buyPrice snapshot as the
        // valueless-stock fallback (a sale from empty stock still removes
        // value; NULL≠0 contract untouched, `frozen` misses simply cost 0).
        const deltas: StockDelta[] = stockPositions.map((p) => {
          const bal = balances.get(p.productId);
          const onHand = bal?.qty ?? '0';
          const costBal = bal?.costBalanceMinor ? BigInt(bal.costBalanceMinor) : 0n;
          const fallback = frozen.get(p.productId)?.costMinor ?? 0n;
          const perUnit =
            costBal > 0n && compareDecimals(onHand, '0') > 0
              ? computePerUnitCost(costBal, onHand)
              : fallback;
          return {
            storeId,
            assortmentKind: 'product',
            assortmentId: p.productId,
            qtyDelta: `-${String(p.quantity)}`,
            costDeltaMinor: -scaleMinorByQty(perUnit, String(p.quantity)),
            docType: 'retailsale',
            docId: id,
            docPositionId: p.id,
            reason: 'post',
          };
        });
        await this.stock.applyDeltas(tx, accountId, userId, deltas);
      }

      // Kassa TZ §6.1 — har to'lov turi alohida qator. Bu Z-hisobotning
      // «to'lov turlari kesimida tushum» bandi uchun yagona manba (§8.5):
      // ikkita ustundan («naqd» va «naqdsiz») kanalni tiklab bo'lmaydi.
      if (pay.lines.length > 0) {
        await tx.retailSalePayment.createMany({
          data: pay.lines.map((l) => ({
            accountId,
            saleId: id,
            method: l.method,
            amountMinor: l.amountMinor,
            currency: sale.session.cashDesk.currency,
            // UZS to'lovda hisob valyutasidagi summa aynan o'zi. CASH_USD
            // ulanganda bu yerda `rateMinor` bilan o'girish qo'shiladi.
            amountBaseMinor: l.amountMinor,
          })),
        });
      }

      // Cash inflow: route through MoneyService so the ledger captures
      // both the materialized balance update and a MoneyOperation row
      // (audit trail) — atomic with the FSM flip and stock cascade.
      // Card/terminal portion is intentionally NOT booked yet — V2 requires a
      // BankAccount routing decision (which account to credit per
      // POS terminal). For now it lives in RetailSale.cardAmountMinor +
      // the RetailSalePayment rows above.
      //
      // ⚠️ QAYTIM CHEGIRILADI. Kassaga tushadigan pul — berilgan naqd MINUS
      // qaytim. Ilgari to'liq `cashAmount` yozilardi: 100 000 berib 90 000 lik
      // tovar olgan mijozga 10 000 qaytarilsa ham, kassa balansi 100 000 ga
      // o'sardi. Bu smena yopilishida (TZ §8.4 «farq akti») SOXTA KAMOMAD
      // beradi — kutilgan naqd haqiqiydan har qaytim summasicha ko'p bo'ladi.
      const cashToDrawer = cashAmount - change;
      if (cashToDrawer > 0n) {
        const moneyDeltas: MoneyDelta[] = [
          {
            sourceKind: 'cash_desk',
            sourceId: sale.session.cashDeskId,
            deltaMinor: cashToDrawer,
            currency: sale.session.cashDesk.currency,
            documentKind: 'retailsale',
            documentId: id,
            description: `POS sale ${sale.name}`,
          },
        ];
        await this.money.applyDeltas(tx, accountId, moneyDeltas);
      }

      // Kassa TZ §7.1 — qarzga sotilgan qism MIJOZNING UMUMIY BALANSIGA
      // yoziladi. Ishora konventsiyasi moysklad «Баланс» bilan bir xil:
      // musbat = mijoz bizga qarzdor (`InvoiceOut.post` bilan bir xil yo'nalish).
      //
      // Bu yerda ATAYLAB `Debt` reyestriga (QRZ-…) yozmaymiz: reyestr — qo'lda
      // ochiladigan, hujjatsiz qarzlar uchun, va uning `create` yo'li ham
      // AYNAN shu balansga `+total` yozadi (2026-08-05). Ikkalasiga birdan
      // yozilsa, hujjatdan kelgan qarz IKKI MARTA sanalardi (xotira:
      // `debt-ledger-asymmetry`). Bitta daftar — bitta haqiqat.
      if (debtAmount > 0n && debtAgentId) {
        await this.counterpartyBalance.applyDelta(
          tx,
          accountId,
          debtAgentId,
          sale.session.cashDesk.currency,
          debtAmount,
          { docType: 'retailsale', docId: id, organizationId: sale.organizationId },
        );
        // Yangi balansni O'QIYMIZ va hodisaga yozamiz — «kimning qarzi tez
        // o'sadi» savoliga keyin javob berish uchun o'sha ondagi holat kerak.
        const bal = await tx.counterpartyBalance.findFirst({
          where: {
            accountId,
            counterpartyId: debtAgentId,
            currency: sale.session.cashDesk.currency,
          },
          select: { balanceMinor: true },
        });
        await this.writeAuditEvents(tx, accountId, sale.sessionId, userId, [
          planCreditSaleAuditEvent(id, {
            agentId: debtAgentId,
            saleName: sale.name,
            debtMinor: debtAmount,
            totalMinor: total,
            newBalanceMinor: bal?.balanceMinor ?? null,
          }),
        ]);
      }

      // Smena agregatlari (salesCount / salesSumMinor) yuqoridagi CLAIM bilan
      // BIRGA yozildi — qulf va hisob ajralmasin (Faza Q1).

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

  async cancel(accountId: string, userId: string, id: string) {
    const sale = await this.prisma.client.retailSale.findFirst({
      where: { id, accountId },
      // name/sumMinor/positions feed the audit event (kassa TZ §9): a cancel
      // has to record WHAT was thrown away, not merely that something was.
      select: {
        id: true,
        state: true,
        name: true,
        sessionId: true,
        sumMinor: true,
        positions: { select: { productId: true, quantity: true }, orderBy: { position: 'asc' } },
      },
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
    // The audit event shares the transaction with the flip: whoever wins the
    // race is the one who gets logged, and a lost race logs nothing.
    await this.prisma.client.$transaction(async (tx) => {
      const flipResult = await tx.retailSale.updateMany({
        where: { id, accountId, state: { in: [...allowedFrom('cancel')] } },
        data: { state: 'cancelled' },
      });
      if (flipResult.count === 0) {
        throw new ConflictException(
          `RetailSale ${id} state changed; cancel aborted (already posted?)`,
        );
      }
      await this.writeAuditEvents(tx, accountId, sale.sessionId, userId, [
        planCancelAuditEvent(id, {
          // The stage BEFORE the flip — «cancelled a ready receipt» means the
          // warehouse already picked the goods and has to put them back.
          stage: sale.state,
          name: sale.name,
          sumMinor: sale.sumMinor,
          lines: sale.positions.map((p) => ({
            productId: p.productId,
            quantity: String(p.quantity),
          })),
        }),
      ]);
    });

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
        // The frozen snapshot rides along so the mirror receipt reverses the
        // SAME cost the original was sold against (kassa TZ §5.3) — re-reading
        // the product card here would book a refund at today's cost and leave a
        // phantom profit behind whenever the card changed in between.
        positions: {
          select: {
            productId: true,
            quantity: true,
            costMinor: true,
            basePriceMinor: true,
            // SALES-01: the refund is PRICED from these — the client's
            // priceMinor is informational only (see priceRefundFromOriginal).
            priceMinor: true,
            discount: true,
            sumMinor: true,
          },
        },
        // SALES-04: how the receipt was actually settled. A DEBT row means
        // the till took no money for that share — refunding it in cash pays
        // out money that never arrived AND leaves the debt standing.
        payments: { select: { method: true, amountMinor: true } },
      },
    });
    if (!original) throw new NotFoundException(`RetailSale ${originalSaleId} not found`);
    if (original.state !== 'posted') {
      throw new BadRequestException(`Can only refund a posted sale (current: ${original.state})`);
    }
    if (original.session.state !== 'open') {
      throw new BadRequestException(`Session is ${original.session.state}. Cannot refund.`);
    }

    // SALES-05: what earlier refunds of this receipt already took. Before this,
    // the first partial refund flipped the receipt to 'refunded' and the other
    // nine units of a ten-unit sale could never come back — so no cumulative
    // bookkeeping was needed, and none existed. Cancelled mirrors are excluded:
    // they returned nothing.
    const priorRefunds = await this.prisma.client.retailSale.findMany({
      where: {
        accountId,
        refundedFromId: original.id,
        state: { in: ['posted', 'refunded'] },
      },
      select: {
        id: true,
        sumMinor: true,
        cashAmountMinor: true,
        cardAmountMinor: true,
        debtReturnMinor: true,
        positions: { select: { productId: true, quantity: true } },
      },
    });
    const priorLines = priorRefunds.flatMap((r) =>
      r.positions.map((p) => ({ productId: p.productId, quantity: String(p.quantity) })),
    );
    const priorTotals = priorRefunds.reduce(
      (acc, r) => ({
        sumMinor: acc.sumMinor + r.sumMinor,
        moneyMinor: acc.moneyMinor + r.cashAmountMinor + r.cardAmountMinor,
        debtMinor: acc.debtMinor + r.debtReturnMinor,
      }),
      { sumMinor: 0n, moneyMinor: 0n, debtMinor: 0n },
    );

    // §105 over-refund guard: refunded products/qty must be a subset of
    // the original sale (the schema documents this; refund() never
    // enforced it → wrong stock inflow + over-refunded cash). SALES-05: the
    // cap is on this refund PLUS every earlier one.
    const posError = validateRefundPositions(
      original.positions.map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
      })),
      parsed.positions.map((p) => ({ productId: p.productId, quantity: p.quantity })),
      priorLines,
    );
    if (posError) throw new BadRequestException(posError);

    // SALES-01: price the refund from the ORIGINAL receipt, never from the
    // request. Running the client's `priceMinor` through computePositions()
    // made the payout cap self-referential — a cashier could refund a
    // 10 000 so'm item for 10 000 000 and every guard below still passed.
    // `discount` is already baked into the original `sumMinor`, which also
    // closes FE-01 (refunding a discounted receipt at the list price).
    const refundPositions = priceRefundFromOriginal(
      original.positions.map((p) => ({
        productId: p.productId,
        quantity: String(p.quantity),
        priceMinor: p.priceMinor,
        discount: String(p.discount),
        sumMinor: p.sumMinor,
      })),
      parsed.positions.map((p) => ({ productId: p.productId, quantity: p.quantity })),
    );

    const cashReturn = BigInt(parsed.cashAmountMinor);
    const cardReturn = BigInt(parsed.cardAmountMinor);

    // §105: cannot pay back more money than the refunded goods are
    // worth. Now that `refundPositions.totalMinor` is derived from the
    // original receipt, this cap is a real bound: Σ refund ≤ original.sumMinor.
    const amtError = validateRefundAmount(refundPositions.totalMinor, cashReturn, cardReturn);
    if (amtError) throw new BadRequestException(amtError);

    // SALES-04: split the refund between the till and the customer's account
    // the way the receipt itself was settled. `validateRefundAmount` above only
    // knows what the goods are worth — it cannot tell that the customer never
    // handed any money over.
    const originalDebtMinor = original.payments
      .filter((p) => p.method === TENDER.debt)
      .reduce((a, p) => a + p.amountMinor, 0n);
    const caps = computeRefundSettlementCaps({
      originalSumMinor: original.sumMinor,
      originalDebtMinor,
      priorRefundedSumMinor: priorTotals.sumMinor,
      priorMoneyReturnedMinor: priorTotals.moneyMinor,
      priorDebtReturnedMinor: priorTotals.debtMinor,
      refundSumMinor: refundPositions.totalMinor,
    });
    // Omitted → settle the credit share automatically (schema comment): the
    // POS sends nothing today, and «goods came back, debt stayed» is the very
    // bug being fixed. An explicit value is still capped.
    const debtReturn =
      parsed.debtReturnMinor === undefined ? caps.debtMaxMinor : BigInt(parsed.debtReturnMinor);
    const settleError = validateRefundSettlement(caps, cashReturn, cardReturn, debtReturn);
    if (settleError) throw new BadRequestException(settleError);

    // The debtor is whoever the credit was booked against on post() — which is
    // why post() now persists that counterparty onto the receipt. Receipts sold
    // BEFORE that fix carry agentId = null (the POS only ever sent the customer
    // in the post payload), so the debtor is recovered from the SOLD_ON_CREDIT
    // audit event, written in the same transaction as the balance delta. Without
    // this every credit receipt already in the database would be unrefundable.
    const debtorId = debtReturn > 0n ? await this.resolveCreditDebtorId(accountId, original) : null;
    if (debtReturn > 0n && !debtorId) {
      throw new BadRequestException(
        `Chek qarzga sotilgan, lekin mijoz biriktirilmagan — qarzni qaytarib bo'lmaydi (${original.name}). Qaytarishni davom ettirish uchun debtReturnMinor=0 yuboring va qarzni qo'lda tuzating.`,
      );
    }

    const name = await this.nextRetailSaleName(accountId);

    // Original snapshot, keyed by product. First occurrence wins when a receipt
    // listed the same product on several lines — the refund is validated
    // against the aggregated quantity, so it has no single line to point back
    // at, and the frozen numbers are per-product anyway.
    const originalFrozen = new Map<
      string,
      { costMinor: bigint | null; basePriceMinor: bigint | null }
    >();
    for (const p of original.positions) {
      if (p.productId && !originalFrozen.has(p.productId)) {
        originalFrozen.set(p.productId, {
          costMinor: p.costMinor,
          basePriceMinor: p.basePriceMinor,
        });
      }
    }

    // H4 record-scope: the refund document is created by the acting user.
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, userId);

    // SALES-05: the receipt only closes when the LAST sold unit is back. While
    // units are still out it stays 'posted' so the rest can be returned.
    const fullyRefunded = isFullyRefunded(
      original.positions.map((p) => ({ productId: p.productId, quantity: String(p.quantity) })),
      [
        ...priorLines,
        ...parsed.positions.map((p) => ({ productId: p.productId, quantity: p.quantity })),
      ],
    );

    const refunded = await this.prisma.client.$transaction(async (tx) => {
      // Atomic state guard. The old guard was `state: 'posted' → 'refunded'`:
      // the flip itself served as the mutex, so a second concurrent refund got
      // count=0. A partial refund no longer flips the state, so the mutex moved
      // onto the receipt's optimistic-lock `version` — otherwise two concurrent
      // refunds would both read the same (stale) list of earlier refunds and
      // each pay out the full remaining value.
      const flipResult = await tx.retailSale.updateMany({
        where: { id: original.id, accountId, state: 'posted', version: original.version },
        data: { ...(fullyRefunded ? { state: 'refunded' } : {}), version: { increment: 1 } },
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
          // SALES-04: the credit share this return wrote off. Persisted (not
          // recomputed) because the cumulative caps of every LATER partial
          // refund are measured against it.
          debtReturnMinor: debtReturn,
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
              // Inherited, not re-read — see the select comment above.
              costMinor: originalFrozen.get(p.productId)?.costMinor ?? null,
              basePriceMinor: originalFrozen.get(p.productId)?.basePriceMinor ?? null,
            })),
          },
        },
      });

      // Kassa TZ §9 — qaytarish erkin (Q11), shuning uchun iz qoladi.
      // `docId` = OYNA chek: pul aynan o'sha hujjat orqali harakat qiladi;
      // asl chek payload ichida.
      await this.writeAuditEvents(tx, accountId, original.sessionId, userId, [
        planRefundAuditEvent(refundSale.id, {
          originalId: original.id,
          originalName: original.name,
          sumMinor: refundPositions.totalMinor,
          cashMinor: cashReturn,
          cardMinor: cardReturn,
          lines: refundPositions.rows.map((p) => ({
            productId: p.productId,
            quantity: String(p.quantity),
            priceMinor: p.priceMinor,
          })),
        }),
      ]);

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
        // Faza 18a (STK-02): return EXACTLY the value the original outflow
        // booked — read back from the sale's own StockOperation rows, net of
        // earlier partial refunds (cumulative remainder → the refund series
        // is zero-sum against the original). Legacy sales (posted before the
        // fix) booked NULL on the way out, so their refunds book NULL too.
        const [originalPostOps, priorRefundOps] = await Promise.all([
          tx.stockOperation.findMany({
            where: { accountId, docType: 'retailsale', docId: original.id, reason: 'post' },
            select: { assortmentId: true, qtyDelta: true, costDeltaMinor: true },
          }),
          priorRefunds.length > 0
            ? tx.stockOperation.findMany({
                where: {
                  accountId,
                  docType: 'retailsale',
                  docId: { in: priorRefunds.map((r) => r.id) },
                  reason: 'unpost',
                },
                select: { assortmentId: true, qtyDelta: true, costDeltaMinor: true },
              })
            : Promise.resolve([]),
        ]);
        const costBasis = buildRefundCostBasis(
          originalPostOps.map((op) => ({ ...op, qtyDelta: String(op.qtyDelta) })),
          priorRefundOps.map((op) => ({ ...op, qtyDelta: String(op.qtyDelta) })),
        );
        const deltas: StockDelta[] = persistedPositions
          .filter((p): p is typeof p & { productId: string } => p.productId !== null)
          .map((p) => ({
            storeId: original.session.storeId,
            assortmentKind: 'product',
            assortmentId: p.productId,
            qtyDelta: String(p.quantity), // positive — inflow back to stock
            costDeltaMinor: consumeRefundCost(costBasis, p.productId, String(p.quantity)),
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

      // SALES-04 — qarz hisobidan yopilgan ulush: pul kassadan chiqmaydi,
      // mijozning balansidagi qarz kamayadi. post() dagi +debtAmount ning
      // aynan teskarisi (musbat = mijoz qarzdor konventsiyasi), shu bilan
      // «tovar qaytdi, qarz qolaverdi» ikki tomonlama yo'qotish yopiladi.
      if (debtReturn > 0n && debtorId) {
        await this.counterpartyBalance.applyDelta(
          tx,
          accountId,
          debtorId,
          original.session.cashDesk.currency,
          -debtReturn,
          { docType: 'retailsale', docId: refundSale.id, organizationId: original.organizationId },
        );
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

    // §109: claw back the original sale's earned points AFTER the refund txn
    // commits. Reverses the recorded value (§105 — never recomputed), prorated
    // by the refunded share (SALES-05).
    await this.reverseLoyalty(accountId, userId, original.id, refunded.id, {
      refundSumMinor: refundPositions.totalMinor,
      originalSumMinor: original.sumMinor,
    });
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
          // Faza Q1 (SALES-06): `refunded` HAM sotuv. Faza 7 dan keyin to'liq
          // qaytarilgan chek `refunded` bo'lib qoladi — u faqat `posted` bilan
          // qidirilsa sotuvlar jamidan TUSHIB qolar, oyna cheki esa quyidagi
          // `returnsAgg` da baribir ayirilardi ⇒ netSum bir qaytarishni IKKI
          // marta hisobga olib manfiy chiqardi (kassir «bugun zarar» ko'rardi).
          state: { in: ['posted', 'refunded'] },
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

  /**
   * Kassa TZ §5.3 + §9 — read each product's three prices off the card:
   * cost and the retail tier (frozen onto the line by `post()`), plus the
   * wholesale floor (not frozen — it only decides whether an audit event is
   * raised; see `resolveWholesaleMinor`).
   *
   * Read on the SERVER, never taken from the request: the POS reporting its own
   * «this was below cost» flag would let the audited party write their own audit
   * trail (kassa TZ §9).
   *
   * Products that no longer exist, and service-only lines (`productId === null`),
   * simply get no entry: the caller writes NULL, which the reports read as
   * «tan narx yig'ilmagan». A missing card must never post as zero cost.
   */
  private async loadFrozenPrices(
    accountId: string,
    productIds: ReadonlyArray<string | null>,
  ): Promise<Map<string, FrozenPrices & { wholesaleMinor: bigint | null }>> {
    const ids = [...new Set(productIds.filter((p): p is string => p !== null))];
    if (ids.length === 0) return new Map();
    const [products, priceTypes] = await Promise.all([
      this.prisma.client.product.findMany({
        where: { accountId, id: { in: ids } },
        select: { id: true, name: true, buyPrice: true, salePrices: true },
      }),
      // Wholesale = the first non-default tier by position, matching what the
      // POS screen shows as «Min» (`usePriceTypeIds` in the web sale-price lib).
      // Both ends must agree, or the cashier is warned about one floor while
      // the audit log records another.
      this.prisma.client.priceType.findMany({
        where: { accountId, archived: false },
        orderBy: { position: 'asc' },
        select: { id: true, isDefault: true },
      }),
    ]);
    const defaultTypeId = priceTypes.find((t) => t.isDefault)?.id ?? priceTypes[0]?.id ?? null;
    const wholesaleTypeId = priceTypes.find((t) => t.id !== defaultTypeId)?.id ?? null;

    const frozen = snapshotPricesByProduct(
      products.map((p) => ({
        id: p.id,
        buyPrice: p.buyPrice,
        salePrices: p.salePrices as SalePricesJson,
      })),
      defaultTypeId,
    );
    return new Map(
      products.map((p) => [
        p.id,
        {
          ...(frozen.get(p.id) ?? { costMinor: null, basePriceMinor: null }),
          wholesaleMinor: resolveWholesaleMinor(p.salePrices as SalePricesJson, wholesaleTypeId),
        },
      ]),
    );
  }

  /**
   * Kassa TZ §9 — append cashier audit events.
   *
   * Runs INSIDE the caller's transaction, deliberately. The alternative (fire
   * and forget after commit, the way loyalty accrual works) would allow a
   * posted receipt with no trace, and «a sale nobody can see» is precisely the
   * failure this table exists to prevent. The cost of the choice is that a
   * failed insert rolls the sale back — acceptable, because these are plain
   * inserts with no constraints beyond the FKs, so the only realistic failure
   * is a database that could not have committed the sale either.
   */
  private async writeAuditEvents(
    tx: Prisma.TransactionClient,
    accountId: string,
    sessionId: string,
    employeeId: string,
    events: ReadonlyArray<CashierAuditEventInput>,
  ): Promise<void> {
    if (events.length === 0) return;
    await tx.cashierAuditEvent.createMany({
      data: events.map((e) => ({
        accountId,
        sessionId,
        employeeId,
        type: e.type,
        docId: e.docId,
        payload: e.payload as Prisma.InputJsonValue,
      })),
    });
  }

  /**
   * Write the snapshot onto the receipt's lines. Grouped by product id so a
   * receipt listing the same product twice still issues one statement per
   * distinct product. Lines whose product resolved to nothing are left NULL.
   */
  private async freezePositionPrices(
    tx: Prisma.TransactionClient,
    accountId: string,
    retailSaleId: string,
    positions: ReadonlyArray<{ productId: string | null }>,
    frozen: Map<string, FrozenPrices>,
  ): Promise<void> {
    const productIds = [...new Set(positions.map((p) => p.productId))].filter(
      (p): p is string => p !== null,
    );
    for (const productId of productIds) {
      const snap = frozen.get(productId);
      if (!snap || (snap.costMinor == null && snap.basePriceMinor == null)) continue;
      await tx.retailSalePosition.updateMany({
        where: { retailSaleId, accountId, productId },
        data: { costMinor: snap.costMinor, basePriceMinor: snap.basePriceMinor },
      });
    }
  }

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
