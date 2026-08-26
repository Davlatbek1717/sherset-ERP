/**
 * Q6 — JONLI VERIFY ning SOF QISMI: o'lchovlardan HUKM chiqarish.
 *
 * DB yo'q, Nest yo'q, HTTP yo'q, `Date.now()` yo'q. Skript
 * (`ops-q6-live-verify.ts`) faqat o'lchaydi va shu yerga beradi — hukm
 * qoidalari testda qulflanadi, ya'ni «jonlida o'tdi» degan gap ham
 * takrorlanadigan bo'ladi.
 *
 * 🔴 NEGA ALOHIDA MODUL: P1 ning `ops-p1-live-verify.ts` da hukmlar skript
 * ichida, `checks` massivida yozilgan. U ishlagan, lekin tekshirib bo'lmagan:
 * hukm shartining o'zi noto'g'ri bo'lsa skript baribir «O'TDI» deb chiqardi.
 * Q6 REJANING BESH INVARIANTINI (§3) isbotlashi kerak, shuning uchun
 * shartlar sof funksiyaga chiqarildi va ular ustiga test yozildi.
 *
 * ⚠️ IKKINCHI FORMULA YOZILMAYDI. Reyestr qatorining kutilgan summasi
 * `receivablePortion` (Q1 sof moduli, §2.2 kesishuv qoidasi) dan olinadi —
 * agar bu yerda «max(0, min(...))» qayta yozilsa, verify tekshirayotgan
 * kodning O'ZI bilan bir xil xatoni takrorlab, hech narsani isbotlamasdi.
 */
import { receivablePortion } from '../modules/debt/sale-debt-registry.js';

/** Reyestr qatorining verify uchun kerakli kesimi (`Debt` dan o'qiladi). */
export interface RegistryRowSnapshot {
  totalMinor: bigint;
  paidMinor: bigint;
  status: string;
  balanceAdopted: boolean;
  /** `null` = muddatsiz. Q1 qoidasi bo'yicha OCHIQ qatorda bunday bo'lmasligi kerak. */
  nextContactAt: Date | null;
  /** `Debt.sourceDocType` — kassa chekidan tug'ilgan qatorda `'retailsale'`. */
  sourceDocType: string | null;
}

/** Bir ondagi o'lchov — barcha daftar bitta joyda. */
export interface LedgerSnapshot {
  /** Kontragent balansi (tiyin). `null` = O'LCHANMAGAN, «0» EMAS. */
  balanceMinor: bigint | null;
  /** Sinov chekidan tug'ilgan reyestr qatori (`sourceDocId = sale.id`); yo'q bo'lsa `null`. */
  row: RegistryRowSnapshot | null;
  /**
   * Shu qator undirish ro'yxatida (`GET /manager/collection`) chiqdimi.
   *
   * 🔴 `null` = **O'LCHANMADI**, «chiqmadi» EMAS. Endpoint javobni
   * `COLLECTION_ROW_CAP = 500` da KESADI (`truncated: true`) — Q5
   * backfill'idan keyin ro'yxat lokal o'lchovda 812 qatorga chiqdi, ya'ni
   * sinov qatori kesimdan tashqarida qolishi MUMKIN. Bunday holatda
   * «yo'q» deb yozish verify'ning O'ZINI yolg'onchiga aylantirardi:
   * `q4-collection` yolg'on QIZIL, avans yo'lida esa yolg'on YASHIL
   * berardi. Shuning uchun o'lchanmagan holat alohida qiymat va u
   * hukmda XATO deb sanaladi (aniq sabab bilan).
   */
  inCollection: boolean | null;
  /** Kassa yashig'i qoldig'i (tiyin). */
  cashDeskMinor: bigint;
  /** Kontragent kesimidagi balans JURNALI qatorlari soni. */
  journalRows: number;
}

/** Bitta hukm. `pass` — o'tdimi; `detail` — nima o'lchandi (chiqishga yoziladi). */
export interface Verdict {
  key: string;
  label: string;
  pass: boolean;
  detail: string;
}

/** Ochiq qoldiq: `total − paid`, hech qachon manfiy emas. */
export function rowRemaining(row: RegistryRowSnapshot | null): bigint {
  if (!row) return 0n;
  const rest = row.totalMinor - row.paidMinor;
  return rest > 0n ? rest : 0n;
}

/** Balans deltasi. Ikkalasi ham `null` bo'lsa 0; biri `null` bo'lsa `null` (o'lchab bo'lmaydi). */
export function balanceDelta(before: bigint | null, after: bigint | null): bigint | null {
  if (before === null && after === null) return 0n;
  if (before === null || after === null) return null;
  return after - before;
}

const som = (m: bigint | null): string =>
  m === null ? "o'lchanmagan" : `${(m / 100n).toLocaleString('ru-RU')} so'm`;

/**
 * Undirish ro'yxati o'lchovining CHIQISHDAGI matni. `null` — kesilgan ro'yxat,
 * ya'ni javob «yo'q» emas, «bilmadik»; operator buni ko'rib so'rovni
 * toraytiradi (`--only=` yoki `source=retailsale`).
 */
export const collectionDetail = (v: boolean | null): string =>
  v === null
    ? "inCollection=O'LCHANMADI (ro'yxat KESILGAN, `truncated: true`)"
    : `inCollection=${v}`;

const v = (key: string, label: string, pass: boolean, detail: string): Verdict => ({
  key,
  label,
  pass,
  detail,
});

// ────────────────────────────────── QARZ ZANJIRI (Q1…Q5) ────────────────────

export interface DebtChainInput {
  /** Sinov chekining qarz ulushi (tiyin). */
  debtMinor: bigint;
  /** Qisman to'lov summasi (tiyin). */
  payMinor: bigint;
  before: LedgerSnapshot;
  afterPost: LedgerSnapshot;
  afterPay: LedgerSnapshot;
  afterRefund: LedgerSnapshot;
}

/**
 * Qarz zanjiri: qarzga sotuv → reyestr qatori · balans AYNAN bir marta o'sdi ·
 * undirish ro'yxatida chiqdi · qisman to'lov → ikkala daftar teng kamaydi ·
 * vozvrat → ikkalasi teng qaytdi.
 *
 * Reja §3 ning invariantlari bu yerda RAQAM bilan tekshiriladi:
 * 1 (ikki karra yozilmaydi) · 2 (simmetriya) · 4 (avans qarz emas — §2.2).
 */
export function planDebtChainVerdicts({
  debtMinor,
  payMinor,
  before,
  afterPost,
  afterPay,
  afterRefund,
}: DebtChainInput): Verdict[] {
  const expectedRow = receivablePortion(before.balanceMinor, debtMinor);
  const postedRow = afterPost.row;
  const dPost = balanceDelta(before.balanceMinor, afterPost.balanceMinor);
  const dPay = balanceDelta(afterPost.balanceMinor, afterPay.balanceMinor);
  const dRefund = balanceDelta(afterPay.balanceMinor, afterRefund.balanceMinor);

  const remPost = rowRemaining(postedRow);
  const remPay = rowRemaining(afterPay.row);
  const remRefund = rowRemaining(afterRefund.row);

  return [
    v(
      'q2-row-opened',
      expectedRow > 0n
        ? 'Q2 — qarzga sotuv reyestrga qator ochdi'
        : 'Q2 — avans qopladi, qator ATAYLAB ochilmadi (invariant 4)',
      expectedRow > 0n ? postedRow !== null : postedRow === null,
      `kutilgan ${som(expectedRow)} · qator ${postedRow ? 'BOR' : "YO'Q"}`,
    ),
    v(
      'q2-row-amount',
      'Q2 — qator summasi §2.2 KESISHUV QOIDASI bo`yicha',
      postedRow === null ? expectedRow === 0n : postedRow.totalMinor === expectedRow,
      `qator ${som(postedRow?.totalMinor ?? 0n)} · kutilgan ${som(expectedRow)}`,
    ),
    v(
      'q2-balance-adopted',
      'Q2 — qator `balanceAdopted` (balansga QAYTA yozilmaydi)',
      postedRow === null ? expectedRow === 0n : postedRow.balanceAdopted === true,
      `balanceAdopted=${postedRow ? postedRow.balanceAdopted : '—'}`,
    ),
    v(
      'q2-source-doc',
      'Q2 — qator hujjat-manbasi `retailsale` (Q4 filtri shundan yuradi)',
      postedRow === null ? expectedRow === 0n : postedRow.sourceDocType === 'retailsale',
      `sourceDocType=${postedRow?.sourceDocType ?? '—'}`,
    ),
    v(
      'q1-due-date',
      'Q1 — muddat NULL EMAS (eslatma cron`i ko`radi)',
      postedRow === null ? expectedRow === 0n : postedRow.nextContactAt !== null,
      `nextContactAt=${postedRow?.nextContactAt?.toISOString() ?? "yo'q"}`,
    ),
    v(
      'inv1-balance-once',
      'INVARIANT 1 — balans AYNAN BIR MARTA o`sdi (ikki emas)',
      dPost === debtMinor,
      `Δbalans ${som(dPost)} · chek qarzi ${som(debtMinor)}`,
    ),
    v(
      'q4-collection',
      expectedRow > 0n
        ? 'Q4 — qator undirish ro`yxatida CHIQDI'
        : 'Q4/invariant 4 — avansli mijoz undirish ro`yxatida CHIQMADI',
      afterPost.inCollection === null
        ? false
        : expectedRow > 0n
          ? afterPost.inCollection
          : !afterPost.inCollection,
      collectionDetail(afterPost.inCollection),
    ),
    v(
      'p1-pay-symmetry',
      'Qisman to`lov — IKKALA daftar AYNAN teng kamaydi',
      dPay === -payMinor && remPost - remPay === payMinor,
      `Δbalans ${som(dPay)} · Δreyestr ${som(remPost - remPay)} · to'lov ${som(payMinor)}`,
    ),
    v(
      'inv2-refund-symmetry',
      expectedRow === 0n
        ? 'INVARIANT 2 — qator yo`q (avans qopladi) ⇒ simmetriya QO`LLANMAYDI'
        : 'INVARIANT 2 — vozvrat: balans deltasi = reyestr deltasi',
      // ⚠️ Avans qoplagan chekda reyestr qatori UMUMAN ochilmaydi (invariant 4),
      // ya'ni vozvratda balans yolg'iz harakatlanadi va bu TO'G'RI. Bunday
      // holatda simmetriyani talab qilish YOLG'ON qizil bo'lardi; qator
      // OCHILISHI kerakligini esa `q2-row-opened` allaqachon tekshiradi.
      expectedRow === 0n ? true : dRefund !== null && dRefund === -(remPay - remRefund),
      expectedRow === 0n
        ? "kutilgan qator 0 — o'lchanmaydi"
        : `Δbalans ${som(dRefund)} · Δreyestr ${som(-(remPay - remRefund))}`,
    ),
    v(
      'q3-row-closed',
      'Q3 — to`liq vozvratdan keyin qator YOPILDI (muddat NULL)',
      afterRefund.row === null ||
        (remRefund === 0n &&
          afterRefund.row.status === 'paid' &&
          afterRefund.row.nextContactAt === null),
      `qoldiq ${som(remRefund)} · status ${afterRefund.row?.status ?? '—'} · muddat ${
        afterRefund.row?.nextContactAt ? 'BOR' : "yo'q"
      }`,
    ),
    v(
      'q3-collection-gone',
      'Q3 — qaytarilgan chek undirish ro`yxatidan YO`QOLDI',
      afterRefund.inCollection === false,
      collectionDetail(afterRefund.inCollection),
    ),
  ];
}

// ────────────────────────────────── AVANS ZANJIRI (A1…A3) ───────────────────

export interface PrepayChainInput {
  /** A1 da qabul qilingan avans (tiyin). */
  prepayMinor: bigint;
  /** A2 da avansdan to'langan chek summasi (tiyin). */
  saleMinor: bigint;
  /** A2 dan keyin qolgan avansdan ORTIQ urinish 400 bergani. */
  overspendRejected: boolean;
  /** Avansi bor mijozga qarzga sotilgan chekning qarz ulushi (tiyin). */
  crossDebtMinor: bigint;
  /**
   * O'sha chekning AVANS ulushi (tiyin).
   *
   * 🔴 NEGA ALOHIDA KIRISH: A2 ning shartnomasi bo'yicha avans bloki QARZ
   * blokidan OLDIN yuguradi, ya'ni §2.2 kesishuv qoidasi avans YEYILGANDAN
   * KEYINGI balansdan hisoblanadi. Bu kirish bo'lmasa hukm balansni avans
   * bloki oldidagi qiymatda ko'rib, kutilgan qatorni KAM chiqarardi — va
   * aynan shu xato A2 hisobotining «chekinish 2» jadvalida tasvirlangan
   * (40 000 qarz undirish ro'yxatida ko'rinmay qolardi).
   */
  crossPrepayMinor: bigint;
  before: LedgerSnapshot;
  afterPrepay: LedgerSnapshot;
  /** Avansdan to'langan chekdan keyin. */
  afterSpend: LedgerSnapshot;
  /** Chek TO'LIQ to'langan deb yozildimi (`payedSumMinor === sumMinor`). */
  spendReceiptFullyPaid: boolean;
  /** §2.2 kesishuvi: avansi bor mijozga qarzga sotuvdan keyin. */
  afterCrossSale: LedgerSnapshot;
  /** Qolgan avansni naqd qaytargandan keyin. */
  afterRefund: LedgerSnapshot;
}

/**
 * Avans zanjiri: qabul → sarflash → kesishuv → qaytarish.
 *
 * ⚠️ `crossDebtMinor` bo'lgan qadam AYNAN A2 hisobotining «eng muhim jonli
 * tekshiruvi»: avansi 400 qolgan mijozga 1 000 lik chek = 400 avans + 600
 * qarz, va reyestr qatori **600** bo'lishi SHART (400 emas) — aks holda
 * egasining BIRINCHI shikoyati avans yo'li orqali qaytardi.
 */
export function planPrepayChainVerdicts({
  prepayMinor,
  saleMinor,
  overspendRejected,
  crossDebtMinor,
  crossPrepayMinor,
  before,
  afterPrepay,
  afterSpend,
  spendReceiptFullyPaid,
  afterCrossSale,
  afterRefund,
}: PrepayChainInput): Verdict[] {
  const dPrepayBal = balanceDelta(before.balanceMinor, afterPrepay.balanceMinor);
  const dPrepayCash = afterPrepay.cashDeskMinor - before.cashDeskMinor;
  const dSpendBal = balanceDelta(afterPrepay.balanceMinor, afterSpend.balanceMinor);
  const dSpendCash = afterSpend.cashDeskMinor - afterPrepay.cashDeskMinor;
  // Avans bloki QARZ blokidan OLDIN yuguradi (A2 shartnomasi) ⇒ §2.2 qoidasi
  // avans yeyilgandan KEYINGI balansdan hisoblanadi.
  const balanceBeforeCrossDebt =
    afterSpend.balanceMinor === null ? null : afterSpend.balanceMinor + crossPrepayMinor;
  const expectedCrossRow = receivablePortion(balanceBeforeCrossDebt, crossDebtMinor);
  const crossRow = afterCrossSale.row;
  const dRefundCash = afterRefund.cashDeskMinor - afterCrossSale.cashDeskMinor;

  return [
    v(
      'a1-cash-in',
      'A1 — avans qabul: kassa yashig`i AYNAN shu summaga o`sdi',
      dPrepayCash === prepayMinor,
      `Δkassa ${som(dPrepayCash)} · avans ${som(prepayMinor)}`,
    ),
    v(
      'a1-balance-negative',
      'A1 — mijoz balansi AYNAN shu summaga MANFIY tomonga surildi',
      dPrepayBal === -prepayMinor,
      `Δbalans ${som(dPrepayBal)}`,
    ),
    v(
      'inv4-no-debt-row',
      'INVARIANT 4 — avansdan `Debt` qatori TUG`ILMADI',
      afterPrepay.row === null && afterPrepay.inCollection !== true,
      `qator ${afterPrepay.row ? 'BOR' : "yo'q"} · ${collectionDetail(afterPrepay.inCollection)}`,
    ),
    v(
      'a2-cash-unchanged',
      'A2 — avansdan to`lovda kassa naqdi O`ZGARMADI',
      dSpendCash === 0n,
      `Δkassa ${som(dSpendCash)}`,
    ),
    v(
      'a2-balance-consumed',
      'A2 — balans avans summasicha nolga qarab surildi',
      dSpendBal === saleMinor,
      `Δbalans ${som(dSpendBal)} · chek ${som(saleMinor)}`,
    ),
    v(
      'a2-receipt-paid',
      'A2 — chek TO`LANGAN sanaldi (`DEBT` dan asosiy farq)',
      spendReceiptFullyPaid,
      `payedSum = jami: ${spendReceiptFullyPaid}`,
    ),
    v(
      'inv5-overspend-400',
      'INVARIANT 5 — avansdan ORTIQ urinish 400 bilan rad etildi',
      overspendRejected,
      `rad etildi: ${overspendRejected}`,
    ),
    v(
      'a2-cross-registry',
      'A2×Q2 KESISHUVI — reyestr qatori chekning HAQIQIY qarz ulushiga teng',
      crossDebtMinor === 0n ? true : crossRow !== null && crossRow.totalMinor === expectedCrossRow,
      `qator ${som(crossRow?.totalMinor ?? 0n)} · kutilgan ${som(expectedCrossRow)}`,
    ),
    v(
      'a3-refund-cash-out',
      'A3 — qolgan avans naqd qaytarildi (kassadan pul CHIQDI)',
      dRefundCash < 0n || afterCrossSale.balanceMinor === 0n,
      `Δkassa ${som(dRefundCash)}`,
    ),
    v(
      'a3-balance-settled',
      'A3 — qaytargandan keyin balansda avans QOLMADI',
      afterRefund.balanceMinor !== null && afterRefund.balanceMinor >= 0n,
      `balans ${som(afterRefund.balanceMinor)}`,
    ),
  ];
}

// ────────────────────────────────────────── YAKUNIY HUKM ────────────────────

export interface VerdictSummary {
  total: number;
  passed: number;
  failed: number;
  ok: boolean;
  failedKeys: string[];
}

/**
 * ⚠️ BO'SH RO'YXAT «O'TDI» EMAS. Zanjir umuman yugurmagan bo'lsa (masalan
 * skript yarim yo'lda to'xtagan) hukm YASHIL chiqmasligi kerak — aks holda
 * «Q6 o'tdi» degan yolg'on yozuv qoladi.
 */
export function summarizeVerdicts(verdicts: readonly Verdict[]): VerdictSummary {
  const failedKeys = verdicts.filter((x) => !x.pass).map((x) => x.key);
  return {
    total: verdicts.length,
    passed: verdicts.length - failedKeys.length,
    failed: failedKeys.length,
    ok: verdicts.length > 0 && failedKeys.length === 0,
    failedKeys,
  };
}

// ─────────────────────────────────── DRY — QAMROV O'LCHOVI ──────────────────

/** Jonli o'rnatmaning Q/A fazalari bo'yicha holati (DRY rejim chiqishi). */
export interface DeploymentProbe {
  /** `debts.source_doc_type` ustuni bazada bormi (Q1 migratsiyasi). */
  q1Columns: boolean;
  /** `company_settings.sale_debt_term_days` bormi (Q4 migratsiyasi). */
  q4Column: boolean;
  /** `retail_drawer_cash_in.kind` bormi (A1 migratsiyasi). */
  a1Column: boolean;
  /**
   * API javob berdimi (`GET /debts/pos/summary/:id` chaqiruvi o'tdimi).
   *
   * 🔴 NEGA ALOHIDA MAYDON: usiz `a2Field/a3Field = false` IKKI xil
   * haqiqatni bitta qatorga qo'shib qo'yardi — «kod eski» va «API umuman
   * ishlamayapti». Lokal DRY yugurishida aynan shu chalkashlik chiqdi:
   * :4001 da server yo'q edi, jadval esa «kod deploy qilinmagan» deb
   * yozdi — ya'ni o'lchov bo'lmagan joyda XULOSA bor edi.
   */
  apiReachable: boolean;
  /** `GET /debts/pos/summary/:id` javobida `prepayAvailableMinor` bormi (A2 kodi). */
  a2Field: boolean;
  /** ...`standing` bormi (A3 kodi). */
  a3Field: boolean;
  /** Reyestrda `sourceDocType='retailsale'` qatorlari soni (Q2 yoki Q5 izi). */
  saleDebtRows: number;
  /** Shundan Q5 backfill'i ochgani (`DebtNote` da `[Q5-BACKFILL` belgisi). */
  backfillRows: number;
}

/**
 * Kod-maydon qatorining matni. «O'lchanmadi» va «o'lchandi, yo'q» — IKKI
 * BOSHQA gap: birinchisi API'ni ko'tarishni, ikkinchisi deploy'ni talab qiladi.
 */
export const codeFieldDetail = (apiReachable: boolean, present: boolean): string => {
  if (!apiReachable) return "O'LCHANMADI — API javob bermadi (server ko'tarilganmi? `Q6_API_BASE`)";
  return present ? 'maydon javobda BOR' : "maydon YO'Q — kod deploy qilinmagan";
};

export interface ReadinessLine {
  phase: string;
  ready: boolean;
  detail: string;
}

/**
 * DRY rejim uchun: jonlida QAYSI faza allaqachon bor. Bu «verify» emas —
 * bu **deploy oynasining o'lchovi**, ya'ni skriptni `--live` bilan
 * yugurtirish MA'NOSI bormi degan savolga javob.
 */
export function planReadiness(p: DeploymentProbe): ReadinessLine[] {
  return [
    {
      phase: 'Q1 (migratsiya: debts.source_doc_type/source_doc_id)',
      ready: p.q1Columns,
      detail: p.q1Columns ? 'ustunlar BOR' : "ustunlar YO'Q — migratsiya berilmagan",
    },
    {
      phase: 'A1 (migratsiya: retail_drawer_cash_in.kind)',
      ready: p.a1Column,
      detail: p.a1Column ? 'ustun BOR' : "ustun YO'Q — migratsiya berilmagan",
    },
    {
      phase: 'Q4 (migratsiya: company_settings.sale_debt_term_days)',
      ready: p.q4Column,
      detail: p.q4Column ? 'ustun BOR' : "ustun YO'Q — migratsiya berilmagan",
    },
    {
      phase: 'A2 (kod: summary.prepayAvailableMinor)',
      ready: p.a2Field,
      detail: codeFieldDetail(p.apiReachable, p.a2Field),
    },
    {
      phase: 'A3 (kod: summary.standing)',
      ready: p.a3Field,
      detail: codeFieldDetail(p.apiReachable, p.a3Field),
    },
    {
      phase: 'Q2/Q5 (ma`lumot: reyestrda kassa cheki qatorlari)',
      ready: p.saleDebtRows > 0,
      detail: `jami ${p.saleDebtRows} qator · shundan Q5 backfill'i ${p.backfillRows}`,
    },
  ];
}

/**
 * `--live` yugurtirish MUMKINmi: API javob beradi + migratsiya + kod joyida.
 *
 * `apiReachable` ataylab ALOHIDA shart bo'lib turibdi (garchi u `a2Field`
 * dan kelib chiqsa ham): shart o'qilganda «API kerak» degan talab
 * KO'RINIB tursin — skriptning butun o'lchovi HTTP orqali.
 */
export function isLiveVerifyPossible(p: DeploymentProbe): boolean {
  return p.apiReachable && p.q1Columns && p.a1Column && p.q4Column && p.a2Field && p.a3Field;
}
