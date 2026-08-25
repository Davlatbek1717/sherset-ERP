/**
 * Q1 — POS CHEKIDAN TUG'ILADIGAN REYESTR QATORINING SOF QOIDALARI
 * (reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`, §2.2 / §3).
 *
 * MUAMMO (egasi, 2026-08-25): «kassadan qo'shilgan qarzdorliklar undirish
 * bo'limida ko'rinmayapti». Sabab — qarz IKKI daftarda yashaydi va undirish
 * ro'yxati (`manager/collection/debt-collection.service.ts`) faqat `Debt`
 * reyestridan o'qiydi, POS cheki esa faqat `CounterpartyBalance` ga yozadi.
 * Egasining qarori (B varianti): chekdan reyestrga ham qator ochiladi, lekin
 * u `balanceAdopted = true` bo'ladi — ya'ni balansga QAYTA yozmaydi (P1
 * adopsiya naqshi, `pos-customer-debt.ts` «ADOPSIYA» bo'limi).
 *
 * Bu fayl **SOF**: Prisma yo'q, Nest yo'q, `Date.now()` yo'q — «hozir» har doim
 * argument sifatida kiradi (`debt-collection.ts` bilan bir xil intizom),
 * shuning uchun har qoida testda muzlatilgan vaqt bilan tekshiriladi.
 *
 * ⚠️ Q1 da bu modul HECH KIM tomonidan chaqirilmaydi — xulq o'zgarmaydi.
 * Yozuvchisi Q2 (`retail-sale.service.ts#post`), harakatlantiruvchisi Q3
 * (`refund()` / `edit()`), backfill'i Q5.
 *
 * IKKI MA'LUMOT-SIFATI SHARTNOMASI (repo bo'ylab bir xil):
 *  1. **NULL ≠ 0.** O'lchanmagan balans (`null`) «qarzi yo'q» degani EMAS —
 *     balans qatori faqat birinchi `applyDelta` da tug'iladi
 *     (`pos-customer-debt.ts` `balanceMinor` izohi).
 *  2. **Muddat NULL bo'lmaydi.** Muddatsiz qator undirish ro'yxatida
 *     `no_due_date` chelagiga tushib «kechikkan deb isbotlanmagan» bo'lib
 *     oxirida qolardi (`debt-collection.ts` `bucketOf`), eslatma cron'i esa
 *     uni umuman ko'rmasdi (`debt-reminder.service.ts` — `nextContactAt: { lte: now }`).
 */

/** Toshkent = UTC+5, yil bo'yi (DST yo'q). `debt-collection.ts` bilan bir xil. */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Kassa qarzining default muddati — **14 kun** (egasi, 2026-08-25:
 * «hozircha shunday qur»).
 *
 * 🔴 Q4 (2026-08-25) dan boshlab bu — **ZAXIRA**, yagona haqiqat EMAS:
 * akkaunt `CompanySettings.saleDebtTermDays` bilan boshqa muddat qo'ya oladi.
 * Sozlama YOZILMAGAN bo'lsa (`null`) AYNAN shu qiymat qoladi, ya'ni Q1/Q2/Q3
 * xulqi bir tiyin ham o'zgarmaydi. Chiqarish qoidasi —
 * {@link resolveSaleDebtTermDays}.
 */
export const DEFAULT_SALE_DEBT_TERM_DAYS = 14;

/**
 * Sozlanadigan muddatning chegaralari (Q4).
 *
 * `0` ATAYLAB ruxsat etilgan: «chek o'sha kuniyoq muddatli bo'lsin» — naqd
 * savdo qiladigan nuqtada mantiqiy tanlov. Yuqori chegara bir yil: undan
 * uzoq muddat undirish ro'yxatining ma'nosini yo'qotadi (qator `upcoming`
 * chelagida yillab turardi) va bu — sozlama emas, ma'lumot-sifati xatosi.
 */
export const SALE_DEBT_TERM_DAYS_MIN = 0;
export const SALE_DEBT_TERM_DAYS_MAX = 365;

/**
 * Q4 — akkaunt sozlamasidan muddatni chiqarish (SOF).
 *
 * `null`/`undefined` («hech qachon sozlanmagan») ⇒
 * {@link DEFAULT_SALE_DEBT_TERM_DAYS}. **NULL ≠ 0**: `0` haqiqiy tanlov
 * (o'sha kuniyoq muddat) va u AYNAN `0` bo'lib qaytadi.
 *
 * ⚠️ Yaroqsiz qiymat (butun bo'lmagan, manfiy, chegaradan tashqari, `NaN`)
 * ham default'ga tushadi va **`throw` QILMAYDI**. Sabab: bu qiymat DB'dan
 * o'qiladi va yozuv yo'li (`UpdateCompanySettingsSchema`) uni allaqachon
 * tekshiradi — ya'ni yaroqsiz qiymat faqat qo'lda SQL bilan yozilganda
 * paydo bo'ladi. Bunday holatda chekni 500 bilan yiqitish — kassani
 * to'xtatish demakdir (2026-08-24 hodisasining sinfi); to'g'ri xulq —
 * default bilan davom etish. Chaqiruvchi (Q4 I/O) buni OGOHLANTIRISH LOGI
 * bilan qayd etadi, ya'ni jim emas.
 */
export function resolveSaleDebtTermDays(raw: number | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_SALE_DEBT_TERM_DAYS;
  if (!Number.isInteger(raw)) return DEFAULT_SALE_DEBT_TERM_DAYS;
  if (raw < SALE_DEBT_TERM_DAYS_MIN || raw > SALE_DEBT_TERM_DAYS_MAX) {
    return DEFAULT_SALE_DEBT_TERM_DAYS;
  }
  return raw;
}

/**
 * Sozlama qiymati YAROQSIZ (va shuning uchun default'ga tushdi) — chaqiruvchi
 * shu bilan ogohlantirish logini yozadi. `null`/`undefined` yaroqsiz EMAS:
 * u «sozlanmagan» degani.
 */
export function isSaleDebtTermDaysCorrupt(raw: number | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  return resolveSaleDebtTermDays(raw) !== raw;
}

/**
 * Muddat soati (Toshkent) — mavjud `todayAt9InputValue` odati bilan bir xil
 * (`apps/web/src/lib/debt-api.ts`: «sana ayni vaqtniki, vaqti default 9:00»).
 * Operator ertalab ish boshlaganda muddat allaqachon kelgan bo'ladi.
 */
export const SALE_DEBT_DUE_HOUR_TASHKENT = 9;

/**
 * Qarz DAFTARI valyutasi — **YAGONA e'lon** (Q2, 2026-08-25).
 *
 * Ilgari bu `pos-debt-payment.service.ts` ichida yopiq `const` edi va Q2 ga
 * ikkinchi nusxa kerak bo'lardi. Ikki nusxa — ikki haqiqat: biri o'zgarsa
 * ikkinchisi jimgina eskirardi va chekdan tug'ilgan qator to'lov FIFO'si
 * ko'rmaydigan valyutada ochilib qolardi. Shuning uchun e'lon shu SOF modulga
 * ko'chirildi, chaqiruvchilar undan import qiladi.
 *
 * `DebtPayment.amountMinor` har doim shu valyutada (sxema izohi), FIFO ham
 * valyutaga qaramay so'mda taqsimlaydi. Adopsiya, balans qulfi va Q2 ning
 * chek-qatori ham AYNAN shu valyuta qatoriga tegadi.
 *
 * ⚠️ Kassa yashig'ining valyutasi (`CashDesk.currency`) bundan FARQ qilishi
 * mumkin (MK31 — dollar yashiq). Chek qarzi mijoz balansiga YASHIQ valyutasida
 * yoziladi, reyestr esa shu yerdagi valyutada yuritiladi — ikkalasi bir xil
 * bo'lmasa Q2 qator OCHMAYDI (§2.3 chegarasi: «USD qarz — alohida ish»).
 */
export const DEBT_LEDGER_CURRENCY = 'UZS';

/** `sourceDocType` qiymati — POS chekidan tug'ilgan qator (Q1 migratsiyasi). */
export const SALE_DEBT_SOURCE_DOC_TYPE = 'retailsale';

/** Bir sanani Toshkent kalendar kuniga (`YYYY-MM-DD`) aylantiradi. */
export function tashkentDayKey(d: Date): string {
  return new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 🔴 §2.2 KESISHUV QOIDASI — «chek balansni musbat hududga QANCHAGA olib kirdi».
 *
 * Reyestr qatorining summasi chekning qarz ulushi EMAS. Mijozning AVANSI
 * (manfiy balans) bo'lsa, qarzga sotilgan chek hech qanday qarz tug'dirmaydi —
 * u shunchaki avansni yeydi. Sodda qoida bilan yozilsa avansi bor mijoz
 * undirish ro'yxatiga tushib, unga «qarzingizni to'lang» eslatmasi ketardi
 * (invariant 4).
 *
 *     receivable = max(0, min(debtAmount, balanceBefore + debtAmount))
 *
 * | Balans oldin | Chek qarzi | Balans keyin | Natija |
 * |---|---|---|---|
 * | 0        | 300k | +300k  | 300k  — oddiy holat |
 * | +200k    | 300k | +500k  | 300k  — qarz ustiga qarz |
 * | −1 000k  | 300k | −700k  | 0     — avans yedi, qator YO'Q |
 * | −100k    | 300k | +200k  | 200k  — avans qisman qopladi |
 * | `null`   | 300k | —      | 300k  — o'lchanmagan ⇒ EHTIYOTKOR tanlov |
 *
 * ⚠️ `null` («o'lchanmagan») uchun to'liq summa qaytariladi. NULL ≠ 0, lekin bu
 * yerda ikki xatoning arzonrog'i tanlangan: qator ochilib qolsa menejer uni
 * ko'radi va yopa oladi; ochilmay qolsa qarz yana ko'rinmas bo'lardi — ya'ni
 * egasining shikoyati qaytardi. Chaqiruvchi (Q2) buni `DebtNote` da qayd etadi.
 *
 * ⚠️ `balanceBefore` chaqiruvchida QULFLAB o'qilishi shart (`FOR UPDATE`,
 * P1 ning `lockBalance` naqshi, tartib BALANS → QARZLAR) — aks holda ikki
 * parallel chek bir xil «balansOldin» ni ko'radi. Bu sof modul qulfni
 * BILMAYDI: u faqat qoidani biladi, majburlash Q2 ning kod-shakl testida.
 */
export function receivablePortion(balanceBefore: bigint | null, debtAmount: bigint): bigint {
  if (debtAmount <= 0n) return 0n;
  if (balanceBefore === null) return debtAmount;
  const balanceAfter = balanceBefore + debtAmount;
  if (balanceAfter <= 0n) return 0n;
  return balanceAfter < debtAmount ? balanceAfter : debtAmount;
}

/**
 * Muddat qoidasi: post qilingan kunning Toshkent kalendar kuniga `termDays`
 * qo'shiladi va soat `09:00` (Toshkent) olinadi.
 *
 * 🔴 **NULL QAYTARMAYDI** — sabab fayl sarlavhasidagi 2-shartnoma.
 *
 * KALENDAR kuni, `ms + N*86400000` EMAS: 23:50 da post qilingan chek 14 kundan
 * keyingi kunning 09:00 ida muddatli bo'ladi, 23:50 ida emas —
 * `debt-collection.ts` ning `overdueDaysBetween` i ham kalendar kunida sanaydi,
 * ikkalasi bir xil o'lchov bo'lishi shart.
 *
 * @param postedAt chek post qilingan instant (Q5 backfill'da — `now`, chek
 *   sanasi EMAS: eski cheklarning hammasi birdan `overdue` bo'lib eslatma
 *   cron'iga bir vaqtda tushishi rejaning §Q5 da ataylab taqiqlangan)
 * @param termDays butun, manfiy emas; default — {@link DEFAULT_SALE_DEBT_TERM_DAYS}
 */
export function saleDebtDueAt(
  postedAt: Date,
  termDays: number = DEFAULT_SALE_DEBT_TERM_DAYS,
): Date {
  if (!Number.isFinite(termDays) || !Number.isInteger(termDays) || termDays < 0) {
    throw new RangeError(
      `saleDebtDueAt: termDays butun va manfiy emas bo'lishi kerak (${termDays})`,
    );
  }
  const postedMs = postedAt.getTime();
  if (!Number.isFinite(postedMs)) {
    throw new RangeError('saleDebtDueAt: postedAt yaroqsiz sana');
  }
  // Post qilingan Toshkent kuni → o'sha kunning UTC-yarim tuni (faqat sana
  // arifmetikasi uchun tayanch), + termDays kun → muddat kuni.
  const postedDayUtc = Date.parse(`${tashkentDayKey(postedAt)}T00:00:00.000Z`);
  const dueDayKey = new Date(postedDayUtc + termDays * DAY_MS).toISOString().slice(0, 10);
  // Toshkent 09:00 = o'sha kunning 04:00 UTC (09 − 05).
  return new Date(
    Date.parse(`${dueDayKey}T00:00:00.000Z`) +
      SALE_DEBT_DUE_HOUR_TASHKENT * HOUR_MS -
      TASHKENT_OFFSET_MS,
  );
}

/** {@link planSaleDebtRow} kirishi — chaqiruvchi (Q2) qulflangan holatdan to'ldiradi. */
export interface SaleDebtRowInput {
  /** Chek raqami (`CHK-…`) — izoh va jurnal yozuvida ko'rinadi. */
  saleName: string;
  /**
   * Chekning qarz ulushi (`DEBT` tenderi, kassa valyutasi, minor).
   * Balansga AYNAN shu summa yoziladi (`applyDelta(+debtAmount)`).
   */
  debtAmountMinor: bigint;
  /**
   * Kontragentning qarz-valyutasidagi balansi `applyDelta` DAN OLDIN,
   * QULFLAB o'qilgan. `null` = qator yo'q (o'lchanmagan), «0» EMAS.
   */
  balanceBeforeMinor: bigint | null;
  /** Muddat (kun). Berilmasa — {@link DEFAULT_SALE_DEBT_TERM_DAYS}. */
  termDays?: number;
}

/** Reyestrga ochiladigan qatorning REJASI (DB yozuvi emas — faqat qiymatlar). */
export interface SaleDebtRowPlan {
  /** Qator summasi — §2.2 kesishuv qoidasi natijasi, doim > 0. */
  totalMinor: bigint;
  /** Har doim `true`: qarz balansda ALLAQACHON bor, qo'shsak ikki karra bo'lardi. */
  balanceAdopted: true;
  /** Muddat — NULL EMAS ({@link saleDebtDueAt}). */
  nextContactAt: Date;
  /** `Debt.comment` — menejer ro'yxatda ko'radigan qisqa manba. */
  comment: string;
  /** `DebtNote` (`kind:'debt_issue'`) matni — «bu qator qayerdan paydo bo'ldi». */
  noteText: string;
  /** Chek qarzining avans yegan qismi (`debtAmount − totalMinor`). */
  coveredByPrepayMinor: bigint;
  /** Balans o'lchanmagan edi ⇒ qator EHTIYOTKOR tanlov bilan ochildi. */
  balanceUnmeasured: boolean;
}

/**
 * Chekdan qanday reyestr qatori tug'ilishi.
 *
 * 🔴 **`null` qaytarsa qator UMUMAN OCHILMAYDI** — mijozning avansi chek
 * qarzini to'liq qoplagan (yoki chekda qarz yo'q). Bu invariant 4 ning
 * amaliy shakli: manfiy balansdan hech qachon `Debt` qatori tug'ilmaydi.
 *
 * @param now chek post qilingan instant («hozir» argument — modul sof)
 */
export function planSaleDebtRow(input: SaleDebtRowInput, now: Date): SaleDebtRowPlan | null {
  const totalMinor = receivablePortion(input.balanceBeforeMinor, input.debtAmountMinor);
  if (totalMinor <= 0n) return null;

  const balanceUnmeasured = input.balanceBeforeMinor === null;
  const coveredByPrepayMinor = input.debtAmountMinor - totalMinor;

  const noteParts = [
    `Qator «${input.saleName}» chekidan avtomatik ochildi — qarz mijoz BALANSIGA yozilgan,`,
    'reyestrga qayta qo`shilmadi (balanceAdopted).',
  ];
  if (coveredByPrepayMinor > 0n) {
    noteParts.push(
      `Chek qarzining ${coveredByPrepayMinor} (tiyin) qismi mijozning AVANSIDAN qoplandi.`,
    );
  }
  if (balanceUnmeasured) {
    noteParts.push(
      'Diqqat: mijozning balansi O`LCHANMAGAN edi (balans qatori yo`q) — qator to`liq',
      'summaga ehtiyotkorlik bilan ochildi, tekshirib chiqing.',
    );
  }

  return {
    totalMinor,
    balanceAdopted: true,
    nextContactAt: saleDebtDueAt(now, input.termDays),
    comment: `Kassa cheki «${input.saleName}» bo\`yicha qarz.`,
    noteText: noteParts.join(' '),
    coveredByPrepayMinor,
    balanceUnmeasured,
  };
}

/** {@link planSaleDebtDelta} kirishi. */
export interface SaleDebtDeltaInput {
  /** Reyestr qatorining JORIY summasi (`Debt.totalMinor`). */
  totalMinor: bigint;
  /** Shu qatorga tushgan to'lov (`Debt.paidMinor`). */
  paidMinor: bigint;
  /** Chek qarzining ESKI ulushi — qator aynan shundan tug'ilgan. */
  oldRemainingMinor: bigint;
  /** Chek qarzining YANGI ulushi (vozvrat/tahriridan keyin). */
  newRemainingMinor: bigint;
}

/** Qatorni qanday harakatlantirish kerakligi (Q3 shu rejani bajaradi). */
export interface SaleDebtDeltaPlan {
  /** Qatorning yangi summasi. */
  nextTotalMinor: bigint;
  /** Amalda qo'llanadigan delta (`nextTotalMinor − totalMinor`). */
  deltaMinor: bigint;
  /** Yangi holat — `debt-recalc.ts` bilan bir xil ta'rif. */
  status: 'unpaid' | 'partial' | 'paid';
  /** Qoldiq 0 ⇒ `closedAt` qo'yiladi, `nextContactAt` NULL'ga tushadi (§3.6). */
  closed: boolean;
  /**
   * To'langan summadan pastga tushirilmagan qism (`0` = nizo yo'q).
   *
   * 🔴 Bu **HAQIQIY NIZO** belgisi: mijoz allaqachon to'lagan pulni yo'q qilib
   * bo'lmaydi, shuning uchun 400 qaytarilmaydi — qator `paidMinor` ga
   * tekislanadi va Q3 buni `DebtNote` bilan OCHIQ qayd etadi.
   */
  clampedByPaidMinor: bigint;
  /**
   * Qatorga harakat PAYTIDA tushgan to'lov (`Debt.paidMinor`) — kirishdan
   * o'zgarishsiz ko'chadi. Q3 izoh matni nizoni AYNAN shu son bilan
   * tushuntiradi; chaqiruvchi uni ikkinchi marta uzatsa ikki manba bir kun
   * ayrilardi (Q2 ning `plan.noteText` sabog'i).
   */
  paidMinorAtMove: bigint;
}

/**
 * Vozvrat/tahrir deltasini hisoblash qoidasi (invariant 2 — SIMMETRIYA).
 *
 * Balans `−debtReturn` olganda reyestr qatori AYNAN shuncha kamayishi kerak,
 * aks holda undirish ro'yxati qaytarilgan tovar uchun pul talab qilib turadi.
 *
 * ⚠️ Rejadagi `planSaleDebtDelta(oldRemaining, newRemaining)` imzosi shu yerda
 * KENGAYTIRILDI: qatorning `totalMinor`/`paidMinor` i ham kerak, chunki Q3
 * ning qabul mezoni «`totalMinor` `paidMinor` dan pastga tushmasin» ni talab
 * qiladi va bu — sof qoida, I/O emas. Ikki argumentli shakl uni ifodalay
 * olmaydi.
 */
export function planSaleDebtDelta({
  totalMinor,
  paidMinor,
  oldRemainingMinor,
  newRemainingMinor,
}: SaleDebtDeltaInput): SaleDebtDeltaPlan {
  const wanted = totalMinor + (newRemainingMinor - oldRemainingMinor);

  // 1-chegara — NOL. `wanted` manfiy bo'lishi MUMKIN va bu anomaliya emas:
  // §2.2 kesishuv qoidasi bo'yicha qator chekning qarz ulushidan KICHIK
  // tug'ilgan bo'lishi mumkin (avans bir qismini qoplagan), keyin esa chek
  // to'liq qaytarilsa `newRemaining − oldRemaining` qatordan kattaroq
  // kamayishni so'raydi. Qator noldan pastga tushmaydi; haqiqatni
  // `deltaMinor` aytadi (u AMALDA qo'llangan harakat).
  const zeroFloored = wanted < 0n ? 0n : wanted;

  // 2-chegara — TO'LANGAN SUMMA. Mijoz bergan real pulni yo'q qilib bo'lmaydi.
  const nextTotalMinor = zeroFloored < paidMinor ? paidMinor : zeroFloored;
  const clampedByPaidMinor = nextTotalMinor - zeroFloored;
  const remaining = nextTotalMinor - paidMinor;

  return {
    nextTotalMinor,
    deltaMinor: nextTotalMinor - totalMinor,
    status: remaining <= 0n ? 'paid' : paidMinor > 0n ? 'partial' : 'unpaid',
    closed: remaining <= 0n,
    clampedByPaidMinor,
    paidMinorAtMove: paidMinor,
  };
}

/** {@link saleDebtMoveNoteText} kirishi. */
export interface SaleDebtMoveNoteInput {
  /** Chek raqami (`CHK-…`/`ТРН-…`) — izohda ko'rinadi. */
  saleName: string;
  /** Harakat sababi: qaytarish yoki chek tahriri. */
  reason: 'refund' | 'edit';
  /** Qatorning harakatdan OLDINGI summasi. */
  previousTotalMinor: bigint;
  /** {@link planSaleDebtDelta} natijasi. */
  plan: SaleDebtDeltaPlan;
  /**
   * Mijoz ALMASHGAN bo'lsa — qator ko'chirilgan (eski) kontragent id'si.
   * `undefined` ⇒ mijoz o'zgarmagan.
   */
  retargetedFromId?: string | null;
  /**
   * Ko'chirish RAD ETILDI: qatorga allaqachon to'lov tushgan, ya'ni uni
   * boshqa mijozga o'tkazish o'sha to'lovlarni ham ko'chirib, tarixni
   * yolg'onga aylantirardi (Q3).
   */
  retargetBlocked?: boolean;
}

/**
 * Q3 — reyestr qatori HARAKATLANGANDA yoziladigan `DebtNote` matni (SOF).
 *
 * NEGA SOF MODULDA: Q1 dagi `planSaleDebtRow().noteText` bilan bir xil
 * intizom — matn servisda yozilsa hech qachon testda qulflanmaydi va ikki
 * yo'l (qaytarish/tahrir) darhol ikki xil gapira boshlaydi.
 *
 * Matn HAR DOIM uch savolga javob beradi: (1) qaysi hujjat harakatga sabab
 * bo'ldi, (2) summa qanchadan qanchaga o'zgardi, (3) NIZO bormi — ya'ni
 * to'langan pul yoki ko'chirish to'sig'i.
 */
export function saleDebtMoveNoteText({
  saleName,
  reason,
  previousTotalMinor,
  plan,
  retargetedFromId,
  retargetBlocked,
}: SaleDebtMoveNoteInput): string {
  const cause = reason === 'refund' ? 'QAYTARISH' : 'CHEK TAHRIRI';
  const parts = [
    `«${saleName}» bo\`yicha ${cause}: reyestr qatori ${previousTotalMinor} → ` +
      `${plan.nextTotalMinor} (tiyin) ga o\`zgardi.`,
    'Balansga bu yerdan HECH NARSA yozilmadi — pul daftarini chekning o`z yo`li',
    'harakatlantirdi (balanceAdopted simmetriyasi).',
  ];
  if (plan.clampedByPaidMinor > 0n) {
    parts.push(
      `🔴 NIZO: qator ${plan.clampedByPaidMinor} (tiyin) ga pastroq tushishi kerak edi, ` +
        `lekin mijoz allaqachon ${plan.paidMinorAtMove} (tiyin) to\`lagan — to\`langan pulni ` +
        'yo`q qilib bo`lmaydi, qator shunga tekislandi. Tekshirib chiqing.',
    );
  }
  if (retargetBlocked) {
    parts.push(
      '🔴 MIJOZ ALMASHTIRILDI, lekin qator KO`CHIRILMADI: unga allaqachon to`lov tushgan ' +
        '(to`lovlar eski mijozniki). Qator eski mijozda yopildi; yangi mijozning qarzi ' +
        'BALANSDA ko`rinadi va u kassaga to`lov qilganda reyestrga adopsiya orqali kiradi.',
    );
  } else if (retargetedFromId !== undefined && retargetedFromId !== null) {
    parts.push(`Qator boshqa mijozga ko\`chirildi (eski mijoz id: ${retargetedFromId}).`);
  }
  if (plan.closed) {
    parts.push('Qoldiq 0 — qator YOPILDI, undirish ro`yxatidan chiqadi.');
  }
  return parts.join(' ');
}
