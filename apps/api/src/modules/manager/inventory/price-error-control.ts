/**
 * MK18 — **xato narx nazorati**. Sof modul (Prisma'siz).
 *
 * ## Bu MK11 EMAS
 * `price-change-control.ts` (MK11) «narx **o'zgardimi** va qanchaga» degan
 * savolga javob beradi — manbasi `AuditLog`, sub'ekti tovar kartasi.
 * Bu modul boshqa savolni so'raydi: «sotilgan narx **qiymati mantiqlimi**» —
 * manbasi sotuv qatorlari, sub'ekti bitta hujjat qatori. Ikkalasi keyinchalik
 * bir navbat dvigatelida (MK06) uchrashadi, lekin qoidalari aralashmaydi.
 *
 * ## Bu `cashier-audit.ts` ham EMAS — ATAYLAB
 * `retail-sale/cashier-audit.ts` chek rasmiylashtirilganda `SOLD_BELOW_COST` /
 * `SOLD_BELOW_WHOLESALE` hodisalarini YOZADI va ular kunlik KPI'ga tushadi.
 * U **siyosat** savoliga javob beradi: «pul yo'qotildimi?» — chegirma bilan
 * yoki chegirmasiz, yo'qotilgan pul yo'qotilgan puldir.
 *
 * Bu modul **ma'lumot sifati** savoliga javob beradi: «bu raqam xato
 * yozilganmi?». Shuning uchun bu yerda chegirma **tushuntirish** hisoblanadi
 * (`PRICE_UNCHECKED.discounted`), o'sha yerda esa hisoblanmaydi. Ikkisini
 * «bir joyga yig'ish» kerak emas — ular bir xil taqqoslashni ikki xil maqsadda
 * ishlatadi. Kim birlashtirmoqchi bo'lsa: avval shu izohni va
 * `price-error-control.test.ts` dagi (2)/(2b) juftligini o'qisin.
 *
 * ## BLOKLAMAYDI
 * 4-bo'lim TZ §5.1: kassir va sotuvchi ataylab erkin. Hukmda `blocks` maydoni
 * literal `false` tipida — kelajakda bu yerdan taqiq yasamoqchi bo'lgan odam
 * avval tipni va testni buzishi kerak bo'ladi (MK11 bilan bir naqsh).
 *
 * ## NULL ≠ 0
 * Har detektorning o'z mo'ljali bor (tan narx · optom · karta narxi ·
 * o'rtacha). Mo'ljal yo'q bo'lsa — hukm YO'Q va sabab `unchecked` ga yoziladi.
 * Jimgina «xato yo'q» deb o'tish «tekshirildi» degan yolg'on bo'lardi.
 * Mo'ljalning `0` qiymati ham «yig'ilmagan» deb o'qiladi: `Product.buyPrice`
 * va `Stock.costBalanceMinor` DEFAULT 0 — 0 ni haqiqiy tan narx deb olish har
 * sotuvni «100% marja» qilib ko'rsatgan bug'ning aynan o'zi.
 */

import { scaleMinorByQty } from '@moysklad/money';

/** Topilgan xato turi. */
export const PRICE_ERROR = {
  /** Nol yoki manfiy birlik narxi. */
  zeroPrice: 'ZERO_PRICE',
  /** Karta narxidan 10× yoki 0.1× — o'nlik nuqtasi xatosi. */
  decimalShift: 'DECIMAL_SHIFT',
  /** Tan narxdan past sotuv (chegirmasiz). */
  belowCost: 'BELOW_COST',
  /** Optom naridan past sotuv (chegirmasiz). */
  belowWholesale: 'BELOW_WHOLESALE',
  /** Shu tovarning o'rtacha sotuv narxidan keskin farq. */
  outlier: 'PRICE_OUTLIER',
} as const;

export type PriceErrorKind = (typeof PRICE_ERROR)[keyof typeof PRICE_ERROR];

/** Nega hukm chiqarilmadi. Bo'sh natija «toza» degani EMAS. */
export const PRICE_UNCHECKED = {
  /** Tan narx yig'ilmagan (NULL yoki 0). */
  noCost: 'no_cost',
  /** Optom narx turi tanlanmagan yoki kartada yo'q. */
  noWholesale: 'no_wholesale',
  /** Karta/ro'yxat narxi yo'q — o'nlik xatosini nimaga taqqoslash noma'lum. */
  noReference: 'no_reference',
  /** O'rtacha yo'q yoki namuna juda kam — statistik dalil emas. */
  noAverage: 'no_average',
  /** Qatorda chegirma bor — past narx ATAYLAB qo'yilgan, xato emas. */
  discounted: 'discounted',
} as const;

export type PriceUncheckedReason = (typeof PRICE_UNCHECKED)[keyof typeof PRICE_UNCHECKED];

/** Qaysi hujjatdan kelgan qator. */
export type PriceErrorDocType = 'retailsale' | 'demand';

export interface PriceErrorThresholds {
  /** `10×`/`0.1×` atrofida ruxsat etilgan og'ish, %. */
  decimalTolerancePercent: number;
  /** O'rtachadan shuncha %dan **ortiq** farq — keskin farq. */
  outlierPercent: number;
  /** O'rtacha ishonchli sanalishi uchun eng kam sotuv soni. */
  minAverageSample: number;
}

/**
 * Boshlang'ich chegaralar. Kodda **qattiq emas** — so'rovda almashtiriladi,
 * doimiy per-akkaunt sozlama `ManagerRuleConfig` bilan keladi (MK06/MK07).
 *
 * `outlierPercent: 50` — 1.5× dan katta farq. Pastroq chegara aksiya va
 * mavsumiy narxlarni navbatga to'kib yuborardi.
 * `minAverageSample: 3` — ikki sotuvning o'rtachasi hukm uchun asos emas.
 */
export const DEFAULT_PRICE_ERROR_THRESHOLDS: PriceErrorThresholds = {
  decimalTolerancePercent: 5,
  outlierPercent: 50,
  minAverageSample: 3,
};

/** Bitta sotilgan qator — mo'ljallar SERVER tomonda hal qilingan holda. */
export interface SoldLineInput {
  docType: PriceErrorDocType;
  docId: string;
  docName: string | null;
  /** Qator id — `dedupKey` shundan quriladi, shuning uchun barqaror bo'lishi shart. */
  lineId: string;
  productId: string | null;
  productName: string | null;
  /** Xom decimal satri (sxemada scale 6). Butunga yaxlitlash og'irlik/uzunlik bo'yicha zararni kamaytirardi. */
  quantity: string;
  /** Birlik narxi — qator chegirmasidan OLDIN. */
  priceMinor: bigint;
  /** Qator chegirmasi, %. */
  discountPercent: number;
  /** Tan narx (muzlatilgan). NULL/0 = yig'ilmagan. */
  costMinor: bigint | null;
  /** Optom pol. NULL = narx turi tanlanmagan yoki kartada yo'q. */
  wholesaleMinor: bigint | null;
  /** Karta/ro'yxat narxi — o'nlik xatosining mo'ljali. */
  referenceMinor: bigint | null;
  /** Shu tovarning oynadagi o'rtacha sotuv narxi. */
  averageMinor: bigint | null;
  /** O'rtacha nechta sotuvdan olingan. */
  averageSampleCount: number;
  soldById: string | null;
  soldByName: string | null;
  at: Date;
}

export interface PriceErrorFinding {
  kind: PriceErrorKind;
  /** Nimaga taqqoslandi (pol yoki mo'ljal). `ZERO_PRICE` da mo'ljal yo'q. */
  expectedMinor: bigint | null;
  /**
   * Pul ta'siri — **butun qator** bo'yicha (birlikka emas), tiyin.
   * Ishorali: musbat = mijozdan ortiqcha olindi / kutilgandan yuqori,
   * manfiy = kam olindi. O'lchab bo'lmasa `null`.
   */
  amountMinor: bigint | null;
  /** `DECIMAL_SHIFT` uchun `10` yoki `0.1`; boshqalarda `null`. */
  factor: number | null;
  /** Mo'ljaldan og'ish, % (2 kasr). Mo'ljalsiz hukmda `null`. */
  deviationPercent: number | null;
}

/** MK06 navbat dvigateli uchun tayyor element (hali saqlanmaydi). */
export interface PriceErrorWorkItem {
  /** Barqaror dedup kaliti — belgilar ro'yxati o'zgarsa ham o'zgarmaydi. */
  dedupKey: string;
  ruleType: 'PRICE_ERROR';
  /** Sotgan xodim — navbat elementining «kim»i. */
  subjectEmployeeId: string | null;
  docType: PriceErrorDocType;
  docId: string;
  /** «Qancha» — belgilar ichidagi eng katta MUTLAQ ta'sir (ishorasi saqlanadi). */
  amountMinor: bigint | null;
  at: Date;
  context: {
    lineId: string;
    productId: string | null;
    priceMinor: bigint;
    kinds: PriceErrorKind[];
    thresholds: PriceErrorThresholds;
  };
}

export interface PriceErrorReview {
  docType: PriceErrorDocType;
  docId: string;
  docName: string | null;
  lineId: string;
  productId: string | null;
  productName: string | null;
  quantity: string;
  priceMinor: bigint;
  discountPercent: number;
  costMinor: bigint | null;
  wholesaleMinor: bigint | null;
  referenceMinor: bigint | null;
  averageMinor: bigint | null;
  soldById: string | null;
  soldByName: string | null;
  at: Date;
  findings: PriceErrorFinding[];
  /** Tekshirib bo'lmagan o'qlar — takrorsiz. */
  unchecked: PriceUncheckedReason[];
  /** **Doim `false`.** Nazorat kuzatadi, to'xtatmaydi (TZ §5.1). */
  blocks: false;
  workItem: PriceErrorWorkItem | null;
}

/** Foiz taqqoslashlari uchun butun-son shkalasi (ratio × 10 000). */
const SCALE = 10_000n;
/** Chegara foizini bazis punktga (foiz × 100) aylantiradi. */
const toBp = (percent: number) => BigInt(Math.max(0, Math.round(percent * 100)));

const abs = (v: bigint) => (v < 0n ? -v : v);

/** `value / base` nisbati, ×10 000. `base` musbat bo'lishi kafolatlangan. */
const ratioScaled = (value: bigint, base: bigint) => (value * SCALE) / base;

/** Mo'ljal ishlatishga yaroqlimi. 0 = «yig'ilmagan», narx emas. */
const usable = (v: bigint | null): v is bigint => v != null && v > 0n;

/** Foizni 2 kasrgacha son sifatida beradi. */
const percentOf = (diff: bigint, base: bigint) => Number((diff * SCALE) / base) / 100;

function decimalFactor(price: bigint, reference: bigint, tolerancePercent: number): number | null {
  const tolBp = toBp(tolerancePercent);
  const r = ratioScaled(price, reference);

  for (const [factor, centre] of [
    [10, 10n * SCALE],
    [0.1, SCALE / 10n],
  ] as const) {
    const lo = (centre * (SCALE - tolBp)) / SCALE;
    const hi = (centre * (SCALE + tolBp)) / SCALE;
    if (r >= lo && r <= hi) return factor;
  }
  return null;
}

/**
 * Bitta qatorga hukm. Detektorlar tartibi ahamiyatli:
 *
 * 1. `ZERO_PRICE` **qisqa tutashtiradi** — nol narx tan narxdan ham, optomdan
 *    ham, o'rtachadan ham past; bularning hammasini yozish bitta muammoni besh
 *    qatorga bo'lib navbatni shovqinga ko'mardi. Bitta aniq tashxis yetadi.
 * 2. `DECIMAL_SHIFT` `PRICE_OUTLIER` dan **ustun**: 10× ham keskin farq, ammo
 *    «o'nlik xatosi» aniqroq tashxis va menejerga nima qilishni aytadi.
 */
function reviewOne(input: SoldLineInput, thresholds: PriceErrorThresholds): PriceErrorReview {
  const findings: PriceErrorFinding[] = [];
  const unchecked = new Set<PriceUncheckedReason>();
  // Chegirma — ATAYLAB qilingan ish. U past narxni tushuntiradi, lekin
  // qimmatlashishni yoki o'nlik xatosini tushuntirmaydi.
  const discounted = input.discountPercent > 0;

  const base = {
    docType: input.docType,
    docId: input.docId,
    docName: input.docName,
    lineId: input.lineId,
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity,
    priceMinor: input.priceMinor,
    discountPercent: input.discountPercent,
    costMinor: input.costMinor,
    wholesaleMinor: input.wholesaleMinor,
    referenceMinor: input.referenceMinor,
    averageMinor: input.averageMinor,
    soldById: input.soldById,
    soldByName: input.soldByName,
    at: input.at,
    blocks: false as const,
  };

  if (input.priceMinor <= 0n) {
    return {
      ...base,
      findings: [
        {
          kind: PRICE_ERROR.zeroPrice,
          expectedMinor: null,
          amountMinor: null,
          factor: null,
          deviationPercent: null,
        },
      ],
      unchecked: [],
      workItem: buildWorkItem(input, [PRICE_ERROR.zeroPrice], null, thresholds),
    };
  }

  // ── O'nlik xatosi ────────────────────────────────────────────────────────
  let shifted = false;
  if (!usable(input.referenceMinor)) {
    unchecked.add(PRICE_UNCHECKED.noReference);
  } else {
    const factor = decimalFactor(
      input.priceMinor,
      input.referenceMinor,
      thresholds.decimalTolerancePercent,
    );
    if (factor != null) {
      shifted = true;
      findings.push({
        kind: PRICE_ERROR.decimalShift,
        expectedMinor: input.referenceMinor,
        amountMinor: scaleMinorByQty(input.priceMinor - input.referenceMinor, input.quantity),
        factor,
        deviationPercent: percentOf(input.priceMinor - input.referenceMinor, input.referenceMinor),
      });
    }
  }

  // ── Pollar: tan narx va optom ────────────────────────────────────────────
  for (const [kind, floor, missing] of [
    [PRICE_ERROR.belowCost, input.costMinor, PRICE_UNCHECKED.noCost],
    [PRICE_ERROR.belowWholesale, input.wholesaleMinor, PRICE_UNCHECKED.noWholesale],
  ] as const) {
    if (!usable(floor)) {
      unchecked.add(missing);
      continue;
    }
    if (discounted) {
      unchecked.add(PRICE_UNCHECKED.discounted);
      continue;
    }
    if (input.priceMinor >= floor) continue;
    findings.push({
      kind,
      expectedMinor: floor,
      amountMinor: scaleMinorByQty(floor - input.priceMinor, input.quantity),
      factor: null,
      deviationPercent: percentOf(input.priceMinor - floor, floor),
    });
  }

  // ── O'rtachadan keskin farq ──────────────────────────────────────────────
  if (!usable(input.averageMinor) || input.averageSampleCount < thresholds.minAverageSample) {
    unchecked.add(PRICE_UNCHECKED.noAverage);
  } else if (!shifted) {
    const average = input.averageMinor;
    const diff = input.priceMinor - average;
    const exceeds = ratioScaled(abs(diff), average) > toBp(thresholds.outlierPercent);
    if (exceeds) {
      // Chegirma faqat PASTGA og'ishni oqlaydi.
      if (diff < 0n && discounted) {
        unchecked.add(PRICE_UNCHECKED.discounted);
      } else {
        findings.push({
          kind: PRICE_ERROR.outlier,
          expectedMinor: average,
          amountMinor: scaleMinorByQty(diff, input.quantity),
          factor: null,
          deviationPercent: percentOf(diff, average),
        });
      }
    }
  }

  const kinds = findings.map((f) => f.kind);
  return {
    ...base,
    findings,
    unchecked: [...unchecked],
    workItem: kinds.length ? buildWorkItem(input, kinds, pickAmount(findings), thresholds) : null,
  };
}

/**
 * Navbat elementining «qancha»si — belgilar ichidagi eng katta MUTLAQ ta'sir,
 * ishorasi saqlangan holda. Yig'indi olinmaydi: bir xato bir necha belgi
 * chiqarganda (tan narxdan ham, optomdan ham past) ularni qo'shish bitta
 * zararni ikki marta sanardi.
 */
function pickAmount(findings: ReadonlyArray<PriceErrorFinding>): bigint | null {
  let best: bigint | null = null;
  for (const f of findings) {
    if (f.amountMinor == null) continue;
    if (best == null || abs(f.amountMinor) > abs(best)) best = f.amountMinor;
  }
  return best;
}

function buildWorkItem(
  input: SoldLineInput,
  kinds: PriceErrorKind[],
  amountMinor: bigint | null,
  thresholds: PriceErrorThresholds,
): PriceErrorWorkItem {
  return {
    // Qator bo'yicha — belgilar ro'yxati emas. Chegara sozlansa yoki tan narx
    // keyinroq to'ldirilsa belgilar to'plami o'zgaradi; kalit o'zgarsa MK06
    // dvigateli ayni qator uchun ikkinchi element yaratardi.
    dedupKey: `price_error:${input.docType}:${input.lineId}`,
    ruleType: 'PRICE_ERROR',
    subjectEmployeeId: input.soldById,
    docType: input.docType,
    docId: input.docId,
    amountMinor,
    at: input.at,
    context: {
      lineId: input.lineId,
      productId: input.productId,
      priceMinor: input.priceMinor,
      kinds,
      thresholds,
    },
  };
}

/** Har sotilgan qatorga hukm. Tartib kirish tartibini saqlaydi. */
export function reviewSoldLinePrices(
  lines: ReadonlyArray<SoldLineInput>,
  thresholds: PriceErrorThresholds = DEFAULT_PRICE_ERROR_THRESHOLDS,
): PriceErrorReview[] {
  return lines.map((l) => reviewOne(l, thresholds));
}

export interface PriceErrorSummary {
  /** Kamida bitta belgi olgan qatorlar. */
  flaggedLineCount: number;
  /** Kamida bitta o'q tekshirilmay qolgan qatorlar — «toza» bilan aralashmasin. */
  uncheckedLineCount: number;
  byKind: Record<PriceErrorKind, number>;
}

/**
 * Ekran sarlavhasi uchun sanoq. `uncheckedLineCount` ATAYLAB alohida turadi:
 * «0 xato» va «0 xato, lekin 400 qator tekshirilmadi» — bir xil xabar emas.
 */
export function summarizePriceErrors(reviews: ReadonlyArray<PriceErrorReview>): PriceErrorSummary {
  const byKind = Object.fromEntries(Object.values(PRICE_ERROR).map((k) => [k, 0])) as Record<
    PriceErrorKind,
    number
  >;

  let flaggedLineCount = 0;
  let uncheckedLineCount = 0;
  for (const r of reviews) {
    if (r.findings.length > 0) flaggedLineCount++;
    if (r.unchecked.length > 0) uncheckedLineCount++;
    for (const f of r.findings) byKind[f.kind]++;
  }

  return { flaggedLineCount, uncheckedLineCount, byKind };
}
