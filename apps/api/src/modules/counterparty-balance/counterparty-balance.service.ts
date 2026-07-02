import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Atomically adjust a counterparty×currency balance. Must be called from
   * within the caller's $transaction. Uses an upsert so the row is created
   * on first touch.
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    accountId: string,
    counterpartyId: string,
    currency: string,
    deltaMinor: bigint,
  ): Promise<void> {
    if (deltaMinor === 0n) return;
    if (currency.length !== 3) {
      throw new BadRequestException(`Invalid currency code: "${currency}"`);
    }
    await tx.counterpartyBalance.upsert({
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
    });
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
