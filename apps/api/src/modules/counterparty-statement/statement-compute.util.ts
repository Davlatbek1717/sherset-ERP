/**
 * Pure reconciliation-statement computation (акт-сверка core). Takes the raw
 * balance-affecting documents for ONE counterparty and produces ordered ledger
 * lines with a running balance, per-side totals, turnover, and the final net
 * balance. No I/O — fully unit-testable; the service layer feeds it Prisma rows.
 *
 * Sign convention (mirrors CounterpartyBalanceService.applyDelta):
 *   balance = Σdebit − Σcredit ·  > 0 → counterparty owes us · < 0 → we owe them.
 *   DEBIT  docs (they owe us more / we paid them):
 *     invoiceOut, cashOut, paymentOut, prepaymentReturn, adjustmentIncrease
 *   CREDIT docs (we owe them more / they paid us):
 *     invoiceIn, supply, cashIn, paymentIn, prepayment, adjustmentDecrease, debtPayment
 *
 * 2026-07-28 — oxirgi 5 tur QO'SHILDI. Ular `applyDelta` ni chaqiradi, ya'ni
 * materiallashgan saldoga ta'sir qiladi, lekin akt-sverka agregatsiyasida yo'q
 * edi. Natijada aktning yakuniy qoldig'i kontragentning HAQIQIY saldosidan
 * farq qilardi — va aynan shu son mijozga «Sizda N so'm qarz bor» bo'lib
 * ketardi. Endi akt qatorlari ham yig'iladi, ham bosh daftarga mos keladi.
 */

export type StatementDocType =
  | 'invoiceOut'
  | 'invoiceIn'
  | 'supply'
  | 'cashIn'
  | 'cashOut'
  | 'paymentIn'
  | 'paymentOut'
  | 'prepayment'
  | 'prepaymentReturn'
  | 'adjustmentIncrease'
  | 'adjustmentDecrease'
  | 'debtPayment';

export interface StatementItem {
  /** Product/assortment display name. */
  name: string;
  /** Formatted quantity (e.g. "10" / "2.5"). */
  quantity: string;
  /** Unit price in tiyin. */
  priceMinor: bigint;
  /**
   * Chegirma foizi ("10", "12.5"). 2026-07-28 da qo'shildi: kontragent
   * qatorni ko'rib «bu narxga kelishmagandim» demasin — chegirma OCHIQ
   * ustunda turadi. Bo'lmasa/nol bo'lsa Excel'da «—» chiqadi.
   */
  discountPercent?: string;
  /** Line total in tiyin — CHEGIRMA VA QQS QO'LLANGANDAN KEYIN. */
  sumMinor: bigint;
}

export interface RawDoc {
  moment: Date;
  docType: StatementDocType;
  docNumber: string;
  sumMinor: bigint;
  /** Goods lines (empty for cash/payment docs). */
  items: StatementItem[];
}

export interface StatementLine extends RawDoc {
  side: 'debit' | 'credit';
  debitMinor: bigint;
  creditMinor: bigint;
  runningBalanceMinor: bigint;
}

export interface StatementData {
  lines: StatementLine[];
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  /** Total money that moved through the account (debit + credit). */
  turnoverMinor: bigint;
  /** Net: > 0 they owe us · < 0 we owe them · 0 settled. */
  finalBalanceMinor: bigint;
}

const DEBIT_TYPES: ReadonlySet<StatementDocType> = new Set<StatementDocType>([
  'invoiceOut',
  'cashOut',
  'paymentOut',
  // Avans qaytarilishi = pulni ularga qaytardik ⇒ qarzimiz kamayadi (+).
  'prepaymentReturn',
  // Qo'lda korrektirovka: INCREASE = ular bizga ko'proq qarzdor (+).
  'adjustmentIncrease',
]);

/** Human label per document type (Uzbek). */
export const DOC_TYPE_LABEL: Record<StatementDocType, string> = {
  invoiceOut: 'Sotuv',
  invoiceIn: 'Xarid',
  supply: 'Qabul',
  cashIn: "To'lov (kirim)",
  cashOut: "To'lov (chiqim)",
  paymentIn: "Bank to'lovi (kirim)",
  paymentOut: "Bank to'lovi (chiqim)",
  prepayment: 'Avans (olindi)',
  prepaymentReturn: 'Avans qaytarildi',
  adjustmentIncrease: 'Korrektirovka (+)',
  adjustmentDecrease: 'Korrektirovka (−)',
  debtPayment: "Qarz to'lovi",
};

/**
 * Chegirma foizi → katak matni. «10» → «10%», «12.50» → «12.5%», nol/yo'q → «—».
 * Ikkala Excel quruvchisi (akt-sverka «Batafsil» va qabul-tovarlari) shuni
 * ishlatadi — ustun bir xil o'qilsin.
 */
export function discountLabel(percent: string | undefined): string {
  const n = Number(percent ?? '0');
  if (!Number.isFinite(n) || n === 0) return '—';
  return `${String(Number(n.toFixed(4)))}%`;
}

/**
 * Build the reconciliation statement. Documents are sorted by `moment` (stable),
 * then a running balance is accumulated. Amounts are absolute tiyin values; the
 * document type decides the debit/credit side.
 */
export function computeStatement(docs: RawDoc[]): StatementData {
  const sorted = [...docs].sort((a, b) => a.moment.getTime() - b.moment.getTime());

  let running = 0n;
  let totalDebit = 0n;
  let totalCredit = 0n;

  const lines: StatementLine[] = sorted.map((d) => {
    const isDebit = DEBIT_TYPES.has(d.docType);
    const amt = d.sumMinor < 0n ? -d.sumMinor : d.sumMinor; // defensive abs
    const debitMinor = isDebit ? amt : 0n;
    const creditMinor = isDebit ? 0n : amt;
    running += debitMinor - creditMinor;
    totalDebit += debitMinor;
    totalCredit += creditMinor;
    return {
      ...d,
      side: isDebit ? 'debit' : 'credit',
      debitMinor,
      creditMinor,
      runningBalanceMinor: running,
    };
  });

  return {
    lines,
    totalDebitMinor: totalDebit,
    totalCreditMinor: totalCredit,
    turnoverMinor: totalDebit + totalCredit,
    finalBalanceMinor: running,
  };
}
