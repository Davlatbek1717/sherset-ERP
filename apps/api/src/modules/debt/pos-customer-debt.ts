/**
 * F9 — POS mijoz kartasi: **ikki qarz daftarini ochiq qilish** (sof modul).
 *
 * 🔴 P1 (2026-08-11) YANGILANISHI — pastdagi «NEGA BU YERDA UCHRASHTIRILMAYDI»
 * qarori BEKOR QILINDI. Endi POS to'lovi ham BALANS bo'yicha ishlaydi:
 * `debtPayable` + `planAdoption` (shu faylning oxirida) reyestrdan tashqaridagi
 * qarzni to'lov paytida reyestrga OLIB KIRADI (adopsiya). Sarlavhadagi tarix
 * ataylab saqlanadi — u yoriqning KELIB CHIQISHINI tushuntiradi.
 *
 * MUAMMO (kod bilan o'lchangan, 2026-08-11). Bu loyihada mijoz qarzi ikki
 * joyda yashaydi va ular BIR XIL emas:
 *
 *   1. `CounterpartyBalance` — universal balans. POS'da qarzga sotilgan chek
 *      AYNAN shu yerga tushadi (`retail-sale.service.ts`, `post()`:
 *      `if (debtAmount > 0n && debtAgentId) counterpartyBalance.applyDelta(+)`);
 *      qaytarish esa shu yerdan ayiradi (`refund()`: `-debtReturn`).
 *      🔴 «`Debt` reyestrini ATAYLAB yozmaydi» — **BEKOR QILINDI (Q2,
 *      2026-08-25)**. Endi `post()` reyestrga ham qator ochadi, lekin u
 *      `balanceAdopted = true` va `applyDelta` CHAQIRMAYDI — ya'ni pul
 *      daftari HAMON bir marta harakatlanadi, reyestr esa o'sha qarzni
 *      undirish ro'yxatiga KO'RINADIGAN qiladi. Eski matn tarix uchun:
 *      «aks holda qarz ikki marta sanalardi (xotira: `debt-ledger-asymmetry`)».
 *   2. `Debt` reyestri (`QRZ-…`) — qo'lda ochiladigan qarzlar. POS «Qarz
 *      to'lovi» FIFO'si FAQAT shu reyestrni yopadi
 *      (`pos-debt-payment.service.ts#lockOpenDebts`).
 *
 * OQIBAT: kassir qarzga sotadi → ertasiga mijoz to'lagani keladi → «Qarz
 * to'lovi» oynasi «ochiq qarz yo'q» deydi. Pulni qabul qilish yo'li yo'q.
 *
 * 🔴 Q2 (2026-08-25) — BERISH yo'li ham yopildi. Chekdan tug'ilgan qator endi
 * reyestrda darhol paydo bo'ladi, ya'ni `unregisteredMinor` yangi cheklar
 * uchun 0 ga tushadi va adopsiya yo'li faqat BOSHQA manbalar (`InvoiceOut`,
 * `CashOut`, qo'lda `CounterpartyAdjustment`) va Q2 dan OLDINGI eski cheklar
 * uchun qoladi. `debtPayable = max(reyestr, balans)` formulasi O'ZGARMAYDI —
 * ikki son shunchaki tenglashadi, ya'ni kassir ekranidagi raqam ham o'sha.
 *
 * NEGA BU YERDA UCHRASHTIRILMAYDI (F9 qarori — P1 da BEKOR qilindi, quyidagi
 * «ADOPSIYA» bo'limiga qarang): ikkalasini bitta raqamga
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

// ─────────────────────────── ADOPSIYA (P1, 2026-08-11) ──────────────────────
//
// 🔴 QAROR: «bitta daftar — bitta haqiqat» endi TO'LOV yo'lida ham amal qiladi.
//
// Muammo (prodda o'lchangan): `Debt` reyestri 0 qator, `DebtPayment` 0, lekin
// `CounterpartyBalance`da 15+ kontragentda katta qoldiq. POS FIFO'si faqat
// reyestrni yopgani uchun mijoz kassaga pul olib kelsa QABUL QILISH YO'LI YO'Q.
//
// Ko'rib chiqilgan ikki variant:
//   (A) `DebtPayment.debtId` ni nullable qilish va «reyestrsiz to'lov» yozish.
//       RAD ETILDI: `debtId` — butun modulning o'qi (recalc, storno marshruti
//       `/debts/:debtId/payments/:id/reverse`, PKO cheki `payment.debt.name`,
//       hisobotlar). Nullable qilish har bir o'quvchida yangi `null` shoxi
//       ochardi — bitta faza ichida xavfsiz qamrab bo'lmaydigan kenglik.
//   (B) ✅ TANLANDI — **adopsiya**: to'lov paytida balansdagi qarzning AYNAN
//       to'lanayotgan qismi uchun reyestrga qator ochiladi va o'sha qator
//       darhol to'liq yopiladi. Pastdagi hamma yo'l (FIFO · recalc · kassa
//       daftari · smena naqdi · PKO cheki · storno) O'ZGARISHSIZ ishlaydi.
//
// ⚠️ ADOPSIYA QATORI BALANSGA `+total` YOZMAYDI (`Debt.balanceAdopted = true`).
// Sabab: qarz balansda ALLAQACHON bor — qo'shsak IKKI KARRA sanalardi. Shuning
// uchun `remove()` ham unga `−total` yozmasligi shart (simmetriya).
//
// NEGA «to'lanayotgan qism», butun qoldiq emas: butun qoldiqni adopsiya qilsak
// 15 kontragent birinchi to'lovdayoq reyestrga OCHIQ qarz bo'lib kirardi va
// qarzdorlar ro'yxati / eslatma cron / Telegram oqimi kutilmaganda portlardi.
// To'lanayotgan qism esa o'sha tranzaksiyada `paid` bo'lib yopiladi — u faqat
// TARIX (kim, qachon, qancha), yangi dunning nishoni emas.

/** `debtPayable` natijasi — ekran ham, server ham AYNAN shu qoidadan yuradi. */
export interface DebtPayablePlan {
  /** POS qabul qila oladigan MAKSIMUM (kassa valyutasi, minor). */
  payableMinor: bigint;
  /** Shundan reyestrda YO'Q, balansdan olib kirish mumkin bo'lgan qism. */
  adoptableMinor: bigint;
}

/**
 * «To'lanadigan qarz» — kassir ekranda ko'radigan va server qabul qiladigan son.
 *
 * Qoida: balans reyestrdan KATTA bo'lsa — balans (farqi adopsiya qilinadi);
 * aks holda reyestr (mavjud xulq). `null` balans = O'LCHANMAGAN, «0» emas —
 * uni 0 deb o'qish reyestrdagi haqiqiy qarzni ham to'lanmaydigan qilardi.
 * Manfiy balans = BIZ qarzdormiz ⇒ undan qarz olinmaydi.
 */
export function debtPayable(
  balanceMinor: bigint | null,
  registryOutstandingMinor: bigint,
): DebtPayablePlan {
  const registry = registryOutstandingMinor > 0n ? registryOutstandingMinor : 0n;
  if (balanceMinor === null || balanceMinor <= registry) {
    return { payableMinor: registry, adoptableMinor: 0n };
  }
  return { payableMinor: balanceMinor, adoptableMinor: balanceMinor - registry };
}

/**
 * A2 (2026-08-25) — mijozning ISHLATSA BO'LADIGAN avansi (kassa valyutasi).
 *
 * Manfiy balans «biz mijozga qarzdormiz» degani (`counterparty-settlement.util.ts`
 * sarlavhasidagi rasmiy ta'rif), ya'ni avans AYNAN `−balanceMinor`.
 *
 * 🔴 `debtPayable` NING KO'ZGUSI, va ikkalasi bir-birini INKOR qiladi: bir
 * paytda ikkalasi ham noldan katta bo'lolmaydi (bitta ustunning ikki tomoni).
 * Shu sababdan kassir ekranida ham ikkisidan FAQAT BITTASI ko'rsatiladi.
 *
 * `null` = O'LCHANMAGAN (balans qatori yo'q), «0» EMAS — lekin AVANS uchun
 * ikkalasi ham 0 beradi: qatori yo'q mijozda avans ham yo'q. Bu ehtiyotkor
 * tomon (yo'q pulni sarflatmaymiz); `debtPayable` da esa aynan bu farq QAROR
 * o'zgartiradi, shuning uchun u yerda `null` alohida shox.
 *
 * ⚠️ Bu — A3 ning to'liq `customerStanding` sof moduli EMAS (u to'rt holatni
 * — qarz / avans / nol / o'lchanmagan — va ekran yorliqlarini beradi). A2 ga
 * kerak bo'lgan MINIMUM shu yerda qurildi; A3 uni shu funksiya ustiga
 * quradi, ikkinchi formula yozmasdan.
 */
export function prepayAvailable(balanceMinor: bigint | null): bigint {
  if (balanceMinor === null || balanceMinor >= 0n) return 0n;
  return -balanceMinor;
}

export interface AdoptionPlanInput {
  /** Kelgan to'lov, QARZ valyutasiga keltirilgan (USD → so'm) minor. */
  amountMinor: bigint;
  /** `Debt` reyestridagi ochiq qoldiq (qulflangan qatorlardan). */
  registryOutstandingMinor: bigint;
  /** Kontragentning qarz-valyutasidagi balansi; `null` = qator yo'q. */
  balanceMinor: bigint | null;
}

export interface AdoptionPlan {
  /** Reyestrga ochiladigan adopsiya qatorining summasi (`0` = kerak emas). */
  adoptMinor: bigint;
  /** Hech qayerga sig'magan ortiqcha — chaqiruvchi buni 400 bilan rad etadi. */
  overpayMinor: bigint;
}

/**
 * Kelgan summani ikki daftar bo'yicha taqsimlash REJASI (DB yo'q, sof qoida).
 *
 * Tartib ATAYLAB shunday: avval REYESTR (eng eski qarzlar FIFO'si), qolgani
 * balansdan adopsiya. Aks holda qo'lda ochilgan `QRZ-` qarzlar hech qachon
 * yopilmasdi va «muddati o'tgan» hisoboti yolg'on bo'lardi.
 */
export function planAdoption({
  amountMinor,
  registryOutstandingMinor,
  balanceMinor,
}: AdoptionPlanInput): AdoptionPlan {
  const registry = registryOutstandingMinor > 0n ? registryOutstandingMinor : 0n;
  const need = amountMinor - registry;
  if (need <= 0n) return { adoptMinor: 0n, overpayMinor: 0n };

  const { adoptableMinor } = debtPayable(balanceMinor, registry);
  const adoptMinor = need <= adoptableMinor ? need : adoptableMinor;
  return { adoptMinor, overpayMinor: need - adoptMinor };
}

/**
 * A3 (2026-08-25) — MIJOZNING HOLATI: kassir ekranidagi BITTA yirik sonning
 * ma'nosi. `debtPayable` (qarz) va `prepayAvailable` (avans) ustiga quriladi —
 * bu yerda **ikkinchi formula YO'Q**, faqat ikkovidan qaysi biri ko'rsatilishi
 * hal qilinadi.
 *
 * Nega kerak edi: A1/A2 dan keyin mijozning puli tizimda TURADI, lekin ekran
 * uni ko'rsatmasdi — `payableMinor` manfiy balansda `0` qaytaradi
 * (`debtPayable` — qarzdan avans olinmaydi) va kartadagi yagona yirik son
 * aynan o'sha edi. Kassir «0» ni ko'rib mijozning pulimiz turganini
 * BILMASDI ham (reja §1.3, 3-to'siq).
 *
 * «Bitta yirik son» qoidasi (P2 falsafasi) BUZILMAYDI: ikkinchi raqam
 * qo'shilmaydi — ishoraga qarab YORLIQ va RANG o'zgaradi.
 */
export type CustomerStandingKind =
  /** Mijoz bizga qarzdor — ekranda «To'lanadigan qarz» (mavjud xulq). */
  | 'debt'
  /** Biz mijozga qarzdormiz — ekranda «Avansi». */
  | 'prepaid'
  /** Hisob-kitob tekis: na qarz, na avans. */
  | 'settled'
  /**
   * 🔴 Balans qatori YO'Q — «0» EMAS, O'LCHANMAGAN. Ekran buni «avansi yo'q»
   * deb ko'rsatmasligi SHART (A2 hisobotining 6-eslatmasi): reyestrda ochiq
   * qarz bo'lishi mumkin va u `amountMinor` da qaytadi.
   */
  | 'unmeasured';

export interface CustomerStanding {
  kind: CustomerStandingKind;
  /**
   * Ekranda ko'rsatiladigan YAGONA yirik son. HECH QACHON manfiy emas —
   * ishora `kind` da, sonda emas (manfiy raqamni kassir «minus qarz» deb
   * o'qirdi).
   */
  amountMinor: bigint;
  /**
   * 🔴 NOMUVOFIQLIK: balans manfiy (avans), lekin `Debt` reyestrida ochiq
   * qarz ham bor. Ikki daftar qarama-qarshi gapiradi — biri jimgina
   * bosilmaydi, ekran ogohlantirishni ko'rsatadi
   * (`splitDebtSources.registryExceedsBalance` bilan bir hodisa, lekin bu
   * yerda holatning O'Z signali sifatida qaytariladi).
   */
  conflicted: boolean;
}

/**
 * Balans + reyestrdan ekran holatini chiqaradi.
 *
 * TARTIB ATAYLAB shunday:
 *   1. `null` balans — QAROR qilib bo'lmaydi, ochiq aytiladi (`unmeasured`);
 *   2. avans — pul daftari «biz qarzdormiz» desa, mijozdan qarz SO'RALMAYDI
 *      (reja invariant 4: avansli mijoz undirish oqimiga tushmaydi);
 *   3. qarz — mavjud xulq, bir bayt ham o'zgarmaydi;
 *   4. qolgani — tekis hisob.
 */
export function customerStanding(
  balanceMinor: bigint | null,
  registryOutstandingMinor: bigint,
): CustomerStanding {
  const payableMinor = debtPayable(balanceMinor, registryOutstandingMinor).payableMinor;
  const prepayMinor = prepayAvailable(balanceMinor);

  if (balanceMinor === null) {
    // Reyestrda qarz bo'lsa u ko'rinadi (0 deb yashirilmaydi), lekin holat
    // baribir «o'lchanmagan» — karta buni alohida qator bilan aytadi.
    return { kind: 'unmeasured', amountMinor: payableMinor, conflicted: false };
  }
  if (prepayMinor > 0n) {
    return { kind: 'prepaid', amountMinor: prepayMinor, conflicted: payableMinor > 0n };
  }
  if (payableMinor > 0n) {
    return { kind: 'debt', amountMinor: payableMinor, conflicted: false };
  }
  return { kind: 'settled', amountMinor: 0n, conflicted: false };
}
