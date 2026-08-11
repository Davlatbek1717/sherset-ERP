/**
 * P2 — MIJOZ KARTASIDAGI QARZ TARIXI (sof modul, DB yo'q).
 *
 * MUAMMO (prodda o'lchangan 2026-08-11): kassir kartada katta qarz raqamini
 * ko'radi, lekin u QAYERDAN kelgani ko'rinmaydi — `CounterpartyBalanceEntry`
 * jurnalida bor-yo'g'i 2 qator bor (ikkalasi ham P1 ning sinov to'lovi),
 * `CounterpartyBalance` da esa 206 qator. Mijoz «men bunchalik qarzdor
 * emasman» desa kassirning qo'lida hech narsa yo'q.
 *
 * MANBA — jurnalning O'ZI (`counterparty-balance-journal.util.ts` qoidasi:
 * o'qishda `docType` bo'yicha FILTR YO'Q). Ya'ni bu yerda «qaysi turlarni
 * ko'rsatamiz» degan ro'yxat YO'Q — jurnalda nima bo'lsa, o'sha ko'rinadi.
 * Yangi hujjat turi qo'shilsa bu fayl o'zgarmaydi.
 *
 * IKKI QAROR:
 *   1. **`opening` harakat qatori EMAS.** Backfill qatorining `createdAt` i —
 *      backfill KUNI, hujjat sanasi emas. Uni oddiy qator qilib chizsak kassir
 *      «bugun 5 000 000 qarz yozilibdi» degan YOLG'ONNI ko'rardi. Shuning
 *      uchun u alohida «boshlang'ich qoldiq» soni bo'lib chiqadi.
 *   2. 🔴 **`openingMinor: null` ≠ `0n`.** `null` = jurnalda `opening` qatori
 *      YO'Q (backfill bu kontragentga tegmagan), `0n` = qator bor va nol.
 *      Bu farq «tarix to'liqmi?» degan savolga javob beradi.
 */

import { isOpeningEntry } from '../counterparty-balance/counterparty-balance-doc-types.js';

/** Jurnal qatorining shu modul ishlatadigan qismi. */
export interface PosHistoryEntry {
  deltaMinor: bigint;
  docType: string;
  docId: string | null;
  createdAt: Date;
}

/** Resolver natijasining shu modul ishlatadigan qismi (`docKey` bo'yicha). */
export interface PosHistoryLabel {
  number: string | null;
  moment: Date | null;
}

export interface PosHistoryLine {
  /** Hujjatning O'Z sanasi, topilmasa jurnal `createdAt` i. */
  at: Date;
  docType: string;
  docId: string | null;
  /** Hujjat raqami; `null` = yorliq topilmadi (qator baribir chiqadi). */
  number: string | null;
  deltaMinor: bigint;
  /** `true` = qarz OSHDI, `false` = kamaydi (belgi konvensiyasi `applyDelta`). */
  increase: boolean;
}

export interface PosHistoryFold {
  /** Tarixiy boshlang'ich qoldiq; `null` = `opening` qatori yo'q. */
  openingMinor: bigint | null;
  /** Harakatlar, ENG YANGISI TEPADA. */
  lines: PosHistoryLine[];
}

/** `resolveBalanceDocs` bilan AYNAN bir xil kalit (nusxa emas — import). */
function labelKey(docType: string, docId: string | null): string {
  return `${docType}|${docId ?? ''}`;
}

/**
 * Jurnal qatorlarini kassir ko'radigan ro'yxatga aylantiradi.
 *
 * Tartib — hujjatning O'Z sanasi bo'yicha (`docMoment ?? createdAt`), aynan
 * `foldJournalPeriod` dagi qoida: orqaga sanalgan hujjat (iyul sanasi,
 * avgustda post qilingan) `createdAt` bo'yicha saralansa ro'yxatda noto'g'ri
 * joyga tushardi.
 *
 * @param openingSumMinor jurnaldagi `opening` qatorlarining YIG'INDISI
 *        (chaqiruvchi alohida so'rov bilan oladi — u sahifalashdan mustaqil
 *        bo'lishi shart, aks holda «tarix uzun» bo'lgan mijozda boshlang'ich
 *        qoldiq jimgina yo'qolardi). `null` = qator yo'q.
 */
export function foldPosHistory(
  entries: readonly PosHistoryEntry[],
  labels: ReadonlyMap<string, PosHistoryLabel>,
  openingSumMinor: bigint | null,
): PosHistoryFold {
  const lines: PosHistoryLine[] = [];

  for (const e of entries) {
    // `opening` — tarixiy qoldiq, harakat emas (fayl sarlavhasidagi 1-qaror).
    if (isOpeningEntry(e.docType)) continue;
    const label = labels.get(labelKey(e.docType, e.docId));
    lines.push({
      at: label?.moment ?? e.createdAt,
      docType: e.docType,
      docId: e.docId,
      number: label?.number ?? null,
      deltaMinor: e.deltaMinor,
      increase: e.deltaMinor > 0n,
    });
  }

  lines.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { openingMinor: openingSumMinor, lines };
}
