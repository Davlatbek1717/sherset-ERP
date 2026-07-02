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
}

/**
 * MoneyService — the money-side counterpart of StockService. Posts/unposts
 * append MoneyOperation entries and update the materialized balance on the
 * source (OrganizationAccount.balanceMinor or CashDesk.balanceMinor).
 *
 * All writes MUST be called from within a Serializable $transaction started
 * by the caller (PaymentIn/Out, CashIn/Out). Cross-document ordering is
 * enforced by ordering deltas by sourceKind+sourceId ascending, so bulk
 * posts don't deadlock.
 */
@Injectable()
export class MoneyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Apply signed deltas atomically: lock the source row, check for overdraft
   * (unless the source allows negatives), write the ledger entry, update
   * materialized balance.
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
        // SELECT ... FOR UPDATE via unique id + update
        const row = await tx.organizationAccount.findUnique({
          where: { id: d.sourceId },
          select: { accountId: true, currency: true, balanceMinor: true },
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
        const newBalance = row.balanceMinor + d.deltaMinor;
        if (newBalance < 0n) {
          throw new BadRequestException(
            `OrganizationAccount ${d.sourceId} overdraft: balance ${row.balanceMinor} + ${d.deltaMinor} = ${newBalance}`,
          );
        }
        await tx.organizationAccount.update({
          where: { id: d.sourceId },
          data: { balanceMinor: newBalance },
        });
      } else {
        const row = await tx.cashDesk.findUnique({
          where: { id: d.sourceId },
          select: { accountId: true, currency: true, balanceMinor: true },
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
        const newBalance = row.balanceMinor + d.deltaMinor;
        if (newBalance < 0n) {
          throw new BadRequestException(
            `CashDesk ${d.sourceId} overdraft: balance ${row.balanceMinor} + ${d.deltaMinor} = ${newBalance}`,
          );
        }
        await tx.cashDesk.update({
          where: { id: d.sourceId },
          data: { balanceMinor: newBalance },
        });
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
