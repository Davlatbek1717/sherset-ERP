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
import { resolveCreatorGroupId } from '../shared/group-stamp.js';
// Pure, adversarially-tested shift cash reconciliation (the §74 pattern;
// fixes the §100 latent bug — drawer in/out were omitted from expected).
import {
  type ShiftCashInputs,
  expectedCashMinor,
  shiftDiscrepancyMinor,
} from './cashier-session-reconciliation.js';
import {
  CloseSessionSchema,
  DrawerCashSchema,
  OpenSessionSchema,
  SessionFilterSchema,
} from './cashier-session.schema.js';

/**
 * CashierSessionService — manages cashier shift lifecycle.
 *
 * Invariants:
 *   - One open session per cashier at a time.
 *   - Closing requires all draft RetailSales to be resolved first.
 *   - expectedCashMinor = openingCashMinor + cashSalesSum - cashReturnsSum
 *     (cash portion of sales/returns only).
 *   - discrepancyMinor = closingCashMinor - expectedCashMinor
 */
@Injectable()
export class CashierSessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string, rawFilter: unknown) {
    const filter = SessionFilterSchema.parse(rawFilter);
    const where: Prisma.CashierSessionWhereInput = {
      accountId,
      ...(filter.state ? { state: filter.state } : {}),
      ...(filter.cashierId ? { cashierId: filter.cashierId } : {}),
      ...(filter.cashDeskId ? { cashDeskId: filter.cashDeskId } : {}),
      ...(filter.storeId ? { storeId: filter.storeId } : {}),
      ...(filter.search
        ? {
            OR: [
              { cashier: { name: { contains: filter.search, mode: 'insensitive' } } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            openedAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lte: filter.dateTo } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.client.cashierSession.findMany({
      where,
      orderBy: { [filter.sortBy]: filter.sortDir },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;
    const total = await this.prisma.client.cashierSession.count({ where });
    return { items, nextCursor, total };
  }

  async findById(accountId: string, id: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id, accountId },
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        cashDesk: { select: { id: true, name: true, currency: true, balanceMinor: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true, legalTitle: true } },
        _count: { select: { sales: true } },
      },
    });
    if (!session) throw new NotFoundException(`CashierSession ${id} not found`);
    return session;
  }

  /** Returns the active (open) session for a specific cashier, or null. */
  async findCurrentForCashier(accountId: string, cashierId: string) {
    return this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
      include: {
        // `cashier` MUST be included — the /retail POS register renders
        // `session.cashier.name` in its header, so omitting it crashed the
        // whole page with a client-side TypeError (undefined.name) whenever a
        // session was open. Mirrors list()/findOne()/open()/close(). (2026-06-08k)
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  async open(accountId: string, cashierId: string, raw: unknown) {
    const parsed = OpenSessionSchema.parse(raw);

    // Invariant: one open session per cashier at a time. Two layers:
    //   1. Friendly pre-check — returns the existing session id in the error
    //      message so the cashier UI can offer to close it before opening a
    //      new one.
    //   2. DB-level partial unique index `cashier_sessions_open_per_cashier_idx`
    //      (`WHERE state='open'`) makes this invariant atomic under concurrent
    //      opens. The catch below maps the resulting P2002 to ConflictException.
    const existing = await this.prisma.client.cashierSession.findFirst({
      where: { accountId, cashierId, state: 'open' },
    });
    if (existing) {
      throw new ConflictException(
        `Cashier already has an open session: ${existing.id}. Close it first.`,
      );
    }

    // Verify refs exist
    await this.ensureCashDesk(accountId, parsed.cashDeskId);
    await this.ensureStore(accountId, parsed.storeId);
    await this.ensureOrganization(accountId, parsed.organizationId);

    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);

    try {
      return await this.prisma.client.cashierSession.create({
        data: {
          accountId,
          cashierId,
          groupId: creatorGroupId,
          cashDeskId: parsed.cashDeskId,
          storeId: parsed.storeId,
          organizationId: parsed.organizationId,
          openingCashMinor: BigInt(parsed.openingCashMinor),
          // Were parsed from OpenSessionSchema but silently dropped before
          // (lossy create — §8.3 pattern). Persist both header fields.
          description: parsed.description ?? null,
          externalCode: parsed.externalCode ?? null,
          state: 'open',
        },
        include: {
          cashier: { select: { id: true, name: true } },
          cashDesk: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
        },
      });
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'Cashier already has an open session (concurrent open detected). Close it first.',
        );
      }
      throw e;
    }
  }

  async close(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = CloseSessionSchema.parse(raw);

    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);
    if (session.state !== 'open') {
      throw new BadRequestException(`Session is already ${session.state}`);
    }
    if (session.cashierId !== cashierId) {
      throw new BadRequestException('Only the cashier who opened the session can close it');
    }

    // Ensure no draft RetailSales remain in this session
    const draftCount = await this.prisma.client.retailSale.count({
      where: { accountId, sessionId, state: 'draft' },
    });
    if (draftCount > 0) {
      throw new BadRequestException(
        `Session has ${draftCount} draft sale(s). Post or cancel them before closing.`,
      );
    }

    const closingCash = BigInt(parsed.closingCashMinor);

    // expectedCashMinor = opening + cash portion of posted sales - cash portion of posted refunds
    // We track this incrementally via salesSumMinor / returnsSumMinor which contain
    // the CASH portions only (updated on post/refund in RetailSaleService).
    // For V1, salesSumMinor and returnsSumMinor on the session represent total sums
    // (not just cash). The post step updates these. We compute expected using
    // the session's cash-amount accumulators instead.
    // We query aggregates directly from posted sales for accuracy.
    const cashAgg = await this.prisma.client.retailSale.aggregate({
      where: { accountId, sessionId, state: { in: ['posted', 'refunded'] } },
      _sum: { cashAmountMinor: true },
    });

    const refundAgg = await this.prisma.client.retailSale.aggregate({
      where: {
        accountId,
        sessionId,
        state: 'posted',
        refundedFromId: { not: null },
      },
      _sum: { cashAmountMinor: true },
    });

    // §100 bug-fix: include mid-shift drawer Внесение/Изъятие in the
    // reconciliation. Posted drawer ops scoped to this shift.
    const [drawerInAgg, drawerOutAgg] = await Promise.all([
      this.prisma.client.retailDrawerCashIn.aggregate({
        where: { accountId, retailShiftId: sessionId, state: 'posted', deletedAt: null },
        _sum: { sumMinor: true },
      }),
      this.prisma.client.retailDrawerCashOut.aggregate({
        where: { accountId, retailShiftId: sessionId, state: 'posted', deletedAt: null },
        _sum: { sumMinor: true },
      }),
    ]);

    const cashInputs: ShiftCashInputs = {
      openingCashMinor: session.openingCashMinor,
      salesCashMinor: cashAgg._sum.cashAmountMinor ?? 0n,
      drawerInMinor: drawerInAgg._sum.sumMinor ?? 0n,
      drawerOutMinor: drawerOutAgg._sum.sumMinor ?? 0n,
      returnsCashMinor: refundAgg._sum.cashAmountMinor ?? 0n,
    };
    const expectedCash = expectedCashMinor(cashInputs);
    const discrepancy = shiftDiscrepancyMinor(closingCash, cashInputs);

    // Atomic state guard: 'open' → 'closed'. Two concurrent close() calls would
    // otherwise both succeed (both reads see 'open', both updates target the
    // same id), with the second overwriting closingCash/expected/discrepancy
    // computed from a stale aggregate read. updateMany returns count=0 if the
    // session has already been closed by a peer.
    const flipResult = await this.prisma.client.cashierSession.updateMany({
      where: { id: sessionId, accountId, state: 'open' },
      data: {
        state: 'closed',
        closedAt: new Date(),
        closingCashMinor: closingCash,
        expectedCashMinor: expectedCash,
        discrepancyMinor: discrepancy,
        // Persist the close-time note only when supplied — a non-
        // destructive conditional set (codebase-wide convention) so a
        // close without a note keeps the open-time description (§24).
        ...(parsed.description != null ? { description: parsed.description } : {}),
      },
    });
    if (flipResult.count === 0) {
      throw new ConflictException(
        `Session ${sessionId} state changed; close aborted (already closed?)`,
      );
    }
    return this.prisma.client.cashierSession.findUniqueOrThrow({
      where: { id: sessionId, accountId },
      include: {
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
  }

  // ---- Drawer cash in/out (Внесение / Изъятие) — §100/§101 ----

  /**
   * Shared guard for drawer operations: the shift must exist, be OPEN,
   * and belong to the acting cashier. Returns the session (with cashDesk
   * currency) so the drawer doc is recorded in the till's currency.
   */
  private async loadOpenShiftForDrawer(accountId: string, cashierId: string, sessionId: string) {
    const session = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId },
      include: { cashDesk: { select: { currency: true } } },
    });
    if (!session) throw new NotFoundException(`CashierSession ${sessionId} not found`);
    if (session.state !== 'open') {
      throw new BadRequestException(
        `Shift is ${session.state}; drawer cash operations require an OPEN shift`,
      );
    }
    if (session.cashierId !== cashierId) {
      throw new BadRequestException(
        'Only the cashier who opened the shift can perform drawer operations',
      );
    }
    return session;
  }

  /** Внесение наличных — add cash to the drawer during an open shift. */
  async drawerCashIn(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = DrawerCashSchema.parse(raw);
    const session = await this.loadOpenShiftForDrawer(accountId, cashierId, sessionId);
    const year = new Date().getFullYear();
    const prefix = `ВН-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailDrawerCashIn.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);
    return this.prisma.client.retailDrawerCashIn.create({
      data: {
        accountId,
        ownerId: cashierId,
        groupId: creatorGroupId,
        name,
        retailShiftId: sessionId,
        organizationId: session.organizationId,
        sumMinor: BigInt(parsed.sumMinor),
        currency: session.cashDesk.currency,
        moment: new Date(),
        applicable: true,
        state: 'posted',
        postedAt: new Date(),
        description: parsed.description ?? null,
      },
    });
  }

  /** Изъятие наличных — remove cash from the drawer during an open shift. */
  async drawerCashOut(accountId: string, cashierId: string, sessionId: string, raw: unknown) {
    const parsed = DrawerCashSchema.parse(raw);
    const session = await this.loadOpenShiftForDrawer(accountId, cashierId, sessionId);
    const year = new Date().getFullYear();
    const prefix = `ИЗ-${year}-`;
    const n = await allocateDocumentNumber(this.prisma.client, accountId, prefix, async () => {
      const last = await this.prisma.client.retailDrawerCashOut.findFirst({
        where: { accountId, name: { startsWith: prefix } },
        orderBy: { name: 'desc' },
        select: { name: true },
      });
      return last ? Number.parseInt(last.name.slice(prefix.length), 10) || 0 : 0;
    });
    const name = `${prefix}${String(n).padStart(5, '0')}`;
    const creatorGroupId = await resolveCreatorGroupId(this.prisma.client, accountId, cashierId);
    return this.prisma.client.retailDrawerCashOut.create({
      data: {
        accountId,
        ownerId: cashierId,
        groupId: creatorGroupId,
        name,
        retailShiftId: sessionId,
        organizationId: session.organizationId,
        sumMinor: BigInt(parsed.sumMinor),
        currency: session.cashDesk.currency,
        moment: new Date(),
        applicable: true,
        state: 'posted',
        postedAt: new Date(),
        description: parsed.description ?? null,
      },
    });
  }

  /** All posted drawer Внесение/Изъятие for a shift (session detail + Z). */
  async listDrawerOps(accountId: string, sessionId: string) {
    const [cashIn, cashOut] = await Promise.all([
      this.prisma.client.retailDrawerCashIn.findMany({
        where: { accountId, retailShiftId: sessionId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, sumMinor: true, description: true, createdAt: true },
      }),
      this.prisma.client.retailDrawerCashOut.findMany({
        where: { accountId, retailShiftId: sessionId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, sumMinor: true, description: true, createdAt: true },
      }),
    ]);
    return { cashIn, cashOut };
  }

  // ---- Private helpers ----

  private async ensureCashDesk(accountId: string, id: string) {
    const row = await this.prisma.client.cashDesk.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`CashDesk ${id} not found`);
    return row;
  }

  private async ensureStore(accountId: string, id: string) {
    const row = await this.prisma.client.store.findFirst({ where: { id, accountId } });
    if (!row) throw new NotFoundException(`Store ${id} not found`);
    return row;
  }

  private async ensureOrganization(accountId: string, id: string) {
    const row = await this.prisma.client.organization.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException(`Organization ${id} not found`);
    return row;
  }
}
