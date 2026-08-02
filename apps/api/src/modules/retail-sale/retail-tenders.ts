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

/** To'lov turlari — `RetailSalePayment.method` ustuniga yoziladigan qiymatlar. */
export const TENDER = {
  cashUzs: 'CASH_UZS',
  card: 'CARD',
  /**
   * Bank terminali (plastik karta terminal orqali). TZ ro'yxatida alohida
   * yozilmagan, lekin `/sotuv` to'lov oynasida ALLAQACHON alohida tugma —
   * kassir uchun «karta» (o'tkazma) va «terminal» boshqa-boshqa kanal.
   * Kassir interfeysining lug'atini o'zgartirmadik.
   */
  terminal: 'TERMINAL',
  debt: 'DEBT',
} as const;

export type TenderMethod = (typeof TENDER)[keyof typeof TENDER];

export interface TenderInput {
  cashMinor: bigint;
  cardMinor: bigint;
  terminalMinor: bigint;
  /** Qarzga qoldirilgan qism — pul EMAS, mijoz balansiga yoziladi. */
  debtMinor: bigint;
  totalMinor: bigint;
}

export interface TenderLine {
  method: TenderMethod;
  amountMinor: bigint;
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
    }
  | { ok: false; reason: 'negative-input' }
  | { ok: false; reason: 'insufficient'; paidMinor: bigint; totalMinor: bigint }
  | { ok: false; reason: 'debt-overpaid'; paidMinor: bigint; totalMinor: bigint }
  | { ok: false; reason: 'change-exceeds-cash'; changeMinor: bigint; cashMinor: bigint };

export function computeTenders(i: TenderInput): TenderResult {
  if (
    i.cashMinor < 0n ||
    i.cardMinor < 0n ||
    i.terminalMinor < 0n ||
    i.debtMinor < 0n ||
    i.totalMinor < 0n
  ) {
    return { ok: false, reason: 'negative-input' };
  }

  const paidMinor = i.cashMinor + i.cardMinor + i.terminalMinor;

  if (i.debtMinor > 0n) {
    // Qarzli chekda ARIFMETIKA ANIQ bo'lishi shart: to'langan + qarz = jami.
    // «Ko'proq to'lab, qolganini qarzga yozish» ma'nosiz — va agar ruxsat
    // berilsa, qarz summasi bilan haqiqiy qoldiq bir-biriga mos kelmay
    // qoladi, ya'ni mijoz balansiga noto'g'ri raqam tushadi.
    const covered = paidMinor + i.debtMinor;
    if (covered < i.totalMinor) {
      return { ok: false, reason: 'insufficient', paidMinor: covered, totalMinor: i.totalMinor };
    }
    if (covered > i.totalMinor) {
      return { ok: false, reason: 'debt-overpaid', paidMinor: covered, totalMinor: i.totalMinor };
    }
    return { ok: true, paidMinor, changeMinor: 0n, lines: linesOf(i) };
  }

  if (paidMinor < i.totalMinor) {
    return { ok: false, reason: 'insufficient', paidMinor, totalMinor: i.totalMinor };
  }

  const changeMinor = paidMinor - i.totalMinor;
  // TZ §6.2: qaytim faqat naqddan. Karta/terminal ortiqcha o'tkazilgan bo'lsa
  // kassa uni naqd pul bilan qaytarib bera olmaydi — bu kassadan pul yo'qotish
  // yo'li. Shuning uchun bloklaymiz, jim qabul qilmaymiz.
  if (changeMinor > i.cashMinor) {
    return { ok: false, reason: 'change-exceeds-cash', changeMinor, cashMinor: i.cashMinor };
  }

  return { ok: true, paidMinor, changeMinor, lines: linesOf(i) };
}

function linesOf(i: TenderInput): TenderLine[] {
  const out: TenderLine[] = [];
  if (i.cashMinor > 0n) out.push({ method: TENDER.cashUzs, amountMinor: i.cashMinor });
  if (i.cardMinor > 0n) out.push({ method: TENDER.card, amountMinor: i.cardMinor });
  if (i.terminalMinor > 0n) out.push({ method: TENDER.terminal, amountMinor: i.terminalMinor });
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
 */
export function legacyTotals(lines: ReadonlyArray<TenderLine>): {
  cashAmountMinor: bigint;
  cardAmountMinor: bigint;
} {
  let cashAmountMinor = 0n;
  let cardAmountMinor = 0n;
  for (const l of lines) {
    if (l.method === TENDER.cashUzs) cashAmountMinor += l.amountMinor;
    else if (l.method === TENDER.card || l.method === TENDER.terminal) {
      cardAmountMinor += l.amountMinor;
    }
  }
  return { cashAmountMinor, cardAmountMinor };
}
