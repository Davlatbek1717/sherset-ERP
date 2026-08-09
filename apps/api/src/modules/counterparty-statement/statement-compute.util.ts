/**
 * Pure reconciliation-statement computation (акт-сверка core). Takes the raw
 * balance-affecting documents for ONE counterparty and produces ordered ledger
 * lines with a running balance, per-side totals, turnover, and the final net
 * balance. No I/O — fully unit-testable; the service layer feeds it Prisma rows.
 *
 * Sign convention (mirrors CounterpartyBalanceService.applyDelta):
 *   balance = Σdebit − Σcredit ·  > 0 → counterparty owes us · < 0 → we owe them.
 *   deltaMinor > 0 → DEBET (kontragent qarzi oshdi)
 *   deltaMinor < 0 → KREDIT (qarz kamaydi)
 *
 * FAZA 10 (`DUP-08`) — TUR → TOMON XARITASI OLIB TASHLANDI. Ilgari bu yerda
 * 12 turdan iborat `StatementDocType` union va `DEBIT_TYPES` to'plami turardi,
 * ya'ni qatorning debet/kredit ekani TUR NOMIDAN chiqarilardi. Shuning oqibati:
 * ro'yxatga tushmagan tur (`debt` — QRZ- reyestrida ochilgan qarz, `retailsale`
 * — POS qarzga sotuv) umuman kelmasdi va `finalBalanceMinor` haqiqiy saldodan
 * farq qilardi — «mijozga N so'm qarz bo'lib ketardi» bug-klassi. 2026-07-28 da
 * bir marta yopilgan, 2026-08-05 yangi yozuvchilar bilan QAYTA ochilgan edi.
 *
 * Endi belgi qatorning O'ZIDA keladi (`CounterpartyBalanceEntry.deltaMinor`) —
 * ya'ni yangi hujjat turi qo'shilganda bu faylda o'zgartiriladigan narsa YO'Q,
 * va akt qatorlari bosh daftardan printsipial ajrala olmaydi.
 */

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
  /**
   * `CounterpartyBalanceEntry.docType` — ERKIN satr, union EMAS (yangi yozuvchi
   * qo'shilganda bu fayl o'zgarmasin). Yorliq `DOC_TYPE_LABEL` dan, topilmasa
   * turning o'zi ko'rsatiladi.
   */
  docType: string;
  docNumber: string;
  /** BELGILI delta — `applyDelta` balansga qo'llagan qiymatning aynan o'zi. */
  deltaMinor: bigint;
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
  /**
   * FAZA Q6 (`PERF-02`) — DAVR-BOSHI SALDO. Davr boshigacha to'plangan qoldiq
   * (`foldJournalPeriod().openingMinor`). Davrsiz aktda bu faqat `opening`
   * (backfill) qatorlarining yig'indisi bo'ladi; davr berilganda esa unga
   * davrdan OLDINGI barcha harakatlar ham qo'shiladi. Running balans aynan
   * shundan boshlanadi — aks holda davr aktidagi «Qoldiq» ustuni bosh
   * daftardan ajralib ketardi.
   */
  openingMinor: bigint;
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  /** Davr harakatlarining aylanmasi (debet + kredit) — opening unga KIRMAYDI. */
  turnoverMinor: bigint;
  /** Net: > 0 they owe us · < 0 we owe them · 0 settled. */
  finalBalanceMinor: bigint;
}

/**
 * Hujjat turining o'qiladigan nomi (o'zbekcha). Kalitlar —
 * `CounterpartyBalanceEntry.docType` qiymatlari. Bu xarita faqat YORLIQ uchun:
 * bu yerda yo'q tur qatorni yo'qotmaydi, `docTypeLabel()` turning o'zini
 * qaytaradi (saldo esa umuman bunga bog'liq emas).
 */
export const DOC_TYPE_LABEL: Record<string, string> = {
  invoiceOut: 'Sotuv',
  invoiceIn: 'Xarid',
  supply: 'Qabul',
  purchaseReturn: 'Taminotchiga qaytarish',
  cashIn: "To'lov (kirim)",
  cashOut: "To'lov (chiqim)",
  paymentIn: "Bank to'lovi (kirim)",
  paymentOut: "Bank to'lovi (chiqim)",
  prepayment: 'Avans (olindi)',
  prepaymentReturn: 'Avans qaytarildi',
  adjustment: 'Korrektirovka',
  debt: 'Qarz ochildi',
  debtpayment: "Qarz to'lovi",
  retailsale: 'Chakana (qarzga)',
  opening: "Boshlang'ich qoldiq",
};

/** Yorliq, topilmasa — turning o'zi (qator hech qachon yo'qolmaydi). */
export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABEL[docType] ?? docType;
}

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
 * document sign (`deltaMinor`) decides the debit/credit side.
 *
 * `openingMinor` (Faza Q6) — davr-boshi qoldig'i, `foldJournalPeriod` dan
 * keladi. Berilmasa 0 (davrsiz akt uchun eski xulq). Yakun har doim
 * `opening + Σdebet − Σkredit` bo'lgani uchun `to = hozir` bo'lganda u
 * materiallashgan balansga TENG qoladi (Faza 10 invarianti).
 */
export function computeStatement(docs: RawDoc[], openingMinor = 0n): StatementData {
  const sorted = [...docs].sort((a, b) => a.moment.getTime() - b.moment.getTime());

  let running = openingMinor;
  let totalDebit = 0n;
  let totalCredit = 0n;

  const lines: StatementLine[] = sorted.map((d) => {
    // Belgi qatorning O'ZIDAN keladi — tur nomidan EMAS (Faza 10, DUP-08).
    const isDebit = d.deltaMinor > 0n;
    const amt = d.deltaMinor < 0n ? -d.deltaMinor : d.deltaMinor;
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
    openingMinor,
    totalDebitMinor: totalDebit,
    totalCreditMinor: totalCredit,
    turnoverMinor: totalDebit + totalCredit,
    finalBalanceMinor: running,
  };
}
