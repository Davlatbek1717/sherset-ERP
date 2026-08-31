/**
 * Aralash to'lov (multi-tender) — kassa TZ §6. Sof, aniq BigInt matematika.
 *
 * Mavjud `retail-payment.ts` faqat naqd+karta bilan ishlaydi. Bu modul uni
 * ALMASHTIRMAYDI: eski funksiya o'z testlari bilan qoladi va boshqa yo'llar
 * (masalan `moysklad-compat`) uni chaqirishda davom etadi; bu yerda esa
 * to'rtta tur bo'yicha to'liq qoida bor.
 *
 * NEGA KERAK BO'LDI (real, prodda edi): `/sotuv` to'lov oynasi serverga
 * TO'RTTA turni yuboradi (naqd · karta · terminal · qarz), server sxemasi esa
 * faqat IKKITASINI bilardi. Zod ortiqcha kalitlarni jimgina tashlab yuboradi →
 * terminal orqali to'langan chek serverga «0 to'landi» bo'lib yetardi va
 * **400 «Payment insufficient»** qaytarardi. Ya'ni kassir terminal bilan
 * to'lagan mijozning chekini rasmiylashtira olmasdi.
 *
 * TZ §6.2 dagi uchta qoida shu yerda kod bo'lib yozilgan:
 *  1. `Σ to'lov ≥ jami` — LEKIN qarz qatori bo'lsa boshqacha (quyida);
 *  2. **qaytim faqat naqddan** — ortiqcha plastik/onlayn to'lov qabul
 *     qilinmaydi (aks holda kassa mijozga bank pulidan qaytim berib yuboradi);
 *  3. qarz qatori bo'lsa kontragent majburiy (chaqiruvchi tekshiradi).
 */

// Kanonik kurs-masshtab (kurs × 10^8, DB-01/Faza 16) YAGONA manbadan olinadi.
// Bu yerda `100_000_000n` deb qayta yozilsa, masshtab bir kun o'zgarganda
// nusxa jimgina eskirib, dollar summasi 10 000× xato bo'lardi.
import { convertByRateE8 } from '@moysklad/money';

/** To'lov turlari — `RetailSalePayment.method` ustuniga yoziladigan qiymatlar. */
export const TENDER = {
  cashUzs: 'CASH_UZS',
  /**
   * Dollar naqd (MK31, TZ §6.2). Kurs chekka MUZLATILADI: kurs ertaga
   * o'zgarsa ham bugungi chek qayta baholanmasin. Kurs topilmasa to'lov
   * BLOKLANADI — sentni tiyin deb jim qabul qilish 12 000× xato bo'lardi.
   */
  cashUsd: 'CASH_USD',
  card: 'CARD',
  /**
   * Bank terminali (plastik karta terminal orqali). TZ ro'yxatida alohida
   * yozilmagan, lekin `/sotuv` to'lov oynasida ALLAQACHON alohida tugma —
   * kassir uchun «karta» (o'tkazma) va «terminal» boshqa-boshqa kanal.
   * Kassir interfeysining lug'atini o'zgartirmadik.
   */
  terminal: 'TERMINAL',
  /**
   * Hisob raqamidan (bank o'tkazmasi, 2026-08-31 — egasi so'radi: undirish
   * modulida `account` usuli bor edi, kassada esa yo'q). Pul bank hisobiga
   * tushadi, YASHIQQA EMAS — `legacyTotals` da karta/terminal bilan bir
   * qatorda «naqd emas» hisobiga kiradi va qaytim undan berilmaydi.
   */
  account: 'ACCOUNT',
  /**
   * A2 (2026-08-25) — MIJOZNING AVANSIDAN to'lov. Pul kassa yashig'iga
   * KIRMAYDI: u allaqachon kirgan (A1 — `RetailDrawerCashIn`,
   * `kind='customer_prepay'`) va mijozning balansida MANFIY bo'lib turibdi.
   *
   * 🔴 `DEBT` dan IKKI joyda farq qiladi, boshqa hamma narsada bir xil:
   *  1. balans deltasi AYNAN bir xil (`+summa`), lekin natija ishorasi
   *     boshqa — avans yeyiladi (−1 000k → −700k), qarz tug'ilmaydi;
   *  2. chek TO'LANGAN sanaladi (`payedSumMinor` ga KIRADI) — tovar puli
   *     rostdan olingan, faqat oldinroq.
   *
   * ⚠️ NAQD EMAS: `legacyTotals` ga tushmaydi ⇒ smenaning kutilgan naqdiga
   * (`collectCashInputs`) va Z-hisobotning naqd qatoriga KIRMAYDI —
   * `DEBT` bilan AYNAN bir xil munosabat.
   */
  prepay: 'PREPAY',
  debt: 'DEBT',
} as const;

export type TenderMethod = (typeof TENDER)[keyof typeof TENDER];

export interface TenderInput {
  cashMinor: bigint;
  cardMinor: bigint;
  terminalMinor: bigint;
  /**
   * Hisob raqamidan (bank o'tkazmasi). Ixtiyoriy: uzatmagan chaqiruvchi
   * uchun 0 — mavjud xulq bir bayt ham o'zgarmaydi (prepay bilan bir naqsh).
   */
  accountMinor?: bigint;
  /** Qarzga qoldirilgan qism — pul EMAS, mijoz balansiga yoziladi. */
  debtMinor: bigint;
  /**
   * A2 — mijozning AVANSIDAN qoplanadigan qism (kassa valyutasi, minor).
   * Ixtiyoriy: uzatmagan chaqiruvchi uchun 0, ya'ni mavjud xulq bir bayt
   * ham o'zgarmaydi.
   *
   * 🔴 Bu yerda avans YETARLILIGI tekshirilMAYDI — u balansdan o'qiladi va
   * bu modul DB ni bilmaydi. Cap (`prepay ≤ −balansOldin`) `post()` da,
   * balans `FOR UPDATE` bilan qulflangan holda tekshiriladi.
   */
  prepayMinor?: bigint;
  totalMinor: bigint;
  /**
   * Dollar naqd — mijoz bergan summa SENTDA (MK31). Ixtiyoriy: uzatmagan
   * chaqiruvchi uchun 0 (qaytarish yo'li shu holatda qoladi).
   */
  cashUsdMinor?: bigint;
  /** Kanonik ×10^8 kurs. `cashUsdMinor > 0` bo'lsa MAJBURIY. */
  usdRateE8?: bigint | null;
}

export interface TenderLine {
  method: TenderMethod;
  /**
   * To'lov VALYUTASIDAGI summa (USD → sent). Dollar qatorida bu so'mga
   * o'girilgan qiymat EMAS: kassadagi dollar o'z birligida sanaladi
   * (§8.4 — USD farqi so'mga o'girilmaydi).
   */
  amountMinor: bigint;
  /**
   * Faqat so'mdan farq qilganda yoziladi. So'm qatorlarining SHAKLI
   * ataylab o'zgarmadi — mavjud chaqiruvchilar va testlar tegilmasin.
   */
  currency?: 'UZS' | 'USD';
  /** Qo'llanilgan kurs (kanonik ×10^8) — chekka muzlatiladi. */
  rateMinor?: bigint;
  /** Hisob valyutasiga (so'm) o'girilgan summa. */
  amountBaseMinor?: bigint;
}

/**
 * Qator valyutasi va so'mdagi ekvivalenti — YAGONA o'quvchi.
 *
 * Ikkalasi ham ixtiyoriy maydon ustida `?? default` ishlatadi. Agar har
 * chaqiruvchi buni qo'lda takrorlasa, biri jimgina eskirib dollar qatorini
 * so'm deb o'qib yuborardi (aynan «nusxa bir shoxni yo'qotadi» klassi).
 */
export function lineCurrency(l: TenderLine): 'UZS' | 'USD' {
  return l.currency ?? 'UZS';
}

export function lineBaseMinor(l: TenderLine): bigint {
  return l.amountBaseMinor ?? l.amountMinor;
}

/**
 * USD sent → so'm tiyin, kanonik ×10^8 kurs bilan.
 *
 * Formulaning O'ZI `@moysklad/money` da (`convertByRateE8`) — kassa EKRANI
 * ham o'sha yerdan oladi, chunki kassir ko'rgan so'm ekvivalenti server
 * yozadigan raqam bilan tiyinigacha bir xil bo'lishi kerak. Bu yerdagi nom
 * saqlanadi: mavjud chaqiruvchilar va testlar tegilmaydi.
 */
export function usdBaseMinor(cents: bigint, rateE8: bigint): bigint {
  return convertByRateE8(cents, rateE8);
}

export type TenderResult =
  | {
      ok: true;
      /** Haqiqiy pul (qarzsiz): naqd + karta + terminal. */
      paidMinor: bigint;
      /** Qaytim — faqat naqddan, TZ §6.2. */
      changeMinor: bigint;
      /** `RetailSalePayment` ga yoziladigan qatorlar (nol summalar tushmaydi). */
      lines: TenderLine[];
      /**
       * A2 — avansdan qoplangan ulush. `paidMinor` ga QO'SHILMAYDI (u
       * «yashiqqa/bankka kelgan pul» ma'nosini saqlaydi), lekin chek
       * TO'LANGAN sanalishida hisobga olinadi.
       */
      prepayMinor: bigint;
    }
  | { ok: false; reason: 'negative-input' }
  | { ok: false; reason: 'insufficient'; paidMinor: bigint; totalMinor: bigint }
  | { ok: false; reason: 'debt-overpaid'; paidMinor: bigint; totalMinor: bigint }
  | { ok: false; reason: 'change-exceeds-cash'; changeMinor: bigint; cashMinor: bigint }
  /**
   * A2 — avansdan chek qoldig'idan KO'P to'lanmoqchi. Qaytim BERILMAYDI:
   * avans pul emas, u mijozning bizdagi krediti — undan naqd qaytim berish
   * A3 ning RKO yo'lini (hujjat + iz) chetlab o'tish yo'li bo'lardi.
   */
  | { ok: false; reason: 'prepay-overpaid'; prepayMinor: bigint; allowedMinor: bigint }
  | { ok: false; reason: 'usd-rate-missing' };

export function computeTenders(i: TenderInput): TenderResult {
  const cashUsdMinor = i.cashUsdMinor ?? 0n;
  const prepayMinor = i.prepayMinor ?? 0n;
  const accountMinor = i.accountMinor ?? 0n;
  if (
    i.cashMinor < 0n ||
    i.cardMinor < 0n ||
    i.terminalMinor < 0n ||
    i.debtMinor < 0n ||
    i.totalMinor < 0n ||
    cashUsdMinor < 0n ||
    prepayMinor < 0n ||
    accountMinor < 0n
  ) {
    return { ok: false, reason: 'negative-input' };
  }

  // TZ §6.2: kurs topilmasa to'lov BLOKLANADI. Jim 1:1 qabul qilish sentni
  // tiyin deb o'qirdi — chek «to'liq to'landi» bo'lib yopilar, kassa esa
  // haqiqiy summaning ~12 000 dan bir qismini olgan bo'lardi.
  const usdRateE8 = i.usdRateE8 ?? null;
  if (cashUsdMinor > 0n && (usdRateE8 == null || usdRateE8 <= 0n)) {
    return { ok: false, reason: 'usd-rate-missing' };
  }
  const usdBase =
    cashUsdMinor > 0n && usdRateE8 != null ? usdBaseMinor(cashUsdMinor, usdRateE8) : 0n;

  // ACCOUNT — haqiqiy pul (bankka tushadi), shuning uchun `paidMinor` ichida;
  // lekin u NAQD EMAS: qaytim chegarasiga (`cashLikeMinor`) KIRMAYDI.
  const paidMinor = i.cashMinor + usdBase + i.cardMinor + i.terminalMinor + accountMinor;

  // 🔴 A2 — AVANS QAYTIM BERMAYDI (invariant 5 ning tender tomondagi shakli).
  //
  // Ruxsat etilgan avans ulushi = chekning boshqa hamma tender'dan KEYINGI
  // qoldig'i. Ya'ni avans hech qachon `changeMinor` ga hissa qo'sha olmaydi.
  //
  // NEGA shunchaki `changeMinor > cashLike` tekshiruvi YETARLI EMAS: naqd ham
  // aralashgan chekda (naqd 50k + avans 30k, jami 60k) qaytim 20k bo'lib
  // `cashLike = 50k` chegarasidan O'TIB KETARDI — natijada mijozning avansi
  // yashiqdan NAQD bo'lib chiqib ketardi, hujjatsiz va izsiz. Avansni naqdga
  // aylantirishning YAGONA yo'li — A3 ning RKO (`customer-prepay-refund`)
  // hujjati.
  //
  // Qoida tartibdan MUSTAQIL: kassir avansni oldin kiritsa ham, keyin
  // kiritsa ham AYNI natija chiqadi.
  const prepayAllowedMinor =
    i.totalMinor - i.debtMinor - paidMinor > 0n ? i.totalMinor - i.debtMinor - paidMinor : 0n;
  if (prepayMinor > prepayAllowedMinor) {
    return { ok: false, reason: 'prepay-overpaid', prepayMinor, allowedMinor: prepayAllowedMinor };
  }

  if (i.debtMinor > 0n) {
    // Qarzli chekda ARIFMETIKA ANIQ bo'lishi shart: to'langan + qarz = jami.
    // «Ko'proq to'lab, qolganini qarzga yozish» ma'nosiz — va agar ruxsat
    // berilsa, qarz summasi bilan haqiqiy qoldiq bir-biriga mos kelmay
    // qoladi, ya'ni mijoz balansiga noto'g'ri raqam tushadi.
    // A2: avans ulushi ham QOPLAMA — u tovar puli (faqat oldinroq olingan).
    const covered = paidMinor + prepayMinor + i.debtMinor;
    if (covered < i.totalMinor) {
      return { ok: false, reason: 'insufficient', paidMinor: covered, totalMinor: i.totalMinor };
    }
    if (covered > i.totalMinor) {
      return { ok: false, reason: 'debt-overpaid', paidMinor: covered, totalMinor: i.totalMinor };
    }
    return { ok: true, paidMinor, changeMinor: 0n, lines: linesOf(i, usdBase), prepayMinor };
  }

  if (paidMinor + prepayMinor < i.totalMinor) {
    return {
      ok: false,
      reason: 'insufficient',
      paidMinor: paidMinor + prepayMinor,
      totalMinor: i.totalMinor,
    };
  }

  // Yuqoridagi `prepayAllowedMinor` qo'riqchisi tufayli avans bu ayirmaga
  // hissa QO'SHA OLMAYDI: qaytim faqat naqd/karta ortiqchasidan tug'iladi.
  const changeMinor = paidMinor + prepayMinor - i.totalMinor;
  // TZ §6.2: qaytim faqat naqddan. Karta/terminal ortiqcha o'tkazilgan bo'lsa
  // kassa uni naqd pul bilan qaytarib bera olmaydi — bu kassadan pul yo'qotish
  // yo'li. Shuning uchun bloklaymiz, jim qabul qilmaymiz.
  //
  // MK31: dollar ham NAQD, shuning uchun chegaraga uning so'mdagi ekvivalenti
  // ham kiradi. Aks holda $10 bilan 10 000 so'mlik tovar olgan mijozning cheki
  // «qaytim naqddan ko'p» deb rad etilardi — dollar to'lovi amalda ishlamas edi.
  // Qaytimning O'ZI doim so'mda (yashiqdagi dollarni maydalash yo'li yo'q).
  const cashLikeMinor = i.cashMinor + usdBase;
  if (changeMinor > cashLikeMinor) {
    return { ok: false, reason: 'change-exceeds-cash', changeMinor, cashMinor: cashLikeMinor };
  }

  return { ok: true, paidMinor, changeMinor, lines: linesOf(i, usdBase), prepayMinor };
}

function linesOf(i: TenderInput, usdBase: bigint): TenderLine[] {
  const out: TenderLine[] = [];
  if (i.cashMinor > 0n) out.push({ method: TENDER.cashUzs, amountMinor: i.cashMinor });
  // Dollar qatori — ASL summa sentda, kurs va so'mdagi ekvivalenti bilan.
  if ((i.cashUsdMinor ?? 0n) > 0n && i.usdRateE8 != null) {
    out.push({
      method: TENDER.cashUsd,
      amountMinor: i.cashUsdMinor as bigint,
      currency: 'USD',
      rateMinor: i.usdRateE8,
      amountBaseMinor: usdBase,
    });
  }
  if (i.cardMinor > 0n) out.push({ method: TENDER.card, amountMinor: i.cardMinor });
  if (i.terminalMinor > 0n) out.push({ method: TENDER.terminal, amountMinor: i.terminalMinor });
  if ((i.accountMinor ?? 0n) > 0n)
    out.push({ method: TENDER.account, amountMinor: i.accountMinor as bigint });
  // A2 — avans qatori QARZDAN OLDIN: chekda «avansdan» to'langan qism
  // to'lovlar orasida, qarz esa doim oxirida (kassir odatlangan tartib).
  if ((i.prepayMinor ?? 0n) > 0n)
    out.push({ method: TENDER.prepay, amountMinor: i.prepayMinor as bigint });
  if (i.debtMinor > 0n) out.push({ method: TENDER.debt, amountMinor: i.debtMinor });
  return out;
}

/**
 * Orqaga moslik (TZ §6.3): mavjud `cashAmountMinor` / `cardAmountMinor`
 * ustunlari hisoblanuvchi bo'lib qoladi, shunda eski hisobotlar va
 * `moysklad-compat` qatlami buzilmaydi.
 *
 * Terminal `card` yig'indisiga qo'shiladi — ikkalasi ham bank orqali keladigan
 * naqdsiz pul; eski hisobotlar uchun «naqd emas» degani muhim, kanal emas.
 *
 * ⚠️ **`CASH_USD` bu yerga TUSHMAYDI** (MK31) — TZ §6.3 «CASH_* yig'indisi»
 * degan bo'lsa ham. Sabab: `cashAmountMinor` ni jonli o'quvchilar SO'MDAGI
 * naqd deb o'qiydi (`collectCashInputs` kutilgan naqdi, POS pul xulosasi).
 * Dollarning so'mdagi ekvivalentini shu ustunga qo'shsak, smenaning kutilgan
 * so'm naqdi o'sha summacha oshib, AYNAN shu faza tuzatayotgan soxta farq
 * qaytib kelardi. Dollar oqimi `RetailSalePayment` qatorlaridan o'qiladi —
 * §6.3 ning maqsadi (eski hisobotlar buzilmasin) shunda ham saqlanadi.
 */
export function legacyTotals(lines: ReadonlyArray<TenderLine>): {
  cashAmountMinor: bigint;
  cardAmountMinor: bigint;
} {
  let cashAmountMinor = 0n;
  let cardAmountMinor = 0n;
  for (const l of lines) {
    if (l.method === TENDER.cashUzs) cashAmountMinor += l.amountMinor;
    else if (
      l.method === TENDER.card ||
      l.method === TENDER.terminal ||
      // ACCOUNT ham bank orqali keladigan naqdsiz pul — eski hisobotlar uchun
      // «naqd emas» degani muhim, kanal emas (terminal bilan bir xil qaror).
      l.method === TENDER.account
    ) {
      cardAmountMinor += l.amountMinor;
    }
    // ⚠️ A2 — `PREPAY` bu yerga TUSHMAYDI va tushmasligi SHART. Bu ikki ustunni
    // jonli o'quvchilar PUL deb o'qiydi (`collectCashInputs` kutilgan naqdi,
    // Z-hisobot, `computeRefundSettlementCaps` ning naqd cap'i). Avansni
    // ularga qo'shsak smenaning kutilgan naqdi hech kim bermagan pulga oshib,
    // kassirga SOXTA KAMOMAD yozilardi — `CASH_USD` ning yuqoridagi sabog'i
    // bilan AYNAN bir sinf. `DEBT` ham shu sababdan bu yerda yo'q.
  }
  return { cashAmountMinor, cardAmountMinor };
}
