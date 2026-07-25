/**
 * Pure reconciliation-statement computation (акт-сверка core). Takes the raw
 * balance-affecting documents for ONE counterparty and produces ordered ledger
 * lines with a running balance, per-side totals, turnover, and the final net
 * balance. No I/O — fully unit-testable; the service layer feeds it Prisma rows.
 *
 * Sign convention (mirrors CounterpartyBalanceService.applyDelta):
 *   balance = Σdebit − Σcredit ·  > 0 → counterparty owes us · < 0 → we owe them.
 *   DEBIT  docs (they owe us more / we paid them):  invoiceOut, cashOut, paymentOut
 *   CREDIT docs (we owe them more / they paid us):  invoiceIn,  cashIn,  paymentIn
 */

export type StatementDocType =
  | 'invoiceOut'
  | 'invoiceIn'
  | 'cashIn'
  | 'cashOut'
  | 'paymentIn'
  | 'paymentOut';

export interface StatementItem {
  /** Product/assortment display name. */
  name: string;
  /** Formatted quantity (e.g. "10" / "2.5"). */
  quantity: string;
  /** Unit price in tiyin. */
  priceMinor: bigint;
  /** Line total in tiyin. */
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
]);

/** Human label per document type (Uzbek). */
export const DOC_TYPE_LABEL: Record<StatementDocType, string> = {
  invoiceOut: 'Sotuv',
  invoiceIn: 'Xarid',
  cashIn: "To'lov (kirim)",
  cashOut: "To'lov (chiqim)",
  paymentIn: "Bank to'lovi (kirim)",
  paymentOut: "Bank to'lovi (chiqim)",
};

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
