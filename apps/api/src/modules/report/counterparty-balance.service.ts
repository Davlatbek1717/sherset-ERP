import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type CounterpartyBalanceFilterInput,
  CounterpartyBalanceFilterSchema,
} from './counterparty-balance.schema.js';
import {
  CurrencyTally,
  type RateContext,
  type UnconvertedAmount,
  consolidateToBase,
  loadRateContext,
} from './report-rate-ctx.util.js';

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
  /** Filtrga mos qatorlarning to'liq soni (`take` dan oldingi). */
  total: number;
  /**
   * `true` ⇒ ko'rsatilgan sahifadan tashqarida yana qator bor. `summaries`
   * BARIBIR butun filtr bo'yicha (`PERF-04`) — bayroq faqat ro'yxat haqida.
   */
  truncated: boolean;
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
    /**
     * M-12: kursi yo'q valyutadagi qoldiq jamiga QO'SHILMAYDI — shu yerda
     * o'z valyutasida alohida qaytadi.
     */
    unconvertedByCurrency: UnconvertedAmount[];
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
    const where = this.buildWhere(accountId, filter);

    const [balances, total, aggregate] = await Promise.all([
      this.prisma.client.counterpartyBalance.findMany({
        where,
        orderBy: [{ balanceMinor: 'desc' }],
        take: filter.limit,
        include: {
          counterparty: {
            select: { id: true, name: true, legalTitle: true, companyType: true, archived: true },
          },
        },
      }),
      this.prisma.client.counterpartyBalance.count({ where }),
      this.aggregateSummaries(filter, where, ctx),
    ]);

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

    if (filter.groupBy === 'counterparty') {
      // Ko'rinish uchun yig'ish. Tally ATAYLAB bir martalik: `unconvertedByCurrency`
      // endi butun-scope agregatidan keladi, shu tally'ni qo'shsak M-12 qoldig'i
      // ikki marta sanalardi.
      items = this.collapseByCounterparty(items, ctx, new CurrencyTally());
    }

    return {
      filter,
      items,
      total,
      truncated: total > balances.length,
      summaries: { ...aggregate, rowCount: total },
    };
  }

  /**
   * `PERF-04` / `DUP-14` — bitta `where`, uchta o'quvchi (ro'yxat, count,
   * agregat).
   *
   * Ilgari qidiruv/arxiv filtri `counterparty.findMany({take:5000})` bilan
   * ID-ro'yxatga aylantirilardi: 5000 dan ortiq kontragentli akkauntda
   * qolganlari hisobotdan JIMGINA (xatosiz, ogohlantirishsiz) tushib qolardi,
   * ustiga IN(5000 uuid) planner uchun og'ir edi. Endi bu Prisma relation-filtri
   * — Postgres tomonida JOIN'ga kompilyatsiya bo'ladi, chegara kerak emas.
   */
  private buildWhere(
    accountId: string,
    filter: CounterpartyBalanceFilterInput,
  ): Prisma.CounterpartyBalanceWhereInput {
    const cp: Prisma.CounterpartyWhereInput = {};
    if (filter.includeArchived !== true) cp.archived = false;
    if (filter.search) {
      cp.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { legalTitle: { contains: filter.search, mode: 'insensitive' } },
        { code: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    const hasCpFilter = Object.keys(cp).length > 0;
    // Tenant-guard'ni relation tomonida ham saqlaymiz (eski pre-fetch shunday
    // qilardi) — lekin faqat JOIN allaqachon kerak bo'lganda.
    if (hasCpFilter) cp.accountId = accountId;

    return {
      accountId,
      ...(filter.counterpartyId ? { counterpartyId: filter.counterpartyId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(hasCpFilter ? { counterparty: cp } : {}),
      ...this.signWhere(filter.signFilter),
    };
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
      // `all` falls through to the default (no filter) — listing it separately
      // added nothing but a lint error.
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
    seen: CurrencyTally,
  ): CounterpartyBalanceRow[] {
    const byCp = new Map<string, CounterpartyBalanceRow[]>();
    for (const r of rows) {
      const arr = byCp.get(r.counterpartyId) ?? [];
      arr.push(r);
      byCp.set(r.counterpartyId, arr);
    }
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

  /**
   * `PERF-04` — jamilar BUTUN `where` ustidan hisoblanadi.
   *
   * Ilgari ular sahifadagi (`take: limit`, `balanceMinor desc`) qatorlardan
   * yig'ilardi. Dashboard buni `limit: 500` bilan chaqiradi, ya'ni nolinchi
   * bo'lmagan balans 500 dan oshgan zahoti «Задолженность» kartochkasi kichik
   * qarzlarni yo'qotardi va egasi noto'g'ri umumiy qarz raqamini ko'rardi —
   * xato indikatorisiz. Kodning o'zi buni `V2 follow-up` deb tan olgan edi.
   *
   * Endi ikkita SQL-agregat (debet/kredit kesimi, valyuta bo'yicha GROUP BY):
   * cardinality = akkauntdagi valyutalar soni, ya'ni amalda 1–3 qator.
   */
  private async aggregateSummaries(
    filter: CounterpartyBalanceFilterInput,
    where: Prisma.CounterpartyBalanceWhereInput,
    ctx: RateContext,
  ): Promise<Omit<CounterpartyBalanceReport['summaries'], 'rowCount'>> {
    const tally = new CurrencyTally();
    const [debit, credit] = await Promise.all([
      this.aggregateBySign(where, 'debit'),
      this.aggregateBySign(where, 'credit'),
    ]);

    let totalDebt = 0n;
    let totalCredit = 0n;
    let debtorCount = 0;
    let creditorCount = 0;
    for (const r of debit) {
      // Consolidate to base before summing — without this a USD balance's
      // cents were added to UZS tiyin. Sign is preserved by the positive-scale
      // conversion, so debtor/creditor classification holds.
      totalDebt += consolidateToBase(r._sum.balanceMinor ?? 0n, r.currency, ctx, tally);
      debtorCount += r._count._all;
    }
    for (const r of credit) {
      totalCredit += -consolidateToBase(r._sum.balanceMinor ?? 0n, r.currency, ctx, tally);
      creditorCount += r._count._all;
    }

    // `groupBy=counterparty` da qatorlar kontragent bo'yicha yig'iladi, ya'ni
    // bir kontragentning + va − qatorlari BIR-BIRINI YEYDI. Valyuta bitta
    // bo'lsa `@@unique([counterpartyId, currency])` tufayli har kontragentda
    // bitta qator bo'ladi ⇒ yig'ish AYNIYAT, arzon yo'l to'g'ri javob beradi.
    // Faqat ko'p-valyutali scope'da qimmatroq kontragent-kesim kerak bo'ladi.
    if (filter.groupBy === 'counterparty' && tally.mixed) {
      return this.aggregateByCounterparty(where, ctx);
    }

    return {
      debtorCount,
      creditorCount,
      totalDebtMinor: totalDebt.toString(),
      totalCreditMinor: totalCredit.toString(),
      netMinor: (totalDebt - totalCredit).toString(),
      currency: ctx.baseCode,
      mixedCurrency: tally.mixed,
      unconvertedByCurrency: tally.unconvertedRows(),
    };
  }

  /** Debet (balans > 0) yoki kredit (balans < 0) kesimi, valyuta bo'yicha. */
  private aggregateBySign(where: Prisma.CounterpartyBalanceWhereInput, side: 'debit' | 'credit') {
    return this.prisma.client.counterpartyBalance.groupBy({
      by: ['currency'],
      // `AND` bilan birikadi, `where` ni USTIGA YOZILMAYDI: `signFilter`
      // allaqachon `balanceMinor` shartini qo'ygan bo'lishi mumkin va uni
      // almashtirish «creditors» so'roviga debitorlarni oqizardi.
      where: { AND: [where, { balanceMinor: side === 'debit' ? { gt: 0 } : { lt: 0 } }] },
      _sum: { balanceMinor: true },
      _count: { _all: true },
    });
  }

  /**
   * Ko'p-valyutali `groupBy=counterparty` uchun: har kontragentning bazaga
   * keltirilgan SOF qoldig'i bo'yicha debitor/kreditor tasnifi. Cardinality =
   * scope'dagi (kontragent × valyuta) qatorlar soni, lekin bu faqat ikki
   * baravar kam ma'lumot (`counterpartyId`, `currency`, sum) — sahifa uchun
   * `include: counterparty` bilan tortiladigan qatorlardan yengil.
   */
  private async aggregateByCounterparty(
    where: Prisma.CounterpartyBalanceWhereInput,
    ctx: RateContext,
  ): Promise<Omit<CounterpartyBalanceReport['summaries'], 'rowCount'>> {
    const tally = new CurrencyTally();
    const rows = await this.prisma.client.counterpartyBalance.groupBy({
      by: ['counterpartyId', 'currency'],
      where,
      _sum: { balanceMinor: true },
    });

    const net = new Map<string, bigint>();
    for (const r of rows) {
      const v = consolidateToBase(r._sum.balanceMinor ?? 0n, r.currency, ctx, tally);
      net.set(r.counterpartyId, (net.get(r.counterpartyId) ?? 0n) + v);
    }

    let totalDebt = 0n;
    let totalCredit = 0n;
    let debtorCount = 0;
    let creditorCount = 0;
    for (const v of net.values()) {
      if (v > 0n) {
        totalDebt += v;
        debtorCount++;
      } else if (v < 0n) {
        totalCredit += -v;
        creditorCount++;
      }
    }

    return {
      debtorCount,
      creditorCount,
      totalDebtMinor: totalDebt.toString(),
      totalCreditMinor: totalCredit.toString(),
      netMinor: (totalDebt - totalCredit).toString(),
      currency: ctx.baseCode,
      mixedCurrency: tally.mixed,
      unconvertedByCurrency: tally.unconvertedRows(),
    };
  }

  private parseFilter(raw: unknown): CounterpartyBalanceFilterInput {
    const r = CounterpartyBalanceFilterSchema.safeParse(raw);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    return r.data;
  }
}
