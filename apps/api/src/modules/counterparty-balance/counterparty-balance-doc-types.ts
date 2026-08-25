/**
 * BALANS-HUJJAT TURLARINING YAGONA REYESTRI (`CounterpartyBalanceEntry.docType`).
 *
 * NEGA (Faza 10, audit `DUP-15` ildizi): shu qiymatlar ilgari 13 ta servisda
 * qo'lda yozilgan satr-literal edi, va ularni O'QIYDIGAN tomonda esa yana
 * mustaqil ro'yxatlar turardi (metrics 9 tur, statement 12 tur, akt 8 tur,
 * recompute 6 manba). Har yangi yozuvchi qo'shilganda kamida bitta o'quvchi
 * ro'yxati unutilardi — `M-07`/`DUP-05`/`DUP-06`/`DUP-08` ning hammasi shu
 * bitta sababdan. Endi yozuvchi tomoni SHU reyestr bilan tiplangan
 * (`ApplyDeltaMeta.docType: BalanceDocType`), o'quvchi tomoni esa docType
 * bo'yicha UMUMAN filtrlamaydi — jurnalning hammasini o'qiydi. Ya'ni yangi
 * tur qo'shilganda o'quvchilarda o'zgartiriladigan joy YO'Q.
 *
 * Reyestrga tur qo'shish faqat IKKI narsaga ta'sir qiladi:
 *   1. yozuvchi kompilyatsiya qilinsin (`BalanceDocType` union);
 *   2. akt/statement qatorida hujjat RAQAMI ko'rinsin
 *      (`counterparty-balance-doc-resolver.ts` — u yerda tur yo'q bo'lsa qator
 *      baribir chiqadi, faqat raqamsiz: xato SALDO emas, xato YORLIQ).
 * Saldo hech qachon reyestrga bog'liq emas — bu ataylab shunday.
 */

/**
 * `applyDelta` yozuvchilari ishlatadigan turlar. Qiymatlar mavjud kod bilan
 * AYNAN bir xil (Faza 9 da yozilgan jurnal qatorlari shu satrlarni saqlagan) —
 * o'zgartirilsa tarixiy qatorlar yetim qoladi.
 */
export const BALANCE_DOC_TYPE = {
  invoiceOut: 'invoiceOut',
  /**
   * ⚠️ TARIXIY — Faza 13 (2026-08-08, QAROR-B «Supply-only») dan keyin bu turni
   * HECH KIM YOZMAYDI: `InvoiceIn` kontragent balansiga tegmaydi (qarzni faqat
   * `Supply` yozadi, `PP-03`). Reyestrda QOLADI, chunki Faza 13'gacha yozilgan
   * jurnal qatorlari shu satr bilan saqlangan — o'chirilsa akt/statement
   * qatorlari hujjat raqamisiz yetim qolardi (saldo baribir o'zgarmaydi).
   */
  invoiceIn: 'invoiceIn',
  /** Faza 13 (`PP-02`): taminotchiga qaytarish — qabul deltasining teskarisi. */
  purchaseReturn: 'purchaseReturn',
  /**
   * P14 (`H1`, 2026-08-12): MIJOZ qaytarishi — `invoiceOut` deltasining
   * teskarisi (`−sumMinor`: tovar bizga qaytdi ⇒ mijozning qarzi kamayadi).
   * `purchaseReturn` ning savdo tomonidagi ko'zgusi.
   */
  salesReturn: 'salesReturn',
  /**
   * G1 (2026-08-24): vozvrat pulining KASSADAN naqd qaytarilishi
   * (`RetailDrawerCashOut`, `kind='return_payout'`). `+sumMinor` —
   * `salesReturn` post'idagi `−sumMinor` kreditning naqd bilan yopilishi
   * (`cashOut` semantikasi: biz to'ladik ⇒ bizning qarzimiz kamayadi).
   * `docId` = drawer-hujjat id'si.
   */
  returnPayout: 'returnPayout',
  /**
   * A1 (2026-08-25): MIJOZ AVANSI — kassada oldindan qabul qilingan naqd
   * (`RetailDrawerCashIn`, `kind='customer_prepay'`). `−sumMinor` — «biz
   * mijozga qarzdormiz», ya'ni `returnPayout` ning teskari ishorasi
   * (`cashIn` semantikasi: pul oldik ⇒ mijozning qarzi kamayadi; qarzi
   * bo'lmasa balans MANFIY hududga — avansga — o'tadi).
   * `docId` = drawer-hujjat id'si.
   *
   * ⚠️ MAVJUD `cashIn` turi ATAYLAB qayta ishlatilmadi: u `CashIn` (ПКО)
   * hujjatiga ishora qiladi, bu esa `RetailDrawerCashIn` qatoriga. Bitta
   * turga ikki jadval berilsa hujjat-resolveri noto'g'ri jadvaldan qidirib
   * har avans qatorini raqamsiz ko'rsatardi.
   */
  customerPrepay: 'customerPrepay',
  /**
   * A2 (2026-08-25): AVANSDAN TO'LOV — POS chekining `PREPAY` tenderi.
   * `+amountMinor` — mijozning avansi yeyiladi (−1 000k → −700k), ya'ni
   * `customerPrepay` (qabul) deltasining teskarisi. `docId` = `RetailSale.id`.
   *
   * ⚠️ NEGA `customerPrepay` QAYTA ISHLATILMADI: u `RetailDrawerCashIn`
   * hujjatiga ishora qiladi (АВ- raqami), bu esa `RetailSale` ga (ЧК-/ТРН-).
   * Bitta turga ikki jadval berilsa hujjat-resolveri noto'g'ri jadvaldan
   * qidirib har qatorni raqamsiz ko'rsatardi (A1 dagi AYNI sabab).
   *
   * ⚠️ NEGA `retailsale` HAM QAYTA ISHLATILMADI (garchi jadval o'sha bo'lsa
   * ham): `retailsale` — QARZ deltasi (`+debtAmount` / `−debtReturn`) va
   * mijozga «🛒 Qarzga qo'shildi» Telegram xabari AYNAN shu tur bilan
   * yuritiladi. Avansdan to'lov qarz EMAS; ikkalasini bir turga qo'shsak
   * kassa tarixida «qarz» va «avans sarfi» ajralmas bo'lib qolardi va A3
   * ning tarix yorliqlari ikkisini bir xil nomlab ko'rsatardi.
   */
  salePrepay: 'salePrepay',
  paymentIn: 'paymentIn',
  paymentOut: 'paymentOut',
  cashIn: 'cashIn',
  cashOut: 'cashOut',
  prepayment: 'prepayment',
  prepaymentReturn: 'prepaymentReturn',
  adjustment: 'adjustment',
  supply: 'supply',
  debt: 'debt',
  debtpayment: 'debtpayment',
  retailsale: 'retailsale',
} as const;

export type ApplyDeltaDocType = (typeof BALANCE_DOC_TYPE)[keyof typeof BALANCE_DOC_TYPE];

/**
 * Jurnalga TARIXIY qoldiqni kiritadigan texnik tur — `applyDelta` orqali EMAS,
 * faqat `backfill-counterparty-balance-journal.ts` skripti yozadi (shuning
 * uchun `ApplyDeltaDocType` dan tashqarida: yozuvchi servis uni tanlay olmaydi).
 *
 * Sabab: jurnal Faza 9 da BO'SH boshlandi, materiallashgan `CounterpartyBalance`
 * da esa butun tarix bor. O'quvchilar jurnalga ko'chirilganda backfillsiz
 * akt-sverka noldan boshlangan qoldiqni ko'rsatardi. Hujjat-replay (tarixni
 * qayta o'qish) ATAYLAB tanlanmadi — u `DUP-02` xatarini takrorlaydi
 * (chala hujjat-ro'yxati → jimgina yo'qolgan saldo). Buning o'rniga har mavjud
 * balans qatori uchun BITTA «boshlang'ich qoldiq» qatori yoziladi:
 * Σ-invariant konstruksiya bo'yicha to'g'ri, ma'lumot yo'qolishi nol.
 */
export const OPENING_DOC_TYPE = 'opening';

export type BalanceDocType = ApplyDeltaDocType | typeof OPENING_DOC_TYPE;

/**
 * `opening` qatorining hujjati yo'q ⇒ `docId` NULL. Boshqa hech bir tur uchun
 * NULL bo'lishi mumkin emas (yozuvchi meta'da `docId: string` majburiy).
 */
export function isOpeningEntry(docType: string): boolean {
  return docType === OPENING_DOC_TYPE;
}
