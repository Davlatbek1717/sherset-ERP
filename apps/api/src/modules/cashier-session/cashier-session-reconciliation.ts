/**
 * Cashier-shift cash reconciliation — pure, exact BigInt money math.
 *
 * moysklad «Кассовая смена» close reconciliation. Until §100 the
 * expected-cash formula OMITTED drawer Внесение/Изъятие
 * (cashier-session.service close() ⇒ opening + salesCash − returnsCash),
 * so any mid-shift drawer cash-in/out produced a WRONG discrepancy
 * (false shortage/surplus). The correct formula is:
 *
 *   expectedCash = opening + salesCash + drawerIn + debtCash
 *                − drawerOut − returnsCash
 *   discrepancy  = closingCash − expectedCash
 *
 * All values are tiyin (BigInt) — no floating point. Extracted as a pure
 * function so the money invariant is adversarially tested (the §74
 * pattern), not just asserted "by construction".
 *
 * Invariants (proven in cashier-session-reconciliation.test.ts):
 *  1. drawerIn raises expected by exactly drawerIn; drawerOut lowers it
 *     by exactly drawerOut (the §100 bug-fix invariant).
 *  2. drawerIn = drawerOut = 0n ⇒ formula === the old
 *     opening+sales−returns (byte-identical; zero regression).
 *  3. discrepancy = closing − expected, exact (sign = surplus/shortage).
 *  4. exact past Number.MAX_SAFE_INTEGER (BigInt); negative expected is
 *     allowed (over-withdrawal) and must NOT be clamped.
 */

export interface ShiftCashInputs {
  /** Cash float the drawer started the shift with. */
  openingCashMinor: bigint;
  /** Σ cash portion of posted retail sales in the shift. */
  salesCashMinor: bigint;
  /** Σ Внесение (drawer cash-in) during the shift. */
  drawerInMinor: bigint;
  /** Σ Изъятие (drawer cash-out) during the shift. */
  drawerOutMinor: bigint;
  /** Σ cash portion of posted refunds in the shift. */
  returnsCashMinor: bigint;
  /**
   * Σ NAQD qarz to'lovlari (kassa TZ §8.4 — «+ naqd qarz to'lovlari»).
   *
   * Busiz kassir qabul qilgan qarz puli yashiqda turadi-yu, kutilganda
   * ko'rinmaydi — har smena yakunida soxta ORTIQCHA chiqardi va farq akti
   * ma'nosini yo'qotardi.
   *
   * Ixtiyoriy: eski chaqiruvchilar uzatmasa 0 deb qaraladi (regressiya yo'q).
   */
  debtCashMinor?: bigint;
}

/** Cash that SHOULD be in the drawer at close. */
export function expectedCashMinor(i: ShiftCashInputs): bigint {
  return (
    i.openingCashMinor +
    i.salesCashMinor +
    i.drawerInMinor +
    (i.debtCashMinor ?? 0n) -
    i.drawerOutMinor -
    i.returnsCashMinor
  );
}

/**
 * closingCash − expectedCash. Positive = surplus (излишек),
 * negative = shortage (недостача). Never clamped.
 */
export function shiftDiscrepancyMinor(closingCashMinor: bigint, i: ShiftCashInputs): bigint {
  return closingCashMinor - expectedCashMinor(i);
}

// ── Dollar naqd (MK31 · kassa TZ §8.4) ──────────────────────────────────────

/**
 * Yashiqdagi DOLLAR oqimi — sentda.
 *
 * ATAYLAB alohida tip va alohida funksiya, `ShiftCashInputs` ga `usd*`
 * maydon qo'shilmadi. Ikkalasi ham `bigint` bo'lgani uchun bitta noto'g'ri
 * chaqiruv dollarni so'm jamiga qo'shib yuborardi va typecheck buni
 * KO'RMASDI — §8.4 esa aynan «USD so'mga o'girilmaydi» deydi.
 *
 * Yashiq amallari (Внесение/Изъятие) bu formulada YO'Q: ular hujjat
 * sifatida kassaning o'z valyutasida yoziladi (`loadOpenShiftForDrawer`),
 * ya'ni dollar yashiq amali hozircha mavjud emas. Qo'shilgan kunda bu
 * yerga ikki a'zo qo'shiladi — o'shanda soxta «dollar ortiqcha» chiqmasligi
 * uchun test bilan birga.
 */
export interface ShiftUsdCashInputs {
  /** Smena boshidagi dollar (sent). */
  openingUsdMinor: bigint;
  /** Σ `CASH_USD` to'lovlar — chekdagi ASL sent summasi. */
  salesUsdMinor: bigint;
  /** Σ qaytarilgan cheklardagi `CASH_USD` (hozircha 0 — dollar qaytarish yo'li yo'q). */
  returnsUsdMinor: bigint;
  /**
   * Σ DOLLARDA qabul qilingan naqd qarz to'lovlari — SENTDA (F6, audit §F6.6).
   *
   * Manba `DebtPayment.amountOriginalMinor` (mijoz JISMONAN bergan pul),
   * `amountMinor` EMAS: u har doim so'm ekvivalentida turadi. Shu ajratmasiz
   * dollar to'lov so'm-kutilganiga qo'shilib, kassirga **soxta so'm kamomadi**
   * yozilardi, yashiqdagi dollar esa umuman hisobga olinmasdi.
   *
   * Ixtiyoriy: eski chaqiruvchilar uzatmasa 0 (regressiya yo'q).
   */
  debtUsdMinor?: bigint;
}

/** Yashiqda smena oxirida bo'lishi KERAK bo'lgan dollar (sent). */
export function expectedUsdCashMinor(i: ShiftUsdCashInputs): bigint {
  return i.openingUsdMinor + i.salesUsdMinor + (i.debtUsdMinor ?? 0n) - i.returnsUsdMinor;
}

/** countedUsd − expectedUsd. Musbat = ortiqcha, manfiy = kamomad. Qirqilmaydi. */
export function shiftUsdDiscrepancyMinor(countedUsdMinor: bigint, i: ShiftUsdCashInputs): bigint {
  return countedUsdMinor - expectedUsdCashMinor(i);
}
