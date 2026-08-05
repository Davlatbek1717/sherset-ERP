import {
  BUILT_IN_CATALOG,
  type MetricCatalog,
  type MetricDirection,
  metricDef,
} from './kpi-metrics.js';

/**
 * Kompozit ball — «og'irlik × bajarish %» (TZ §2.2, M10 formulasi).
 *
 * SOF modul (DB yo'q, soat yo'q). Sabab 1.4 dagi hodisa bilan bir xil: foiz
 * formulasi yetti joyda uch xil yozilgan edi. Menejer ekranidagi ball, xodim
 * kartasidagi trend va oylik hisobidagi raqam AYNAN shu funksiyadan chiqadi.
 *
 * ⚠️ SHARTNOMALAR (buzilsa raqam jimgina yolg'on bo'ladi):
 *   1. **NULL ≠ 0** — o'lchanmagan ko'rsatkich ballga KIRMAYDI, nol deb
 *      hisoblanmaydi (1.1/1.2 sabog'i, TZ §2.4).
 *   2. **Maqsadsiz ko'rsatkich ballga kirmaydi** — «fakt bor, reja yo'q»
 *      holatida bajarish foizi mavjud emas, taxmin qilinmaydi.
 *   3. **Menejer tuzatmasi (`adjustValue`) g'olib**, lekin `autoValue`
 *      saqlanadi — ikkalasining farqi egaga haftalik xulosani beradi (M-Q7).
 *   4. Ball FAQAT ballga kirgan og'irliklar ustidan o'rtachalanadi va
 *      `weightScored/weightTotal` ochiq qaytariladi: menejer «bu ball kunning
 *      qanchasini qamragan» ni ko'radi. Yashirin to'liqsizlik — yolg'on ball.
 */

/**
 * Bitta ko'rsatkichning ballga qo'shadigan hissasi shu foizdan oshmaydi.
 *
 * NEGA CHEK BOR: bitta ko'rsatkichda 10 barobar oshib ketish (masalan bitta
 * yirik ulgurji chek) qolgan hamma ko'rsatkichni yopib yuborardi — kassa farqi
 * ham, kechikish ham ahamiyatsiz bo'lib qolardi. 150% = «rejadan sezilarli
 * oshdi» ni taqdirlaydi, lekin kunni bitta hodisaga aylantirmaydi.
 *
 * Bu — TZ'da ko'rsatilmagan, shu bosqichda tanlangan siyosat; sozlanadigan
 * qilish kerak bo'lsa 4M.10 da `ManagerRuleConfig` ga chiqadi.
 */
export const SCORE_CAP_PERCENT = 150;

/** Ko'rsatkich ballga nega kirmagani — ekranda ochiq ko'rsatiladi. */
export type SkipReason =
  | 'unmeasured' // fakt o'lchanmagan (NULL, 0 emas)
  | 'no_target' // maqsad qo'yilmagan
  | 'no_weight' // og'irlik 0 — «faqat ko'rsatiladi»
  | 'neutral' // yo'nalishsiz ko'rsatkich (yaxshi/yomon tushunchasi yo'q)
  | 'unknown_metric'; // katalogda yo'q kalit

export interface ScoreMetricInput {
  metricKey: string;
  /** Tizim hisoblagani. NULL = o'lchanmagan. */
  autoValue: bigint | null;
  /** Menejer tuzatmasi. NULL = tuzatilmagan. */
  adjustValue: bigint | null;
  /** Kunlik maqsad (ko'rsatkichning o'z birligida). NULL = maqsadsiz. */
  target: bigint | null;
  /** Kompozit balldagi og'irligi. 0 = ballga kirmaydi. */
  weight: number;
  /** Qiymat to'liq manbadan hisoblanganmi. */
  complete: boolean;
}

export interface ScoredMetric {
  metricKey: string;
  direction: MetricDirection;
  /** Ballga kirgan qiymat: tuzatma ?? avtomat. */
  fact: bigint | null;
  autoValue: bigint | null;
  adjustValue: bigint | null;
  /** Menejer tuzatganmi (ekranda belgi). */
  adjusted: boolean;
  target: bigint | null;
  weight: number;
  /** Bajarish foizi — CHEKSIZ (haqiqiy natija ko'rinadi). NULL = hisoblanmadi. */
  achievementPercent: number | null;
  /** Ballga kirgan hissa — `SCORE_CAP_PERCENT` bilan cheklangan. */
  contributionPercent: number | null;
  complete: boolean;
  scored: boolean;
  skipReason: SkipReason | null;
}

export interface DayScore {
  /** 0…`SCORE_CAP_PERCENT` — og'irlikli o'rtacha. NULL = hech narsa ballanmadi. */
  score: number | null;
  /** Ballga kirgan og'irliklar yig'indisi. */
  weightScored: number;
  /** Profilda belgilangan umumiy og'irlik. */
  weightTotal: number;
  /** Ball kunning qanchasini qamradi (0…1). NULL = og'irlik umuman yo'q. */
  coverage: number | null;
  /** Bironta ballangan ko'rsatkich chala manbadan hisoblanganmi. */
  dataComplete: boolean;
  metrics: ScoredMetric[];
}

/**
 * Bitta ko'rsatkichning bajarish foizi.
 *
 * `higher_better` — fakt ÷ maqsad.
 * `lower_better`  — maqsad = SHIFT (undan oshmaslik kerak). Chiziqli va
 *   simmetrik: fakt 0 da 200%, fakt = maqsad da 100%, fakt = 2×maqsad da 0%.
 *   Nisbat shakli (`maqsad ÷ fakt`) tanlanmadi: u nolga yaqinlashganda
 *   cheksizlikka ketadi va bitta ideal kun butun oyni bo'yab yuborardi.
 * `maqsad = 0` (nol-tolerantlik: kassa farqi, zararga sotuv) — fakt 0 bo'lsa
 *   100%, aks holda 0%. Chiziqli formula bu yerda nolga bo'lishga olib kelardi.
 */
export function achievementPercent(
  fact: bigint,
  target: bigint,
  direction: MetricDirection,
): number | null {
  if (direction === 'neutral') return null;

  if (direction === 'higher_better') {
    if (target <= 0n) return null; // maqsadsiz — «har qanday natija yaxshi» ballanmaydi
    return round1((Number(fact) / Number(target)) * 100);
  }

  // lower_better
  if (target < 0n) return null;
  if (target === 0n) return fact <= 0n ? 100 : 0;
  const ratio = Number(fact) / Number(target);
  return round1(Math.max(0, (2 - ratio) * 100));
}

/**
 * Kun bo'yicha kompozit ball.
 *
 * `catalog` — hisobning ko'rsatkich ta'riflari (built-in + o'z ko'rsatkichlari).
 * Berilmasa faqat built-in'lar ko'riladi; hisobning O'Z ko'rsatkichi u holda
 * «katalogda yo'q» bo'lib ballanmay qolardi, shuning uchun chaqiruvchi
 * (servis) uni har doim uzatadi.
 */
export function scoreDay(
  inputs: readonly ScoreMetricInput[],
  catalog: MetricCatalog = BUILT_IN_CATALOG,
): DayScore {
  const metrics: ScoredMetric[] = [];
  let weightScored = 0;
  let weightTotal = 0;
  let weightedSum = 0;
  let dataComplete = true;

  for (const input of inputs) {
    const def = metricDef(input.metricKey, catalog);
    const direction: MetricDirection = def?.direction ?? 'neutral';
    // Tuzatma g'olib, lekin avtomat qiymat saqlanadi (§3.2).
    const fact = input.adjustValue ?? input.autoValue;
    const weight = Number.isFinite(input.weight) ? Math.max(0, input.weight) : 0;
    weightTotal += weight;

    const skipReason = resolveSkip(def == null, direction, fact, input.target, weight);
    const achievement =
      skipReason == null && fact != null && input.target != null
        ? achievementPercent(fact, input.target, direction)
        : null;
    // `achievementPercent` null qaytarishi mumkin (masalan higher_better,
    // maqsad ≤ 0) — u holda ko'rsatkich ballanmaydi.
    const scored = skipReason == null && achievement != null;
    const contribution = scored ? Math.min(achievement, SCORE_CAP_PERCENT) : null;

    if (scored && contribution != null) {
      weightScored += weight;
      weightedSum += weight * contribution;
      if (!input.complete) dataComplete = false;
    }

    metrics.push({
      metricKey: input.metricKey,
      direction,
      fact,
      autoValue: input.autoValue,
      adjustValue: input.adjustValue,
      adjusted: input.adjustValue != null,
      target: input.target,
      weight,
      achievementPercent: achievement,
      contributionPercent: contribution,
      complete: input.complete,
      scored,
      skipReason: scored ? null : (skipReason ?? 'no_target'),
    });
  }

  return {
    score: weightScored > 0 ? round1(weightedSum / weightScored) : null,
    weightScored: round1(weightScored),
    weightTotal: round1(weightTotal),
    coverage: weightTotal > 0 ? round1(weightScored / weightTotal, 4) : null,
    dataComplete,
    metrics,
  };
}

function resolveSkip(
  unknownMetric: boolean,
  direction: MetricDirection,
  fact: bigint | null,
  target: bigint | null,
  weight: number,
): SkipReason | null {
  if (unknownMetric) return 'unknown_metric';
  if (direction === 'neutral') return 'neutral';
  if (weight <= 0) return 'no_weight';
  // NULL ≠ 0: o'lchanmagan ko'rsatkich nol deb ballanmaydi.
  if (fact == null) return 'unmeasured';
  if (target == null) return 'no_target';
  return null;
}

function round1(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
