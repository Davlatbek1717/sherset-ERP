/**
 * «Kim kimdan qancha qarzdor» — kontragent bo'yicha YAGONA hisob-kitob.
 *
 * NIMA UCHUN KERAK
 * ----------------
 * Bu loyihada kontragent qarzi IKKI mustaqil daftar orqali yuritiladi va ular
 * hech qayerda birlashtirilmagan edi:
 *
 *  1. `CounterpartyBalance` — materiallashgan bosh daftar, har (kontragent,
 *     valyuta) uchun bitta qator. Uni FAQAT `CounterpartyBalanceService.applyDelta`
 *     o'zgartiradi, ya'ni post qilingan HAR hujjat shu yerdan o'tadi: InvoiceOut(+),
 *     InvoiceIn(−), **Supply(−)**, PaymentIn(−), PaymentOut(+), CashIn(−),
 *     CashOut(+), Prepayment(−), PrepaymentReturn(+), CounterpartyAdjustment(±).
 *     Ishora: MUSBAT = kontragent bizga qarzdor · MANFIY = biz unga qarzdormiz.
 *
 *  2. `Debt` reyestri (QRZ-YYYY-NNNNN) — kassir qo'lda ochadigan qarz kartochkasi.
 *     Qoldiq = totalMinor − paidMinor.
 *
 * Ilgari kontragentga ketadigan har hisobot balansni hujjatlardan QAYTA qurardi
 * va har biri boshqacha ro'yxat ishlatardi (biri Supply'ni tashlab ketardi, biri
 * Prepayment'ni) — natijada bitta kontragent uchun uch xil son chiqardi. Bu modul
 * shu qayta-qurishni umuman bekor qiladi: **manba — materiallashgan balansning
 * o'zi**, chunki unga hamma yo'l `applyDelta` orqali yozadi.
 *
 * ⚠️ IKKI DAFTAR QO'SHILMAYDI — reyestr qoldig'i saldoning ICHIDA (2026-08-08,
 * Faza 12 `DUP-04`). QRZ- qarz endi bosh daftarga TO'LIQ tushadi:
 * `DebtService.create` → `applyDelta(+total)`, to'lov → `applyDelta(−paid)`,
 * o'chirish → `applyDelta(−total)`. Ya'ni `ledgerBalanceMinor` allaqachon
 * reyestr qarzini o'z ichiga oladi; `debtRegistryOutstandingMinor` — o'sha
 * saldoning QAYSI QISMI qarz kartochkalaridan kelganini ko'rsatadigan
 * TARKIB («shundan …»), qo'shiluvchi emas.
 *
 * Shu sababli ilgari bu yerda bo'lgan `combinedMinor = ledger + registry`
 * maydoni OLIB TASHLANDI: 2026-08-05 dan keyin u har ochiq QRZ- qarzni IKKI
 * marta sanardi (eski premise — «`create` balansga umuman tegmaydi» — o'sha
 * kuni eskirgan edi, izoh esa qolib ketgan). Yig'indi kerak deb o'ylagan
 * har qanday iste'molchi `ledgerBalanceMinor` ni olsin.
 *
 * ⚠️ TARIXIY QARZLAR: 2026-08-05 dan OLDIN ochilgan QRZ- qarz bosh daftarga
 * tushmagan bo'lishi mumkin (o'shanda `create` yozmasdi) — bunday qarz uchun
 * reyestr qoldig'i saldoning ichida EMAS. Prodda o'sha sanada 0 qarz / 0
 * to'lov bo'lgani tekshirilgan, shuning uchun amalda bunday qator yo'q.
 *
 * ⚠️ VALYUTALAR QO'SHILMAYDI. Har valyuta o'z qatorida qoladi — ilgari akt-sverka
 * USD sentlarini UZS tiyinlariga qo'shib, natijani «so'm» deb imzolardi.
 */

/** Bitta valyuta kesimidagi yakuniy hisob-kitob. */
export interface SettlementLine {
  currency: string;
  /**
   * Materiallashgan bosh daftar saldosi (tiyin).
   * MUSBAT = kontragent bizga qarzdor · MANFIY = biz unga qarzdormiz.
   */
  ledgerBalanceMinor: bigint;
  /**
   * QRZ- reyestridagi yopilmagan qoldiq (tiyin). Har doim ≥ 0 (ular bizga qarz).
   *
   * TARKIB, qo'shiluvchi EMAS: bu summa `ledgerBalanceMinor` ichida allaqachon
   * bor (yuqoridagi izoh). Hisobotlarda «shundan qarz kartochkalari bo'yicha …»
   * qatori sifatida ko'rsatiladi.
   */
  debtRegistryOutstandingMinor: bigint;
}

export interface Settlement {
  /** Har valyuta uchun bitta qator; valyuta kodi bo'yicha saralangan (UZS birinchi). */
  lines: SettlementLine[];
  /**
   * Asosiy qator — UZS bo'lsa o'sha, aks holda birinchisi; umuman harakat
   * bo'lmagan kontragentda `null`.
   */
  primary: SettlementLine | null;
}

export interface SettlementInput {
  /** `CounterpartyBalance` qatorlari (materiallashgan saldo). */
  balances: Array<{ currency: string; balanceMinor: bigint }>;
  /** Yopilmagan `Debt` yozuvlari — qoldiq shu yerda hisoblanadi. */
  debts: Array<{ currency: string; totalMinor: bigint; paidMinor: bigint }>;
}

/** Bo'sh qator — valyuta ko'rindi-yu, ikkala daftarda ham 0. */
function emptyLine(currency: string): SettlementLine {
  return {
    currency,
    ledgerBalanceMinor: 0n,
    debtRegistryOutstandingMinor: 0n,
  };
}

/**
 * Ikki daftardan valyuta kesimidagi yakuniy holatni yig'adi.
 *
 * Faqat sof funksiya — DB'ga tegmaydi, shuning uchun to'liq testlanadi.
 * Yopilmagan qarz qoldig'i MANFIY bo'lib ketmaydi: ortiqcha to'lov (paid > total)
 * 0 ga qisiladi, aks holda ortiqcha to'lov «biz ularga qarzdormiz» bo'lib
 * reyestr qatoriga sizib kirardi — holbuki ortiqcha to'lov bosh daftarda
 * `applyDelta(−paid)` orqali allaqachon aks etgan.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const byCurrency = new Map<string, SettlementLine>();

  for (const b of input.balances) {
    const cur = b.currency.toUpperCase();
    const line = byCurrency.get(cur) ?? emptyLine(cur);
    line.ledgerBalanceMinor += b.balanceMinor;
    byCurrency.set(cur, line);
  }

  for (const d of input.debts) {
    const cur = d.currency.toUpperCase();
    const line = byCurrency.get(cur) ?? emptyLine(cur);
    const remaining = d.totalMinor - d.paidMinor;
    if (remaining > 0n) line.debtRegistryOutstandingMinor += remaining;
    byCurrency.set(cur, line);
  }

  // UZS birinchi (asosiy valyuta), qolgani alifbo bo'yicha — chiqish barqaror
  // bo'lsin, aks holda Excel/xabar qatorlari har safar boshqa tartibda chiqardi.
  const lines = [...byCurrency.values()].sort((a, b) => {
    if (a.currency === b.currency) return 0;
    if (a.currency === 'UZS') return -1;
    if (b.currency === 'UZS') return 1;
    return a.currency < b.currency ? -1 : 1;
  });

  return { lines, primary: lines[0] ?? null };
}

/** Tiyin → «1 250 000» (ishorasiz, absolyut). */
export function formatSettlementAmount(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const whole = abs / 100n;
  const cents = abs % 100n;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  // Tiyinlar odatda 0 — faqat mavjud bo'lganda ko'rsatamiz (chek/akt odati).
  return cents === 0n ? grouped : `${grouped},${cents.toString().padStart(2, '0')}`;
}

/** Valyuta kodi → xabarda ko'rsatiladigan birlik. */
export function currencyUnit(currency: string): string {
  return currency.toUpperCase() === 'UZS' ? "so'm" : currency.toUpperCase();
}

/**
 * KONTRAGENTGA ketadigan matn (ularning nuqtai nazari, «siz»).
 * `amountMinor` — ishorali: musbat = ular bizga qarzdor.
 */
export function settlementTextForCounterparty(amountMinor: bigint, currency: string): string {
  const amt = `${formatSettlementAmount(amountMinor)} ${currencyUnit(currency)}`;
  if (amountMinor > 0n) return `Sizda ${amt} qarz bor.`;
  if (amountMinor < 0n) return `Sizga ${amt} qarzimiz bor — tez orada to'lanadi.`;
  return "Hisob teng — qarz yo'q.";
}

/** EGAGA (admin bot) ketadigan matn — kim kimdan qarzdorligi ochiq aytiladi. */
export function settlementTextForOwner(
  name: string,
  amountMinor: bigint,
  currency: string,
): string {
  const amt = `${formatSettlementAmount(amountMinor)} ${currencyUnit(currency)}`;
  if (amountMinor > 0n) return `«${name}» bizga ${amt} qarzdor.`;
  if (amountMinor < 0n) return `Biz «${name}»ga ${amt} qarzdormiz.`;
  return `«${name}» bilan hisob teng — qarz yo'q.`;
}
