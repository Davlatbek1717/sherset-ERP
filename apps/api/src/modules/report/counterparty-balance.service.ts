import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CounterpartyBalanceFilterInput,
  CounterpartyBalanceFilterSchema,
} from './counterparty-balance.schema.js';
import { type RateContext, consolidateToBase, loadRateContext } from './report-rate-ctx.util.js';

export interface CounterpartyBalanceRow {
  counterpartyId: string;
  counterpartyName: string;
  legalTitle: string | null;
  companyType: string;
  currency: string;
  /** Materialized balance in tiyin (BigInt as string). Sign convention:
   * positive = counterparty owes us, negative = we owe counterparty. */
  balanceMinor: string;
  /** Same value with the sign always positive — useful for "amount" display. */
  amountAbsMinor: string;
  /** 'debtor' | 'creditor' | 'settled'. */
  side: 'debtor' | 'creditor' | 'settled';
  archived: boolean;
  /** When the materialized balance was last touched. */
  updatedAt: Date | null;
}

export interface CounterpartyBalanceReport {
  filter: CounterpartyBalanceFilterInput;
  items: CounterpartyBalanceRow[];
  total: number;
  summaries: {
    rowCount: number;
    debtorCount: number;
    creditorCount: number;
    /** Sum of positive balances (others owe us), tiyin string. */
    totalDebtMinor: string;
    /** Sum of |negative balances| (we owe), tiyin string. */
    totalCreditMinor: string;
    /** Net = totalDebt - totalCredit (tiyin string). */
    netMinor: string;
    /** Account base (валюта учёта) the totals are consolidated into. */
    currency: string;
    /** True when balances span >1 currency (totals are base-converted). */
    mixedCurrency: boolean;
  };
}

@Injectable()
export class CounterpartyBalanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async counterpartyBalanceReport(
    accountId: string,
    raw: unknown,
  ): Promise<CounterpartyBalanceReport> {
    const filter = this.parseFilter(raw);
    const ctx = await loadRateContext(this.prisma.client, accountId);

    // Pre-resolve counterpartyIds when search is set.
    let counterpartyIdFilter: { in: string[] } | undefined;
    if (filter.search || filter.includeArchived !== true) {
      const cpWhere: Prisma.CounterpartyWhereInput = {
        accountId,
        ...(filter.includeArchived === true ? {} : { archived: false }),
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { legalTitle: { contains: filter.search, mode: 'insensitive' } },
                { code: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const cps = await this.prisma.client.counterparty.findMany({
        where: cpWhere,
        select: { id: true },
        take: 5000,
      });
      counterpartyIdFilter = { in: cps.map((c) => c.id) };
      if (counterpartyIdFilter.in.length === 0) {
        return this.emptyReport(filter, ctx.baseCode);
      }
    }

    const where: Prisma.CounterpartyBalanceWhereInput = {
      accountId,
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(counterpartyIdFilter ? { counterpartyId: counterpartyIdFilter } : {}),
      ...this.signWhere(filter.signFilter),
    };

    const balances = await this.prisma.client.counterpartyBalance.findMany({
      where,
      orderBy: [{ balanceMinor: 'desc' }],
      take: filter.limit,
      include: {
        counterparty: {
          select: { id: true, name: true, legalTitle: true, companyType: true, archived: true },
        },
      },
    });

    let items: CounterpartyBalanceRow[] = balances.map((b) =>
      this.toRow(
        b.counterpartyId,
        b.counterparty.name,
        b.counterparty.legalTitle,
        b.counterparty.companyType,
        b.counterparty.archived,
        b.currency,
        b.balanceMinor,
        b.updatedAt,
      ),
    );

    // mixedCurrency reflects the raw scope (before any collapse), so the flag
    // survives the groupBy=counterparty path where rows are merged to base.
    const mixedCurrency = new Set(items.map((r) => r.currency)).size > 1;

    if (filter.groupBy === 'counterparty') {
      items = this.collapseByCounterparty(items, ctx);
    }

    const summaries = this.computeSummaries(items, ctx, mixedCurrency);
    const total = await this.prisma.client.counterpartyBalance.count({ where });

    return { filter, items, total, summaries };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private signWhere(
    sign: CounterpartyBalanceFilterInput['signFilter'],
  ): Prisma.CounterpartyBalanceWhereInput {
    switch (sign) {
      case 'debtors':
        return { balanceMinor: { gt: 0 } };
      case 'creditors':
        return { balanceMinor: { lt: 0 } };
      case 'nonzero':
        return { balanceMinor: { not: 0 } };
      case 'all':
      default:
        return {};
    }
  }

  private toRow(
    counterpartyId: string,
    counterpartyName: string,
    legalTitle: string | null,
    companyType: string,
    archived: boolean,
    currency: string,
    balanceMinor: bigint,
    updatedAt: Date | null,
  ): CounterpartyBalanceRow {
    const abs = balanceMinor < 0n ? -balanceMinor : balanceMinor;
    const side: CounterpartyBalanceRow['side'] =
      balanceMinor > 0n ? 'debtor' : balanceMinor < 0n ? 'creditor' : 'settled';
    return {
      counterpartyId,
      counterpartyName,
      legalTitle,
      companyType,
      currency,
      balanceMinor: balanceMinor.toString(),
      amountAbsMinor: abs.toString(),
      side,
      archived,
      updatedAt,
    };
  }

  /**
   * Sums balances per counterparty, consolidating each row to the account
   * base (валюта учёта) first — so a counterparty holding USD + UZS rows
   * yields a meaningful base total instead of adding raw USD-cent + UZS-tiyin.
   * The synthesized row's currency is therefore always the base code (the
   * amount is now expressed in base). For a single-currency tenant this is
   * the identity, so behaviour is unchanged for the 99% UZ case.
   */
  private collapseByCounterparty(
    rows: CounterpartyBalanceRow[],
    ctx: RateContext,
  ): CounterpartyBalanceRow[] {
    const byCp = new Map<string, CounterpartyBalanceRow[]>();
    for (const r of rows) {
      const arr = byCp.get(r.counterpartyId) ?? [];
      arr.push(r);
      byCp.set(r.counterpartyId, arr);
    }
    const seen = new Set<string>();
    const out: CounterpartyBalanceRow[] = [];
    for (const [, group] of byCp) {
      const first = group[0]!;
      let sum = 0n;
      let updatedAt: Date | null = null;
      for (const r of group) {
        sum += consolidateToBase(BigInt(r.balanceMinor), r.currency, ctx, seen);
        if (r.updatedAt && (!updatedAt || r.updatedAt > updatedAt)) updatedAt = r.updatedAt;
      }
      out.push(
        this.toRow(
          first.counterpartyId,
          first.counterpartyName,
          first.legalTitle,
          first.companyType,
          first.archived,
          ctx.baseCode,
          sum,
          updatedAt,
        ),
      );
    }
    // Re-sort by absolute amount descending so largest debts/credits surface first.
    out.sort((a, b) => {
      const ab = BigInt(a.amountAbsMinor);
      const bb = BigInt(b.amountAbsMinor);
      return ab > bb ? -1 : ab < bb ? 1 : 0;
    });
    return out;
  }

  private computeSummaries(
    items: CounterpartyBalanceRow[],
    ctx: RateContext,
    mixedCurrency: boolean,
  ): CounterpartyBalanceReport['summaries'] {
    let totalDebt = 0n;
    let totalCredit = 0n;
    let debtorCount = 0;
    let creditorCount = 0;
    const seen = new Set<string>();
    for (const r of items) {
      // Consolidate each row to base before summing — without this a USD
      // balance's cents were added to UZS tiyin. Sign is preserved by the
      // positive-scale conversion, so debtor/creditor classification holds.
      const v = consolidateToBase(BigInt(r.balanceMinor), r.currency, ctx, seen);
      if (v > 0n) {
        totalDebt += v;
        debtorCount++;
      } else if (v < 0n) {
        totalCredit += -v;
        creditorCount++;
      }
    }
    return {
      rowCount: items.length,
      debtorCount,
      creditorCount,
      totalDebtMinor: totalDebt.toString(),
      totalCreditMinor: totalCredit.toString(),
      netMinor: (totalDebt - totalCredit).toString(),
      currency: ctx.baseCode,
      mixedCurrency,
    };
  }

  private emptyReport(
    filter: CounterpartyBalanceFilterInput,
    baseCode: string,
  ): CounterpartyBalanceReport {
    return {
      filter,
      items: [],
      total: 0,
      summaries: {
        rowCount: 0,
        debtorCount: 0,
        creditorCount: 0,
        totalDebtMinor: '0',
        totalCreditMinor: '0',
        netMinor: '0',
        currency: baseCode,
        mixedCurrency: false,
      },
    };
  }

  private parseFilter(raw: unknown): CounterpartyBalanceFilterInput {
    const r = CounterpartyBalanceFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
