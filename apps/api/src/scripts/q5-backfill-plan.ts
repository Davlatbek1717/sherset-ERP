/**
 * Q5 — TARIXIY KASSA QARZLARINI REYESTRGA OLIB KIRISH: SOF REJA
 * (reja: `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`, §Q5).
 *
 * ── Muammo ────────────────────────────────────────────────────────────────
 * Q2 (2026-08-25) dan boshlab kassadan qarzga sotilgan HAR chek `Debt`
 * reyestriga qator ochadi va shu bilan undirish ro'yxatida ko'rinadi. Lekin
 * Q2 dan OLDIN post qilingan cheklarning qarzi FAQAT `CounterpartyBalance`
 * da qolgan — ya'ni egasining shikoyati («kassadan qo'shilgan qarzdorliklar
 * undirish bo'limida ko'rinmayapti») tarixiy qarzlar uchun HAMON kuchda.
 *
 * ── Nega bu fayl SOF ──────────────────────────────────────────────────────
 * Prisma yo'q, Nest yo'q, `Date.now()` yo'q — «hozir» argument
 * (`sale-debt-registry.ts` bilan bir xil intizom). Sabab: bu — reja
 * tarixidagi ENG RISKLI yozuv (jonli ma'lumot, yuzlab qator, eslatma cron'i
 * ortida). Taqsimot, sana zinapoyasi va o'tkazib yuborish qoidalari bazasiz
 * testda muzlatilishi SHART; skript (`ops-q5-backfill-sale-debts.ts`) esa
 * faqat I/O bo'lib qoladi.
 *
 * ── Taqsimot qoidasi (eng muhim qaror) ────────────────────────────────────
 * Chek qarzi mijozning balansiga yozilgan, LEKIN mijoz o'shandan beri kassaga
 * pul olib kelgan bo'lishi mumkin — balans esa BITTA yig'ma son, chek kesimi
 * YO'Q. Ya'ni «bu chekning qarzi hali qoldimi?» degan savolga bazada
 * to'g'ridan-to'g'ri javob yo'q.
 *
 * Shuning uchun taqsimot kontragent darajasida ishlaydi:
 *
 *     cap = unregistered = max(0, balans − reyestrdagi ochiq qoldiq)
 *
 * — ya'ni AYNAN `pos-customer-debt.ts#splitDebtSources().unregisteredMinor`,
 * kassir ekranida allaqachon ko'rinadigan son. Bu cap chekma-chek
 * to'ldiriladi va TUGAGANDA to'xtaydi. Natijada:
 *
 *  · reyestrning JAMI ochiq qoldig'i hech qachon balansdan oshmaydi
 *    (aks holda undirish ro'yxati allaqachon to'langan pulni talab qilardi);
 *  · P1 adopsiya qatorlari ikki marta sanalmaydi — ular
 *    `registryOutstandingMinor` ichida allaqachon bor.
 *
 * 🔴 TARTIB — YANGISIDAN ESKISIGA. Mijoz to'lov qilganda POS avval REYESTR
 * FIFO'sini (eng eski qarzlar), so'ng balansdan adopsiyani yopadi
 * (`pos-customer-debt.ts#planAdoption`) — ya'ni buxgalteriya odati bo'yicha
 * ESKI qarzlar birinchi to'lanadi. Demak balansda qolgan qoldiq ehtimol
 * ENG YANGI cheklarniki. Eskisidan boshlansa backfill allaqachon to'langan
 * cheklarni «ochiq qarz» qilib ochardi va menejer mijozga to'langan pulni
 * qayta so'rardi.
 *
 * ── Sana zinapoyasi ───────────────────────────────────────────────────────
 * `nextContactAt` chek SANASIDAN hisoblanmaydi (aks holda hamma qator birdan
 * `overdue` bo'lib eslatma cron'iga bir vaqtda tushardi — `pos-customer-debt.ts`
 * ning «qarzdorlar ro'yxati / eslatma cron / Telegram oqimi kutilmaganda
 * portlardi» ogohlantirishi AYNAN shu haqda). Qoida: `now + termDays`, va har
 * `stepRows` qatordan keyin yana `stepDays` kun qo'shiladi — operator navbati
 * bir kunda emas, hafta(lar) bo'ylab to'ladi.
 */

import {
  DEFAULT_SALE_DEBT_TERM_DAYS,
  saleDebtComment,
  saleDebtDueAt,
} from '../modules/debt/sale-debt-registry.js';

/**
 * Backfill ochgan qatorning YAGONA belgisi — teskari skript (qoida 12) AYNAN
 * shu bo'yicha topadi.
 *
 * NEGA `DebtNote` matnida, `Debt` da alohida ustunda EMAS: qator Q2 ning
 * jonli yozuvchisi bilan bir xil SHAKLDA bo'lishi shart (reja §Q5 vazifa 2)
 * — ya'ni `Debt` ga backfill'ga xos maydon qo'shilmaydi, aks holda undirish
 * ekrani ikki sinf qator ko'rardi. Izoh esa baribir yoziladi («bu qator
 * qayerdan paydo bo'ldi») va u o'chirish uchun ham yetarli manzil.
 */
export const Q5_BACKFILL_MARKER = '[Q5-BACKFILL';

/** `run` yorlig'i bilan to'liq belgi — bitta yugurishning izi. */
export function q5BackfillMarker(runId: string): string {
  return `${Q5_BACKFILL_MARKER} run=${runId}]`;
}

/** Bitta tarixiy chek — skript bazadan AYNAN shu shaklda o'qiydi. */
export interface Q5Receipt {
  saleId: string;
  /** Chek raqami (`CHK-…`) — izoh matnida ko'rinadi. */
  saleName: string;
  /** Post qilingan instant — tartib AYNAN shu bo'yicha (yangisidan eskisiga). */
  postedAt: Date;
  /** `RetailSalePayment` dagi `DEBT` tenderi summasi (tiyin). */
  debtAmountMinor: bigint;
  /**
   * Shu chekdan QAYTARILGAN qarz ulushi — mirror cheklarning
   * `debtReturnMinor` yig'indisi. Qaytarilgan qism qarz emas.
   */
  debtReturnedMinor: bigint;
  /**
   * Reyestrda allaqachon qatori bor (`Debt.sourceDocId = saleId`).
   * Q2 dan KEYIN post qilingan cheklar shu bayroq bilan chetlab o'tiladi.
   */
  alreadyRegistered: boolean;
}

/** Bitta kontragentning to'liq kesimi. */
export interface Q5CounterpartyInput {
  counterpartyId: string;
  counterpartyName: string;
  /**
   * Qarz valyutasidagi (`UZS`) balans. `null` = balans qatori YO'Q
   * («o'lchanmagan»), «0» EMAS.
   */
  balanceMinor: bigint | null;
  /** `Debt` reyestridagi ochiq qoldiq (`unpaid`+`partial`, `total − paid`). */
  registryOutstandingMinor: bigint;
  receipts: readonly Q5Receipt[];
}

/** Qator OCHILMAGAN chek — sababi bilan (hisobot uchun; jim o'tmaydi). */
export interface Q5SkippedReceipt {
  saleId: string;
  saleName: string;
  remainingMinor: bigint;
  reason: 'already-registered' | 'fully-returned' | 'cap-exhausted';
}

/** Ochiladigan BITTA reyestr qatori — skript shundan `debt.create` qiladi. */
export interface Q5PlannedRow {
  counterpartyId: string;
  saleId: string;
  saleName: string;
  /** Qator summasi — cap bilan chegaralangan, doim > 0. */
  totalMinor: bigint;
  /** Chekning qoldiq qarzi (cap kesmaganida shuncha bo'lardi). */
  receiptRemainingMinor: bigint;
  /** Cap tufayli kesilgan qism (`receiptRemaining − totalMinor`). */
  cappedMinor: bigint;
  /** Muddat — NULL EMAS, zinapoyali (yuqoridagi izoh). */
  nextContactAt: Date;
  /** Muddatga qo'shilgan zinapoya kunlari (hisobot va test uchun). */
  staircaseDays: number;
  /** `Debt.comment` — Q2 yozuvchisi bilan AYNAN bir xil matn. */
  comment: string;
  /** `DebtNote` (`kind:'debt_issue'`) matni — belgi shu yerda. */
  noteText: string;
}

/** Bitta kontragent bo'yicha reja. */
export interface Q5CounterpartyPlan {
  counterpartyId: string;
  counterpartyName: string;
  /** Taqsimlash chegarasi — `unregisteredMinor`. */
  capMinor: bigint;
  /** Cap dan amalda taqsimlangan qism. */
  allocatedMinor: bigint;
  /** Cap dan ortib qolgan qism (chek yetmadi — boshqa hujjat manbalari). */
  capLeftoverMinor: bigint;
  rows: Q5PlannedRow[];
  skipped: Q5SkippedReceipt[];
  /**
   * Kontragent UMUMAN chetlab o'tildi.
   *  · `balance-unmeasured` — balans qatori yo'q (§ pastdagi izoh);
   *  · `no-unregistered-debt` — reyestr balansni allaqachon qoplagan;
   *  · `no-eligible-receipts` — qator ochsa bo'ladigan chek yo'q.
   */
  skipReason?: 'balance-unmeasured' | 'no-unregistered-debt' | 'no-eligible-receipts';
}

export interface Q5PlanOptions {
  /** «Hozir» — muddat shundan hisoblanadi (chek sanasidan EMAS). */
  now: Date;
  /** Bazaviy muddat (kun). Default — Q1 ning 14 kuni. */
  termDays?: number;
  /** Necha qatordan keyin muddatga yana `stepDays` qo'shiladi (0 ⇒ zinapoya yo'q). */
  stepRows?: number;
  /** Har zinada qo'shiladigan kun. */
  stepDays?: number;
  /** Zinapoyaning YUQORI chegarasi (kun) — qator ko'p bo'lsa cheksiz cho'zilmasin. */
  maxStaircaseDays?: number;
  /** Ochiladigan qatorlarning UMUMIY chegarasi (bosqichma-bosqich yuritish). */
  limitRows?: number;
}

/** Zinapoya defaultlari — reja §Q5 vazifa 2 («masalan har 50 qator uchun +1 kun»). */
export const Q5_DEFAULT_STEP_ROWS = 50;
export const Q5_DEFAULT_STEP_DAYS = 1;
export const Q5_DEFAULT_MAX_STAIRCASE_DAYS = 30;

/**
 * Muddatning zinapoyali qo'shimchasi (SOF).
 *
 * `rowIndex` — butun backfill bo'yicha GLOBAL tartib raqami (0 dan), ya'ni
 * kontragentlar bo'ylab davom etadi: aks holda 200 ta kontragentning
 * birinchi qatorlari bir kunga to'planardi.
 */
export function q5StaircaseDays(
  rowIndex: number,
  stepRows: number,
  stepDays: number,
  maxDays: number,
): number {
  if (stepRows <= 0 || stepDays <= 0) return 0;
  const raw = Math.floor(rowIndex / stepRows) * stepDays;
  return raw > maxDays ? maxDays : raw;
}

/**
 * Chekning HALI QARZ bo'lib turgan ulushi (SOF).
 *
 * Qaytarilgan qism qarz emas: chek qaytarilganda balansga `−debtReturn`
 * yozilgan (`refund()`), ya'ni u allaqachon balansdan chiqib ketgan. Uni
 * reyestrga qo'shsak undirish ro'yxati qaytarilgan tovar uchun pul talab
 * qilardi (Q3 ning invariant 2 si bilan AYNI mantiq, faqat tarixiy tomonda).
 *
 * Manfiy natija (qaytarish qarzdan KO'P — ma'lumot anomaliyasi) 0 ga
 * tekislanadi: qator ochilmaydi, lekin chaqiruvchi buni `skipped` da ko'radi.
 */
export function q5ReceiptRemaining(receipt: Q5Receipt): bigint {
  const remaining = receipt.debtAmountMinor - receipt.debtReturnedMinor;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Kontragentning TAQSIMLASH CHEGARASI (SOF) —
 * `pos-customer-debt.ts#splitDebtSources().unregisteredMinor` bilan AYNAN
 * bir formula.
 *
 * 🔴 `null` balans ⇒ `null` («o'lchanmagan»), 0 EMAS. Chaqiruvchi bunday
 * kontragentni CHETLAB O'TADI va hisobotda sanaydi.
 *
 * NEGA Q2 dan FARQLI (u `null` da to'liq qator ochadi): Q2 — bitta jonli
 * chek, menejer uni darhol ko'radi va yopa oladi; Q5 — ommaviy JONLI yozuv,
 * va bu yerda `null` balans anomaliya belgisi (chek post qilinganda
 * `applyDelta` balans qatorini YARATADI, ya'ni DEBT tenderi bo'lgan
 * kontragentda qator BO'LISHI kerak). Ommaviy yozuvda ehtiyotkor tomon —
 * yozmaslik va ro'yxatga chiqarish.
 */
export function q5CounterpartyCap(cp: Q5CounterpartyInput): bigint | null {
  if (cp.balanceMinor === null) return null;
  const registry = cp.registryOutstandingMinor > 0n ? cp.registryOutstandingMinor : 0n;
  const diff = cp.balanceMinor - registry;
  return diff > 0n ? diff : 0n;
}

/** {@link q5BackfillNoteText} kirishi. */
export interface Q5NoteInput {
  runId: string;
  saleName: string;
  postedAt: Date;
  receiptRemainingMinor: bigint;
  totalMinor: bigint;
  cappedMinor: bigint;
  counterpartyCapMinor: bigint;
}

/**
 * `DebtNote` matni — «bu qator qayerdan paydo bo'ldi» + teskari skript belgisi.
 *
 * Uch savolga javob beradi: (1) qaysi chek va qachon post qilingan,
 * (2) summa qanday hisoblangan (cap kesdimi), (3) qaysi yugurishga tegishli
 * (`run=` — rollback manzili).
 */
export function q5BackfillNoteText(input: Q5NoteInput): string {
  const parts = [
    `${q5BackfillMarker(input.runId)} Qator TARIXIY chekdan ochildi:`,
    `«${input.saleName}» (post: ${input.postedAt.toISOString()}).`,
    'Qarz mijoz BALANSIGA o`shanda yozilgan — reyestrga qayta qo`shilmadi',
    '(balanceAdopted), ya`ni saldo bir tiyin ham o`zgarmaydi.',
    `Chekning qoldiq qarzi ${input.receiptRemainingMinor} (tiyin);`,
    `kontragentning reyestrdan TASHQARIDAGI qarzi ${input.counterpartyCapMinor} (tiyin).`,
  ];
  if (input.cappedMinor > 0n) {
    parts.push(
      `🔴 Qator ${input.cappedMinor} (tiyin) ga KESILDI — kontragentning reyestrdan ` +
        'tashqaridagi qarzi shu chekning qoldig`idan kichik (qolgani allaqachon to`langan ' +
        `bo\`lishi mumkin). Qator ${input.totalMinor} (tiyin) bilan ochildi.`,
    );
  }
  parts.push(
    'Muddat chek sanasidan EMAS, backfill kunidan zinapoyali hisoblandi —',
    'aks holda hamma qator birdan kechikkan bo`lib eslatma navbatini to`ldirardi.',
  );
  return parts.join(' ');
}

/**
 * Bitta kontragent uchun reja (SOF).
 *
 * @param startRowIndex butun backfill bo'yicha GLOBAL qator hisoblagichi
 *   (zinapoya shundan yuradi)
 * @param runId yugurish yorlig'i — izoh matniga tushadi (rollback manzili)
 */
export function planCounterpartyBackfill(
  cp: Q5CounterpartyInput,
  opts: Q5PlanOptions,
  startRowIndex: number,
  runId: string,
): Q5CounterpartyPlan {
  const termDays = opts.termDays ?? DEFAULT_SALE_DEBT_TERM_DAYS;
  const stepRows = opts.stepRows ?? Q5_DEFAULT_STEP_ROWS;
  const stepDays = opts.stepDays ?? Q5_DEFAULT_STEP_DAYS;
  const maxStaircaseDays = opts.maxStaircaseDays ?? Q5_DEFAULT_MAX_STAIRCASE_DAYS;

  const base: Q5CounterpartyPlan = {
    counterpartyId: cp.counterpartyId,
    counterpartyName: cp.counterpartyName,
    capMinor: 0n,
    allocatedMinor: 0n,
    capLeftoverMinor: 0n,
    rows: [],
    skipped: [],
  };

  const cap = q5CounterpartyCap(cp);
  if (cap === null) return { ...base, skipReason: 'balance-unmeasured' };
  base.capMinor = cap;
  base.capLeftoverMinor = cap;
  if (cap === 0n) return { ...base, skipReason: 'no-unregistered-debt' };

  // Tartib: YANGISIDAN ESKISIGA (fayl sarlavhasidagi dalil). Teng sanada
  // `saleId` bo'yicha — reja DETERMINISTIK bo'lishi shart, aks holda ikki
  // DRY-RUN ikki xil ro'yxat berardi va egasi tasdiqlagan ro'yxat
  // `--apply` da boshqacha bo'lardi.
  const ordered = [...cp.receipts].sort((a, b) => {
    const d = b.postedAt.getTime() - a.postedAt.getTime();
    return d !== 0 ? d : a.saleId < b.saleId ? -1 : a.saleId > b.saleId ? 1 : 0;
  });

  let capLeft = cap;
  let rowIndex = startRowIndex;
  let eligibleSeen = 0;

  for (const receipt of ordered) {
    if (receipt.alreadyRegistered) {
      base.skipped.push({
        saleId: receipt.saleId,
        saleName: receipt.saleName,
        remainingMinor: q5ReceiptRemaining(receipt),
        reason: 'already-registered',
      });
      continue;
    }
    const remaining = q5ReceiptRemaining(receipt);
    if (remaining <= 0n) {
      base.skipped.push({
        saleId: receipt.saleId,
        saleName: receipt.saleName,
        remainingMinor: 0n,
        reason: 'fully-returned',
      });
      continue;
    }
    eligibleSeen++;
    if (capLeft <= 0n) {
      // Cap tugadi — bu chekning qarzi allaqachon to'langan deb qaraladi.
      // JIM emas: hisobotda alohida sinf bo'lib chiqadi.
      base.skipped.push({
        saleId: receipt.saleId,
        saleName: receipt.saleName,
        remainingMinor: remaining,
        reason: 'cap-exhausted',
      });
      continue;
    }
    // ⚠️ `limitRows` bu YERDA qo'llanmaydi: u GLOBAL chegara va
    // `planQ5Backfill` da kesiladi (kontragent ichidagi kesim taqsimotni
    // buzardi — cap allaqachon sarflangan bo'lib ko'rinardi).
    const totalMinor = remaining < capLeft ? remaining : capLeft;
    const staircaseDays = q5StaircaseDays(rowIndex, stepRows, stepDays, maxStaircaseDays);
    base.rows.push({
      counterpartyId: cp.counterpartyId,
      saleId: receipt.saleId,
      saleName: receipt.saleName,
      totalMinor,
      receiptRemainingMinor: remaining,
      cappedMinor: remaining - totalMinor,
      nextContactAt: saleDebtDueAt(opts.now, termDays + staircaseDays),
      staircaseDays,
      comment: saleDebtComment(receipt.saleName),
      noteText: q5BackfillNoteText({
        runId,
        saleName: receipt.saleName,
        postedAt: receipt.postedAt,
        receiptRemainingMinor: remaining,
        totalMinor,
        cappedMinor: remaining - totalMinor,
        counterpartyCapMinor: cap,
      }),
    });
    capLeft -= totalMinor;
    rowIndex++;
  }

  base.allocatedMinor = cap - capLeft;
  base.capLeftoverMinor = capLeft;
  if (base.rows.length === 0 && eligibleSeen === 0) {
    return { ...base, skipReason: 'no-eligible-receipts' };
  }
  return base;
}

/** Butun backfill rejasi — skript AYNAN shu obyektni chop etadi va bajaradi. */
export interface Q5BackfillPlan {
  runId: string;
  plans: Q5CounterpartyPlan[];
  totalRows: number;
  totalMinor: bigint;
  /** `limitRows` tufayli kesilgan qatorlar soni (bosqichma-bosqich yuritish). */
  truncatedRows: number;
  /** Balansi o'lchanmagan (chetlab o'tilgan) kontragentlar. */
  unmeasuredCounterparties: number;
}

/**
 * Butun backfill rejasi (SOF) — kontragentlar bo'ylab, GLOBAL zinapoya bilan.
 *
 * `limitRows` AYNAN shu yerda qo'llanadi (kontragent ichida emas): reja
 * §Q5 «birinchi yugurish 1 kontragent, so'ng 10, so'ng qolgani» deydi, ya'ni
 * chegara butun yugurishga tegishli. Kesilgan qatorlar `truncatedRows` da
 * sanaladi — jimgina yo'qolmaydi.
 */
export function planQ5Backfill(
  counterparties: readonly Q5CounterpartyInput[],
  opts: Q5PlanOptions,
  runId: string,
): Q5BackfillPlan {
  const plans: Q5CounterpartyPlan[] = [];
  let rowIndex = 0;
  let totalMinor = 0n;
  let truncatedRows = 0;
  let unmeasured = 0;

  for (const cp of counterparties) {
    const plan = planCounterpartyBackfill(cp, opts, rowIndex, runId);
    if (plan.skipReason === 'balance-unmeasured') unmeasured++;

    if (opts.limitRows !== undefined) {
      const room = opts.limitRows - rowIndex;
      if (room <= 0) {
        truncatedRows += plan.rows.length;
        plan.rows = [];
        plan.allocatedMinor = 0n;
        plan.capLeftoverMinor = plan.capMinor;
        plans.push(plan);
        continue;
      }
      if (plan.rows.length > room) {
        const dropped = plan.rows.slice(room);
        truncatedRows += dropped.length;
        plan.rows = plan.rows.slice(0, room);
        const kept = plan.rows.reduce((s, r) => s + r.totalMinor, 0n);
        plan.allocatedMinor = kept;
        plan.capLeftoverMinor = plan.capMinor - kept;
      }
    }

    rowIndex += plan.rows.length;
    totalMinor += plan.rows.reduce((s, r) => s + r.totalMinor, 0n);
    plans.push(plan);
  }

  return {
    runId,
    plans,
    totalRows: rowIndex,
    totalMinor,
    truncatedRows,
    unmeasuredCounterparties: unmeasured,
  };
}
