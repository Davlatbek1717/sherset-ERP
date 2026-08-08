/**
 * BALANS JURNALINI O'QISH — Faza 10 ning yadrosi (`M-07`, `DUP-05/06/08`).
 *
 * Faza 9 gacha kontragent saldosi TO'RT joyda mustaqil ravishda hujjatlardan
 * qayta qurilardi (metrics byOrg 9 tur · statement 12 tur · akt-sverka 8 tur ·
 * recompute skripti 6 manba). Har ro'yxat chala edi va har biri boshqacha chala
 * edi — natijada bitta kontragent kartochkasida to'rt xil son chiqishi mumkin
 * edi, kontragentga imzoga yuboriladigan aktdagi yakuniy qoldiq esa haqiqiy
 * saldodan farq qilardi.
 *
 * Endi manba BITTA: `CounterpartyBalanceEntry` jurnali, unga `applyDelta`
 * materiallashgan balans bilan BIR TRANZAKSIYADA yozadi. Shuning uchun
 *
 *     Σ(jurnal.deltaMinor)  ==  CounterpartyBalance.balanceMinor
 *
 * konstruksiya bo'yicha to'g'ri (Faza 9 testlari + real-DB rollback tekshiruvi).
 *
 * ⚠️ SHU FAYLNING ASOSIY QOIDASI: o'qish so'rovlarida `docType` bo'yicha
 * FILTR YO'Q. Aynan «qaysi turlarni sanaymiz» ro'yxati butun bug-klassning
 * ildizi edi. Filtr faqat kontragent / valyuta / organizatsiya / davr bo'yicha
 * bo'lishi mumkin — ular jurnal qatorining O'ZIDA turadi.
 * `journal-where-shape.test.ts` buni mexanik tekshiradi.
 */

import { OPENING_DOC_TYPE, isOpeningEntry } from './counterparty-balance-doc-types.js';

/** Jurnal qatorining o'qish uchun kerakli qismi. */
export interface JournalEntry {
  organizationId: string | null;
  deltaMinor: bigint;
  docType: string;
  docId: string | null;
  createdAt: Date;
}

/**
 * Jurnal so'rovining filtri. `organizationId` uch holatli:
 *   `undefined` → org bo'yicha filtrlanmaydi (butun saldo),
 *   `string`    → aynan shu organizatsiya,
 *   `null`      → organizatsiyasiz qatorlar (Debt / org'siz POS cheki, `opening`).
 *
 * DAVR bo'yicha filtr bu yerda ATAYLAB YO'Q: akt-sverka qatorlari hujjatning
 * O'Z sanasi (`moment`) bo'yicha joylashadi, jurnaldagi `createdAt` esa post
 * qilingan payt. Orqaga sanalgan hujjat (iyul sanasi, avgustda post qilingan)
 * `createdAt` filtri bilan iyul aktidan JIMGINA tushib qolardi — shuning uchun
 * davr `foldJournalPeriod` da, hujjat sanasi bo'yicha kesiladi.
 */
export interface JournalFilter {
  accountId: string;
  counterpartyId: string;
  currency: string;
  organizationId?: string | null;
}

/**
 * Prisma `counterpartyBalanceEntry` delegatining shu fayl ishlatadigan qismi.
 * Struktural tip — servis `PrismaService.client` ni, skript esa o'z
 * `PrismaClient` ini uzatadi va ikkalasi ham to'g'ri keladi.
 */
export interface JournalDelegate {
  findMany(args: {
    where: JournalWhere;
    orderBy: { createdAt: 'asc' };
    select: {
      organizationId: true;
      deltaMinor: true;
      docType: true;
      docId: true;
      createdAt: true;
    };
  }): Promise<JournalEntry[]>;
  groupBy(args: {
    by: ['organizationId'];
    where: JournalWhere;
    _sum: { deltaMinor: true };
  }): Promise<Array<{ organizationId: string | null; _sum: { deltaMinor: bigint | null } }>>;
}

export interface JournalWhere {
  accountId: string;
  counterpartyId: string;
  currency: string;
  organizationId?: string | null;
}

/**
 * Filtrni Prisma `where` obyektiga aylantiradi. ALOHIDA funksiya — chunki
 * uning shakli testda qulflanadi: `docType` kaliti paydo bo'lsa test yiqiladi
 * (chala-ro'yxat bug-klassi qaytib kelmasin).
 */
export function journalWhere(f: JournalFilter): JournalWhere {
  const where: JournalWhere = {
    accountId: f.accountId,
    counterpartyId: f.counterpartyId,
    currency: f.currency,
  };
  // `undefined` = filtrlamaslik; `null` = organizatsiyasiz qatorlar (ikkalasi FARQLI).
  if (f.organizationId !== undefined) where.organizationId = f.organizationId;
  return where;
}

/** Kontragent×valyuta bo'yicha jurnal qatorlari, vaqt tartibida. */
export function listJournalEntries(
  delegate: JournalDelegate,
  f: JournalFilter,
): Promise<JournalEntry[]> {
  return delegate.findMany({
    where: journalWhere(f),
    orderBy: { createdAt: 'asc' },
    select: {
      organizationId: true,
      deltaMinor: true,
      docType: true,
      docId: true,
      createdAt: true,
    },
  });
}

/**
 * «Balans po organizatsiyam» — org kesimidagi yig'indi. `organizationId: null`
 * bandi ATAYLAB tashlanmaydi: u tashlansa Σ(byOrg) materiallashgan balansdan
 * farq qilardi, ya'ni aynan tuzatilayotgan bug qaytardi. Null bandi
 * «taqsimlanmagan» qator bo'lib chiqadi (`Debt` da org o'lchovi yo'q,
 * `RetailSale.organizationId` optional, `opening` qatori org'siz).
 */
export async function sumJournalByOrganization(
  delegate: JournalDelegate,
  f: JournalFilter,
): Promise<Array<{ organizationId: string | null; sumMinor: bigint }>> {
  const rows = await delegate.groupBy({
    by: ['organizationId'],
    where: journalWhere(f),
    _sum: { deltaMinor: true },
  });
  return rows.map((r) => ({
    organizationId: r.organizationId,
    sumMinor: r._sum.deltaMinor ?? 0n,
  }));
}

/** Jurnal qatorining davr bo'yicha joylashuvi uchun hisoblangan sana. */
export interface DatedJournalEntry extends JournalEntry {
  /**
   * Hujjatning O'Z sanasi (`moment`), topilgan bo'lsa. Akt-sverka moysklad'da
   * hujjat sanasi bo'yicha yuritiladi, `createdAt` (post qilingan payt) bo'yicha
   * emas — orqaga sanalgan hujjat aks holda noto'g'ri davrga tushardi.
   * `null` ⇒ `createdAt` ishlatiladi.
   */
  docMoment: Date | null;
}

export interface FoldedJournal<T> {
  /** Davr boshigacha to'plangan qoldiq (`opening` qatorlari HAR DOIM shu yerda). */
  openingMinor: bigint;
  /** Davr ichidagi qatorlar, sana bo'yicha tartiblangan. */
  lines: T[];
  totalDebitMinor: bigint;
  totalCreditMinor: bigint;
  /** `openingMinor + debit − credit`. `to = hozir` bo'lsa == materiallashgan balans. */
  closingMinor: bigint;
}

/**
 * Jurnal qatorlarini davr bo'yicha «boshlang'ich qoldiq + harakat qatorlari»ga
 * ajratadi. SOF funksiya — I/O yo'q, shuning uchun invariant unit-testda
 * to'liq qulflanadi.
 *
 * Belgi konvensiyasi `applyDelta` bilan AYNAN bir xil (boshqa formula yo'q):
 *   delta > 0 → DEBET  (kontragent bizga ko'proq qarzdor bo'ldi)
 *   delta < 0 → KREDIT (qarz kamaydi)
 * Shuning uchun `closing = opening + debit − credit` avtomatik ravishda
 * `opening + Σdelta` ga teng — akt qatorlari va bosh daftar hech qachon
 * ajralib keta olmaydi.
 *
 * `docType = 'opening'` qatorlari davrdan QAT'I NAZAR `openingMinor` ga
 * qo'shiladi: ular tarixiy qoldiq bo'lib, backfill kunida yozilgan
 * (`createdAt` = backfill vaqti), ya'ni sana bo'yicha joylashtirilsa bugungi
 * davrga tushib qolardi.
 *
 * `periodEnd` — QAT'IY yuqori chegara (yarim-ochiq `[start, end)`); undan
 * keyingi qatorlar butunlay tashlanadi (aktning `to` sanasi).
 */
export function foldJournalPeriod<T extends DatedJournalEntry>(
  entries: readonly T[],
  periodStart: Date | null,
  periodEnd?: Date,
): FoldedJournal<T> {
  let openingMinor = 0n;
  let totalDebitMinor = 0n;
  let totalCreditMinor = 0n;
  const lines: T[] = [];

  for (const e of entries) {
    if (isOpeningEntry(e.docType)) {
      openingMinor += e.deltaMinor;
      continue;
    }
    const at = e.docMoment ?? e.createdAt;
    if (periodEnd && at >= periodEnd) continue;
    if (periodStart && at < periodStart) {
      openingMinor += e.deltaMinor;
      continue;
    }
    if (e.deltaMinor > 0n) totalDebitMinor += e.deltaMinor;
    else totalCreditMinor += -e.deltaMinor;
    lines.push(e);
  }

  lines.sort(
    (a, b) => (a.docMoment ?? a.createdAt).getTime() - (b.docMoment ?? b.createdAt).getTime(),
  );

  return {
    openingMinor,
    lines,
    totalDebitMinor,
    totalCreditMinor,
    closingMinor: openingMinor + totalDebitMinor - totalCreditMinor,
  };
}

/** Jurnal qatorlarining sof yig'indisi (davrsiz). */
export function sumJournalEntries(entries: readonly { deltaMinor: bigint }[]): bigint {
  let total = 0n;
  for (const e of entries) total += e.deltaMinor;
  return total;
}

export { OPENING_DOC_TYPE };
