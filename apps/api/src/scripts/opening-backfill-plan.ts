/**
 * P2 — «BOSHLANG'ICH QOLDIQ» BACKFILL REJASI (sof modul, I/O yo'q).
 *
 * NEGA ALOHIDA FAYL: skriptning o'zi prod DB'ga yozadi (2026-08-11 DRY
 * o'lchovi: 203 qator), ya'ni uning qarori testda qulflanmasa hech qachon
 * tekshirilmaydi. Endi I/O skriptda, QAROR shu yerda.
 *
 * 🔴 QOIDA — FARQ, JAMI EMAS (`cell-migration-delta-not-total` xotirasi):
 *
 *     yoziladigan delta = balanceMinor − Σ(mavjud jurnal qatorlari)
 *
 * Shuning uchun ikkinchi yugurtirish 0 qator yozadi (idempotent) va Faza 9 dan
 * keyin yozilgan HAQIQIY deltalar ikki marta sanalmaydi.
 *
 * NATIJA INVARIANTI — butun P2 fazasining asosi:
 *
 *     Σ(jurnal)  ==  CounterpartyBalance.balanceMinor
 *
 * ya'ni mijoz kartasidagi bitta raqam va uning tarixi BIR daftardan chiqadi.
 */

export interface BalanceKeyRow {
  accountId: string;
  counterpartyId: string;
  currency: string;
}

export interface MaterializedBalance extends BalanceKeyRow {
  balanceMinor: bigint;
}

/** Jurnaldagi mavjud yig'indi (kalit kesimida). */
export interface JournalSum extends BalanceKeyRow {
  sumMinor: bigint;
}

export interface OpeningEntry extends BalanceKeyRow {
  deltaMinor: bigint;
}

export interface OpeningBackfillPlan {
  /** Yoziladigan `opening` qatorlari (nol farqlilar YO'Q). */
  entries: OpeningEntry[];
  /** Farqi nol — allaqachon mos kalitlar soni. */
  matchedCount: number;
  /** Yoziladigan deltalarning yig'indisi (hisobot uchun, «qancha pul» hissi). */
  totalDeltaMinor: bigint;
  /**
   * Jurnalda bor, materiallashgan jadvalda YO'Q kalitlar — TESKARI drift
   * (kesh yo'qolgan). Backfill uni tuzatmaydi (uning ishi emas), lekin jim
   * o'tkazib ham yubormaydi: `recompute-counterparty-balances.ts` tiklaydi.
   */
  orphanJournalKeys: string[];
}

export function balanceKey(r: BalanceKeyRow): string {
  return `${r.accountId}|${r.counterpartyId}|${r.currency}`;
}

export function planOpeningBackfill(
  balances: readonly MaterializedBalance[],
  journalSums: readonly JournalSum[],
): OpeningBackfillPlan {
  const journal = new Map<string, bigint>();
  for (const j of journalSums) journal.set(balanceKey(j), j.sumMinor);

  const entries: OpeningEntry[] = [];
  let matchedCount = 0;
  let totalDeltaMinor = 0n;

  for (const b of balances) {
    const gap = b.balanceMinor - (journal.get(balanceKey(b)) ?? 0n);
    if (gap === 0n) {
      matchedCount += 1;
      continue;
    }
    entries.push({
      accountId: b.accountId,
      counterpartyId: b.counterpartyId,
      currency: b.currency,
      deltaMinor: gap,
    });
    totalDeltaMinor += gap;
  }

  const materialized = new Set(balances.map(balanceKey));
  const orphanJournalKeys = [...journal.keys()].filter((k) => !materialized.has(k));

  return { entries, matchedCount, totalDeltaMinor, orphanJournalKeys };
}
