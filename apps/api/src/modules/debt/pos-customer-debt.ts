/**
 * F9 — POS mijoz kartasi: **ikki qarz daftarini ochiq qilish** (sof modul).
 *
 * 🔴 MUAMMO (kod bilan o'lchangan, 2026-08-11). Bu loyihada mijoz qarzi ikki
 * joyda yashaydi va ular BIR XIL emas:
 *
 *   1. `CounterpartyBalance` — universal balans. POS'da qarzga sotilgan chek
 *      AYNAN shu yerga tushadi (`retail-sale.service.ts`, `post()`:
 *      `if (debtAmount > 0n && debtAgentId) counterpartyBalance.applyDelta(+)`);
 *      qaytarish esa shu yerdan ayiradi (`refund()`: `-debtReturn`).
 *      `Debt` reyestrini ATAYLAB yozmaydi — aks holda qarz ikki marta
 *      sanalardi (xotira: `debt-ledger-asymmetry`).
 *   2. `Debt` reyestri (`QRZ-…`) — qo'lda ochiladigan qarzlar. POS «Qarz
 *      to'lovi» FIFO'si FAQAT shu reyestrni yopadi
 *      (`pos-debt-payment.service.ts#lockOpenDebts`).
 *
 * OQIBAT: kassir qarzga sotadi → ertasiga mijoz to'lagani keladi → «Qarz
 * to'lovi» oynasi «ochiq qarz yo'q» deydi. Pulni qabul qilish yo'li yo'q.
 *
 * NEGA BU YERDA UCHRASHTIRILMAYDI (qaror, F9): ikkalasini bitta raqamga
 * qo'shib qo'yish yoki chekdan `Debt` yozib yuborish — ikkisi ham balansda
 * IKKI KARRA sanashga olib boradi (2-manba `Debt.create` ham xuddi shu
 * balansga `+total` yozadi). To'g'ri yechim — daftarni bitta qilish, ya'ni
 * to'lov yo'lini balansdan yuritish; u alohida faza ishi (migratsiya +
 * `DebtPayment` shartnomasi o'zgaradi). Bu fazada esa farq **yashirilmaydi**:
 * kassir ekranda «reyestrsiz qarz» ni ko'radi va uni POS'da yopolmasligini
 * biladi — jim 400 xatosidan ko'ra halolroq.
 */

export interface BalanceRow {
  currency: string;
  balanceMinor: bigint;
}

export interface DebtSourceSplit {
  /**
   * `CounterpartyBalance` dagi qoldiq (kassa valyutasi).
   *
   * 🔴 `null` = **O'LCHANMAGAN**, «0» EMAS. Balans qatori faqat birinchi
   * `applyDelta` da tug'iladi va bu yozuvchi Faza 9 da qo'shilgan — undan
   * oldingi qarzlar uchun qator umuman yo'q (xotira: «Balans o'quvchilari
   * jurnaldan» — backfill hali yugurtirilmagan). Yo'qlikni «qarzi yo'q» deb
   * chizish kassirni aldardi.
   */
  balanceMinor: bigint | null;
  /** `Debt` reyestridagi ochiq qoldiq — POS FIFO'si AYNAN shuni yopadi. */
  registryOutstandingMinor: bigint;
  /**
   * Balansda bor, lekin reyestrda YO'Q qism — ya'ni POS «Qarz to'lovi»
   * oynasi qabul QILA OLMAYDIGAN qarz. `null` — balans o'lchanmagan.
   *
   * ⚠️ ANIQ MA'NOSI: «reyestrdan TASHQARIDAGI qarz», «POS chekidan kelgan
   * qarz» EMAS. Balansga POS chekidan tashqari `InvoiceOut`, `PaymentIn`,
   * `CashIn/Out` va boshqa hujjatlar ham yozadi
   * (`counterparty-balance.service.ts` sarlavhasidagi ro'yxat). Ularning
   * hammasi shu farqqa tushadi — shuning uchun ekrandagi yorliq ham
   * «chekdan kelgan» deb TOR aytmaydi.
   */
  unregisteredMinor: bigint | null;
  /**
   * Reyestr balansdan katta. Bu — teskari nomuvofiqlik (balans backfill
   * qilinmagan yoki qarz balansga tushmagan). Farqni manfiy chizmaymiz,
   * lekin bayroqni ko'taramiz: ikkala son ham shubhali.
   */
  registryExceedsBalance: boolean;
  /**
   * Boshqa valyutadagi NOLDAN FARQLI qoldiqlar. Kassa bitta valyutada
   * ishlaydi, lekin ularni jimgina tashlab yuborish «qarzi yo'q» degan
   * yolg'on bo'lardi.
   */
  otherCurrencies: BalanceRow[];
}

/**
 * Ikki manbani bir shaklga keltiradi. DB yo'q, Nest yo'q — faqat qoida.
 *
 * @param balances kontragentning BARCHA valyutadagi balans qatorlari
 * @param registryOutstandingMinor `Debt` reyestridagi ochiq qoldiq (so'm)
 * @param tillCurrency kassa valyutasi — asosiy son shundan olinadi
 */
export function splitDebtSources(
  balances: readonly BalanceRow[],
  registryOutstandingMinor: bigint,
  tillCurrency: string,
): DebtSourceSplit {
  const till = balances.find((b) => b.currency === tillCurrency);
  const balanceMinor = till ? till.balanceMinor : null;

  // Manfiy balans = BIZ mijozga qarzdormiz. Undan «reyestrsiz qarz»
  // chiqarish mantiqsiz bo'lardi, shuning uchun 0 dan pastga tushmaydi.
  const diff = balanceMinor === null ? null : balanceMinor - registryOutstandingMinor;

  return {
    balanceMinor,
    registryOutstandingMinor,
    unregisteredMinor: diff === null ? null : diff > 0n ? diff : 0n,
    // Faqat mijoz QARZDOR bo'lgan holatda mazmunli: balans musbat bo'lib
    // reyestrdan kichik bo'lsa, ikki daftar rostdan ham qarama-qarshi.
    registryExceedsBalance:
      balanceMinor !== null &&
      registryOutstandingMinor > 0n &&
      balanceMinor < registryOutstandingMinor,
    otherCurrencies: balances.filter((b) => b.currency !== tillCurrency && b.balanceMinor !== 0n),
  };
}
