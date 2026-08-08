import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  docKey,
  resolveBalanceDocs,
} from '../counterparty-balance/counterparty-balance-doc-resolver.js';
import { isOpeningEntry } from '../counterparty-balance/counterparty-balance-doc-types.js';
import {
  type DatedJournalEntry,
  foldJournalPeriod,
  listJournalEntries,
} from '../counterparty-balance/counterparty-balance-journal.util.js';
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

@Injectable()
export class CounterpartyActService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Assemble the «Акт сверки взаимных расчётов» — the chronological ledger of
   * balance-affecting movements between one organization and one counterparty
   * over a period, with an opening + closing balance.
   *
   * FAZA 10 (`DUP-06`) — MANBA O'ZGARDI: `CounterpartyBalanceEntry` jurnali.
   * Ilgari bu yerda 8 ta hujjat turining QATTIQ ro'yxati turardi
   * (invoiceOut/paymentOut/cashOut/prepaymentReturn/invoiceIn/paymentIn/cashIn/
   * prepayment + adjustment), va docstring «closing balance equals the
   * materialized balance» deb DA'VO qilardi. Ro'yxatda `supply`, `debt`
   * (QRZ- reyestri), `debtpayment` va `retailsale` (POS qarzga sotuv) YO'Q edi —
   * ya'ni yetkazib beruvchi va qarzdor mijoz uchun kontragentga IMZOGA
   * yuboriladigan rasmiy hujjat noto'g'ri yakuniy qoldiq ko'rsatardi.
   *
   * Endi qatorlar ham, qoldiq ham jurnal deltalaridan quriladi:
   *   delta > 0 → DEBET (kontragent qarzi oshdi) · delta < 0 → KREDIT.
   * Bu — `applyDelta` ning O'Z konvensiyasi, boshqa formula yo'q, shuning uchun
   * `to = hozir` bo'lganda closing == materiallashgan balans KONSTRUKSIYA
   * bo'yicha (invariant `balance-readers-invariant.test.ts` da qulflangan).
   * Hujjat raqami/sanasi `counterparty-balance-doc-resolver.ts` dan keladi:
   * u yerda tur qo'shilmagan bo'lsa qator RAQAMSIZ chiqadi — qoldiq baribir
   * to'g'ri qoladi (ataylab tanlangan degradatsiya yo'li).
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

    const c = this.prisma.client;
    const entries = await listJournalEntries(c.counterpartyBalanceEntry, {
      accountId,
      counterpartyId,
      currency,
      organizationId,
    });
    const resolved = await resolveBalanceDocs(c, accountId, entries);

    // Shartnoma filtri jurnalda YO'Q (delta shartnoma o'lchovini saqlamaydi) —
    // shuning uchun u hujjat darajasida qo'llanadi. Shartnomasi aniqlanmagan
    // qator (masalan Debt / POS cheki — ularda shartnoma tushunchasi yo'q)
    // filtr yoqilganda TASHLANADI: aks holda «shu shartnoma bo'yicha» degan
    // hujjatga tegishsiz harakat tushib ketardi.
    const dated: DatedJournalEntry[] = [];
    for (const e of entries) {
      const doc = resolved.get(docKey(e.docType, e.docId));
      if (contractId && !isOpeningEntry(e.docType) && doc?.contractId !== contractId) continue;
      dated.push({ ...e, docMoment: doc?.moment ?? null });
    }

    const folded = foldJournalPeriod(dated, periodStart, lt);
    const rows: CounterpartyActRow[] = folded.lines.map((e) => {
      const doc = resolved.get(docKey(e.docType, e.docId));
      const debit = e.deltaMinor > 0n ? e.deltaMinor : 0n;
      const credit = e.deltaMinor < 0n ? -e.deltaMinor : 0n;
      return {
        date: e.docMoment ?? e.createdAt,
        typeKey: e.docType,
        // Resolverda turi yo'q / hujjat o'chirilgan ⇒ raqamsiz qator (qoldiq to'g'ri).
        number: doc?.number ?? '—',
        debitMinor: debit.toString(),
        creditMinor: credit.toString(),
      };
    });

    return {
      organization: this.toParty(org),
      counterparty: this.toParty(cp),
      contract: contract ? { id: contract.id, name: contract.name } : null,
      from: input.from ?? null,
      to,
      currency,
      openingMinor: folded.openingMinor.toString(),
      closingMinor: folded.closingMinor.toString(),
      totalDebitMinor: folded.totalDebitMinor.toString(),
      totalCreditMinor: folded.totalCreditMinor.toString(),
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
