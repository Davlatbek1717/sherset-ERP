import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CounterpartyBalanceChangeSource,
  type CounterpartyBalanceChangedEvent,
  HR_EVENT,
} from '../hr/hr-shared/hr-events.types.js';

/**
 * Optional per-call metadata so applyDelta can emit a domain event that carries
 * WHICH document moved the balance. applyDelta itself has no knowledge of the
 * source — each caller passes it. Kept optional so the ~40 existing call sites
 * (unpost/cancel/rebalance/adjustment/prepayment) compile unchanged and emit
 * with `source: undefined` → the owner debt notifier no-ops on them.
 */
export interface ApplyDeltaMeta {
  source?: CounterpartyBalanceChangeSource;
  docType?: string;
  docId?: string;
}

/**
 * Sign convention mirrors moysklad.uz's "Баланс":
 *   positive → counterparty OWES us   (they're a debtor)
 *   negative → we OWE the counterparty (we're a debtor)
 *
 * Document semantics (what each post does to the balance):
 *   - InvoiceOut.post   → +sumMinor  (we billed them; they owe us)
 *   - InvoiceIn.post    → −sumMinor  (they billed us; we owe them)
 *   - PaymentIn.post    → −sumMinor  (they paid us; debt shrinks)
 *   - PaymentOut.post   → +sumMinor  (we paid them; our debt shrinks)
 *   - CashIn.post       → −sumMinor  (cash from counterparty ~ PaymentIn)
 *   - CashOut.post      → +sumMinor  (cash to counterparty ~ PaymentOut)
 *   - Unpost / cancel reverse the sign of the delta that was applied.
 *
 * Callers pass the PRE-SIGNED delta; this service just applies it.
 */
@Injectable()
export class CounterpartyBalanceService {
  private readonly logger = new Logger(CounterpartyBalanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  /**
   * Atomically adjust a counterparty×currency balance. Must be called from
   * within the caller's $transaction. Uses an upsert so the row is created
   * on first touch.
   *
   * After the upsert we emit a COUNTERPARTY_BALANCE_CHANGED domain event
   * carrying the delta + the NEW balance (read back from the upsert). The emit
   * is wrapped in try/catch and listeners are strictly out-of-band
   * ({ async, promisify }), so a failing/throwing listener can NEVER break the
   * caller's transaction. NOTE: this runs pre-commit (inside the caller's tx);
   * on a later rollback the notification is a harmless phantom — the spec
   * explicitly permits "event commit-dan keyin, yoki try/catch".
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    counterpartyId: string,
    currency: string,
    deltaMinor: bigint,
    meta?: ApplyDeltaMeta,
  ): Promise<void> {
    if (deltaMinor === 0n) return;
    if (currency.length !== 3) {
      throw new BadRequestException(`Invalid currency code: "${currency}"`);
    }
    const row = await tx.counterpartyBalance.upsert({
      where: {
        counterpartyId_currency: { counterpartyId, currency },
      },
      create: {
        accountId,
        counterpartyId,
        currency,
        balanceMinor: deltaMinor,
      },
      update: {
        balanceMinor: { increment: deltaMinor },
      },
      select: { balanceMinor: true },
    });

    try {
      const payload: CounterpartyBalanceChangedEvent = {
        accountId,
        counterpartyId,
        currency,
        deltaMinor,
        newBalanceMinor: row.balanceMinor,
        source: meta?.source,
        docType: meta?.docType,
        docId: meta?.docId,
      };
      this.events.emit(HR_EVENT.COUNTERPARTY_BALANCE_CHANGED, payload);
    } catch (e) {
      this.logger.warn(`balance-changed emit failed: ${(e as Error).message}`);
    }
  }

  /**
   * List all non-zero balances for a counterparty. Used by Counterparty
   * findById to render the Balance card.
   */
  async listForCounterparty(
    accountId: string,
    counterpartyId: string,
  ): Promise<Array<{ currency: string; balanceMinor: string; updatedAt: Date }>> {
    const rows = await this.prisma.client.counterpartyBalance.findMany({
      where: {
        accountId,
        counterpartyId,
      },
      orderBy: { currency: 'asc' },
      select: { currency: true, balanceMinor: true, updatedAt: true },
    });
    return rows.map((r) => ({
      currency: r.currency,
      balanceMinor: r.balanceMinor.toString(),
      updatedAt: r.updatedAt,
    }));
  }
}
