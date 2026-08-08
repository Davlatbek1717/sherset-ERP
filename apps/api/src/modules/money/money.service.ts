import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MoneySourceKind = 'organization_account' | 'cash_desk';

export interface MoneyDelta {
  sourceKind: MoneySourceKind;
  sourceId: string;
  /** Signed minor-unit amount — positive for inflow, negative for outflow. */
  deltaMinor: bigint;
  currency: string;
  documentKind: string;
  documentId: string;
  counterpartyId?: string;
  description?: string;
  /**
   * Skip the post-increment overdraft guard for THIS delta (Faza 11, `M-06`).
   *
   * The guard encodes a cash-drawer rule: you cannot hand out banknotes you do
   * not physically have, and `CashDesk.balanceMinor` is trustworthy because
   * every till movement has always gone through this ledger.
   * `OrganizationAccount.balanceMinor` has the opposite history — until Faza 11
   * NOTHING ever wrote it, so a stored `0` means «never measured», not «no
   * funds». Enforcing the guard on the very first bank payment would reject a
   * legitimate transfer out of an account that really holds money. Bank
   * accounts also go legitimately negative (overdraft / credit line), which a
   * till never does.
   *
   * Opt-in per delta, never a service-wide switch: the cash-desk callers stay
   * guarded. Once opening balances are captured (bank-statement import), the
   * payment call sites can drop the flag.
   */
  allowNegative?: boolean;
}

/**
 * MoneyService — the money-side counterpart of StockService. Posts/unposts
 * append MoneyOperation entries and update the materialized balance on the
 * source (OrganizationAccount.balanceMinor or CashDesk.balanceMinor).
 *
 * All writes MUST be called from within a $transaction started by the caller
 * (CashIn/Out, RetailSale) — the overdraft guard throws AFTER the balance has
 * been incremented and relies on that transaction to roll it back. The balance
 * move itself is an atomic increment, so ReadCommitted is enough; Serializable
 * (which the money documents use since Faza 1) is fine too. Cross-document
 * ordering is enforced by ordering deltas by sourceKind+sourceId ascending, so
 * bulk posts don't deadlock.
 */
@Injectable()
export class MoneyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Apply signed deltas atomically: validate the source (tenant + currency),
   * move the materialized balance with an ATOMIC increment (`SET x = x + d`,
   * which takes the Postgres row lock for the rest of the transaction), then
   * check the POST-increment balance for overdraft and write the ledger entry.
   *
   * The overdraft check must read AFTER the increment: reading before it is a
   * read-then-write race (M-02) — two concurrent outflows would both see the
   * old balance, both pass the guard and both write, driving the balance
   * negative and away from the ledger sum. On overdraft we throw, and the
   * caller's `$transaction` rolls the increment back.
   */
  async applyDeltas(
    tx: Prisma.TransactionClient,
    accountId: string,
    deltas: MoneyDelta[],
  ): Promise<void> {
    if (deltas.length === 0) return;

    const sorted = [...deltas].sort((a, b) => {
      const k = a.sourceKind.localeCompare(b.sourceKind);
      if (k !== 0) return k;
      return a.sourceId.localeCompare(b.sourceId);
    });

    const now = new Date();
    for (const d of sorted) {
      if (d.sourceKind === 'organization_account') {
        // Unlocked pre-read — existence / tenant / currency only. The balance
        // it returns is NEVER used for the write (see the increment below).
        const row = await tx.organizationAccount.findUnique({
          where: { id: d.sourceId },
          select: { accountId: true, currency: true },
        });
        if (!row) throw new BadRequestException(`OrganizationAccount ${d.sourceId} not found`);
        if (row.accountId !== accountId) {
          throw new BadRequestException(
            `OrganizationAccount ${d.sourceId} belongs to another tenant`,
          );
        }
        if (row.currency !== d.currency) {
          throw new BadRequestException(
            `Currency mismatch: account ${row.currency} vs delta ${d.currency}`,
          );
        }
        const updated = await tx.organizationAccount.update({
          where: { id: d.sourceId },
          data: { balanceMinor: { increment: d.deltaMinor } },
          select: { balanceMinor: true },
        });
        if (updated.balanceMinor < 0n && !d.allowNegative) {
          throw new BadRequestException(
            `OrganizationAccount ${d.sourceId} overdraft: delta ${d.deltaMinor} → balance ${updated.balanceMinor}`,
          );
        }
      } else {
        const row = await tx.cashDesk.findUnique({
          where: { id: d.sourceId },
          select: { accountId: true, currency: true },
        });
        if (!row) throw new BadRequestException(`CashDesk ${d.sourceId} not found`);
        if (row.accountId !== accountId) {
          throw new BadRequestException(`CashDesk ${d.sourceId} belongs to another tenant`);
        }
        if (row.currency !== d.currency) {
          throw new BadRequestException(
            `Currency mismatch: cash-desk ${row.currency} vs delta ${d.currency}`,
          );
        }
        const updated = await tx.cashDesk.update({
          where: { id: d.sourceId },
          data: { balanceMinor: { increment: d.deltaMinor } },
          select: { balanceMinor: true },
        });
        if (updated.balanceMinor < 0n && !d.allowNegative) {
          throw new BadRequestException(
            `CashDesk ${d.sourceId} overdraft: delta ${d.deltaMinor} → balance ${updated.balanceMinor}`,
          );
        }
      }

      await tx.moneyOperation.create({
        data: {
          accountId,
          at: now,
          organizationAccountId: d.sourceKind === 'organization_account' ? d.sourceId : null,
          cashDeskId: d.sourceKind === 'cash_desk' ? d.sourceId : null,
          deltaMinor: d.deltaMinor,
          currency: d.currency,
          documentKind: d.documentKind,
          documentId: d.documentId,
          counterpartyId: d.counterpartyId,
          description: d.description,
        },
      });
    }
  }

  /**
   * Read the current balance of a money source. Reads the materialized
   * column directly — no scan of the ledger needed.
   */
  async getBalance(
    accountId: string,
    kind: MoneySourceKind,
    id: string,
  ): Promise<{ balanceMinor: string; currency: string } | null> {
    if (kind === 'organization_account') {
      const row = await this.prisma.client.organizationAccount.findFirst({
        where: { id, accountId },
        select: { balanceMinor: true, currency: true },
      });
      return row ? { balanceMinor: row.balanceMinor.toString(), currency: row.currency } : null;
    }
    const row = await this.prisma.client.cashDesk.findFirst({
      where: { id, accountId },
      select: { balanceMinor: true, currency: true },
    });
    return row ? { balanceMinor: row.balanceMinor.toString(), currency: row.currency } : null;
  }
}
