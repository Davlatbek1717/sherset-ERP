import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { type CounterpartyActInput, CounterpartyActSchema } from './counterparty-act.schema.js';
import { reportDateBounds } from './report-date-bounds.util.js';

/** A single movement line in the act (one posted balance-affecting document). */
export interface CounterpartyActRow {
  /** Document moment (ISO). */
  date: Date;
  /** Document-type key — the FE maps it to «Счёт покупателю» / «Входящий платёж» / … */
  typeKey: string;
  /** Document number («СЧ-2026-00001»). */
  number: string;
  /** Tiyin string — increase of the counterparty's debt to us (our shipments/invoices). */
  debitMinor: string;
  /** Tiyin string — decrease of that debt (their payments to us). */
  creditMinor: string;
}

export interface CounterpartyActReport {
  organization: PartyInfo;
  counterparty: PartyInfo;
  contract: { id: string; name: string } | null;
  from: Date | null;
  to: Date;
  currency: string;
  /** Signed opening balance at period start (positive = counterparty owes us). */
  openingMinor: string;
  /** Signed closing balance at period end. */
  closingMinor: string;
  /** Period turnover. */
  totalDebitMinor: string;
  totalCreditMinor: string;
  rows: CounterpartyActRow[];
}

interface PartyInfo {
  id: string;
  name: string;
  legalTitle: string | null;
  legalAddress: string | null;
  inn: string | null;
}

/**
 * Minimal structural shape shared by the eight fixed-sign money-doc delegates
 * (distinct Prisma models, identical here) so they can be looped over.
 */
type MoneyDoc = { name: string; moment: Date; sumMinor: bigint };
type MoneyDelegate = {
  findMany(args: {
    where: Record<string, unknown>;
    select: { name: true; moment: true; sumMinor: true };
  }): Promise<MoneyDoc[]>;
};

@Injectable()
export class CounterpartyActService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Assemble the «Акт сверки взаимных расчётов» — the chronological ledger of
   * posted balance-affecting documents between one organization and one
   * counterparty over a period, with an opening + closing balance.
   *
   * Debit (our books): documents that grow the counterparty's debt to us —
   * the +sign docs (InvoiceOut, PaymentOut, CashOut, PrepaymentReturn,
   * Adjustment INCREASE). Credit: the −sign docs that shrink it (InvoiceIn,
   * PaymentIn, CashIn, Prepayment, Adjustment DECREASE). This is exactly the
   * sign convention `CounterpartyBalanceService.applyDelta` uses, so the
   * closing balance equals the materialized balance when `to` is now.
   */
  async counterpartyAct(accountId: string, raw: unknown): Promise<CounterpartyActReport> {
    const input = this.parse(raw);
    const { organizationId, counterpartyId, contractId, currency } = input;
    const to = input.to ?? new Date();
    // Half-open Tashkent window. `gte` is the period start; `lt` is the exclusive
    // upper bound for `to`. With no `from`, opening is 0 and everything ≤ `to` is in-period.
    const { gte, lt } = reportDateBounds(input.from ?? new Date(0), to);
    const periodStart = input.from ? gte : null;

    const [org, cp, contract] = await Promise.all([
      this.prisma.client.organization.findFirst({
        where: { id: organizationId, accountId },
        select: { id: true, name: true, legalTitle: true, legalAddress: true, uzRequisites: true },
      }),
      this.prisma.client.counterparty.findFirst({
        where: { id: counterpartyId, accountId },
        select: { id: true, name: true, legalTitle: true, legalAddress: true, uzRequisites: true },
      }),
      contractId
        ? this.prisma.client.contract.findFirst({
            where: { id: contractId, accountId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    if (!org) throw new BadRequestException('Organization not found');
    if (!cp) throw new BadRequestException('Counterparty not found');

    const baseWhere = {
      accountId,
      organizationId,
      agentId: counterpartyId,
      currency,
      applicable: true,
      deletedAt: null,
      ...(contractId ? { contractId } : {}),
      moment: { lt },
    };
    const c = this.prisma.client;
    // 8 fixed-sign doc types (+1 = debit / grows their debt, −1 = credit / shrinks it).
    const fixed: Array<{ typeKey: string; model: MoneyDelegate; sign: 1 | -1 }> = [
      { typeKey: 'invoiceOut', model: c.invoiceOut as unknown as MoneyDelegate, sign: 1 },
      { typeKey: 'paymentOut', model: c.paymentOut as unknown as MoneyDelegate, sign: 1 },
      { typeKey: 'cashOut', model: c.cashOut as unknown as MoneyDelegate, sign: 1 },
      {
        typeKey: 'prepaymentReturn',
        model: c.prepaymentReturn as unknown as MoneyDelegate,
        sign: 1,
      },
      { typeKey: 'invoiceIn', model: c.invoiceIn as unknown as MoneyDelegate, sign: -1 },
      { typeKey: 'paymentIn', model: c.paymentIn as unknown as MoneyDelegate, sign: -1 },
      { typeKey: 'cashIn', model: c.cashIn as unknown as MoneyDelegate, sign: -1 },
      { typeKey: 'prepayment', model: c.prepayment as unknown as MoneyDelegate, sign: -1 },
    ];

    let opening = 0n;
    let totalDebit = 0n;
    let totalCredit = 0n;
    const rows: CounterpartyActRow[] = [];

    const consume = (typeKey: string, doc: MoneyDoc, sign: 1 | -1) => {
      const signed = BigInt(sign) * doc.sumMinor;
      if (periodStart && doc.moment < periodStart) {
        opening += signed;
        return;
      }
      const debit = sign > 0 ? doc.sumMinor : 0n;
      const credit = sign < 0 ? doc.sumMinor : 0n;
      totalDebit += debit;
      totalCredit += credit;
      rows.push({
        date: doc.moment,
        typeKey,
        number: doc.name,
        debitMinor: debit.toString(),
        creditMinor: credit.toString(),
      });
    };

    const fixedResults = await Promise.all(
      fixed.map(async (f) => ({
        f,
        docs: await f.model.findMany({
          where: baseWhere,
          select: { name: true, moment: true, sumMinor: true },
        }),
      })),
    );
    for (const { f, docs } of fixedResults) {
      for (const doc of docs) consume(f.typeKey, doc, f.sign);
    }

    // Adjustments carry their own sign via `direction` (INCREASE = +1, DECREASE = −1).
    const adjustments = await c.counterpartyAdjustment.findMany({
      where: baseWhere,
      select: { name: true, moment: true, sumMinor: true, direction: true },
    });
    for (const a of adjustments) {
      consume('counterpartyAdjustment', a, a.direction === 'INCREASE' ? 1 : -1);
    }

    rows.sort((x, y) => x.date.getTime() - y.date.getTime());
    const closing = opening + totalDebit - totalCredit;

    return {
      organization: this.toParty(org),
      counterparty: this.toParty(cp),
      contract: contract ? { id: contract.id, name: contract.name } : null,
      from: input.from ?? null,
      to,
      currency,
      openingMinor: opening.toString(),
      closingMinor: closing.toString(),
      totalDebitMinor: totalDebit.toString(),
      totalCreditMinor: totalCredit.toString(),
      rows,
    };
  }

  private toParty(p: {
    id: string;
    name: string;
    legalTitle: string | null;
    legalAddress: string | null;
    uzRequisites: unknown;
  }): PartyInfo {
    const inn =
      p.uzRequisites && typeof p.uzRequisites === 'object' && 'inn' in p.uzRequisites
        ? String((p.uzRequisites as { inn?: unknown }).inn ?? '') || null
        : null;
    return {
      id: p.id,
      name: p.name,
      legalTitle: p.legalTitle,
      legalAddress: p.legalAddress,
      inn,
    };
  }

  private parse(raw: unknown): CounterpartyActInput {
    const r = CounterpartyActSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
