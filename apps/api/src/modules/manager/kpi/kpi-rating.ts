import { type DailyKpiState, countsTowardPayroll } from './daily-kpi-fsm.js';

/**
 * MK13 / 4M TZ §11 (M10) — DAVR REYTINGI.
 *
 * TZ panelda reytingni va'da qilgan, lekin **formulasi hech qayerda yo'q edi**.
 * Bu modul o'sha formulaning yagona manbai.
 *
 * ## QAROR-B6 (2026-08-09, egasining tasdig'i)
 * Reytingga **faqat qabul qilingan kunlar** kiradi (`accepted`,
 * `force_accepted`). Shart `daily-kpi-fsm.countsTowardPayroll()` dan olinadi —
 * **nusxa qilinmaydi**: oylik va reyting bir xil haqiqatdan o'qishi kerak,
 * aks holda «reytingda birinchi, lekin oyligida yo'q» holati tug'ilardi.
 *
 * ## 🔴 Shartnomalar (buzilsa reyting jimgina yolg'on bo'ladi)
 * 1. **NULL ≠ 0.** Ballanmagan xodim `averageScore: null` bo'ladi va o'rin
 *    OLMAYDI — 0 ball bilan oxirgi o'ringa qo'yilmaydi. «Kuni qabul
 *    qilinmagan» ≠ «yomon ishlagan».
 * 2. **Qamrov ochiq.** `daysCounted` / `daysInPeriod` / `daysWithoutScore`
 *    qaytariladi: «2 kundan chiqqan 100%» ekranda ko'rinib tursin.
 * 3. **Manba — MUZLATILGAN ball** (`EmployeeDailyKpi.scorePercent`), jonli
 *    qayta hisob emas (§2.3 — o'tgan oy raqami o'zgarmaydi).
 * 4. **Determinist tartib.** Teng natijada ham javob kirish tartibiga bog'liq
 *    emas; tartib xodim NOMI bo'yicha buzilmaydi (lokalga bog'liq saralash
 *    barqaror emas — `id` ishlatiladi).
 *
 * ## Sof modul
 * DB yo'q, soat yo'q. Chegaralash (`SCORE_CAP_PERCENT`) bu yerda QAYTA
 * qo'llanmaydi — u kunlik ball hisoblanayotganda `kpi-score.ts` da bo'lgan.
 */

export interface RatingDay {
  employeeId: string;
  employeeName: string | null;
  /** `YYYY-MM-DD` — faqat qamrovni sanash uchun. */
  date: string;
  state: DailyKpiState;
  /** Qabulda MUZLATILGAN kunlik ball. NULL = kun ballanmagan. */
  scorePercent: number | null;
}

export type RatingSkipReason =
  /** Davrda umuman qabul qilingan kuni yo'q. */
  | 'no_accepted_days'
  /** Qabul qilingan kunlari bor, lekin hech biri ballanmagan. */
  | 'no_score';

export interface RatingEntry {
  /** 1 dan boshlanadigan o'rin. NULL = ballanmagan (o'rin berilmaydi). */
  rank: number | null;
  employeeId: string;
  employeeName: string | null;
  /** Qabul qilingan kunlar ballining o'rtachasi. NULL = ball yo'q. */
  averageScore: number | null;
  /** Reytingga kirgan kunlar soni. */
  daysCounted: number;
  /** Davrda shu xodim uchun ko'rilgan HAMMA kun (holatidan qat'i nazar). */
  daysInPeriod: number;
  /** Qabul qilingan, lekin balli NULL bo'lgan kunlar. */
  daysWithoutScore: number;
  rated: boolean;
  skipReason: RatingSkipReason | null;
}

export interface Rating {
  entries: RatingEntry[];
  ratedCount: number;
  unratedCount: number;
}

interface Bucket {
  employeeId: string;
  employeeName: string | null;
  daysInPeriod: number;
  acceptedDays: number;
  daysWithoutScore: number;
  scoreSum: number;
  daysCounted: number;
}

export function rankEmployees(days: readonly RatingDay[]): Rating {
  const buckets = new Map<string, Bucket>();

  for (const d of days) {
    let b = buckets.get(d.employeeId);
    if (!b) {
      b = {
        employeeId: d.employeeId,
        employeeName: d.employeeName,
        daysInPeriod: 0,
        acceptedDays: 0,
        daysWithoutScore: 0,
        scoreSum: 0,
        daysCounted: 0,
      };
      buckets.set(d.employeeId, b);
    }
    // Nom bir marta olinadi; keyingi kunlarda bo'sh kelsa eskisi saqlanadi.
    b.employeeName ??= d.employeeName;
    b.daysInPeriod += 1;

    if (!countsTowardPayroll(d.state)) continue;
    b.acceptedDays += 1;

    // 🔴 NULL ≠ 0: ballanmagan kun o'rtachani pasaytirmaydi.
    if (d.scorePercent == null || !Number.isFinite(d.scorePercent)) {
      b.daysWithoutScore += 1;
      continue;
    }
    b.scoreSum += d.scorePercent;
    b.daysCounted += 1;
  }

  const entries: RatingEntry[] = [...buckets.values()].map((b) => {
    const rated = b.daysCounted > 0;
    return {
      rank: null,
      employeeId: b.employeeId,
      employeeName: b.employeeName,
      averageScore: rated ? round1(b.scoreSum / b.daysCounted) : null,
      daysCounted: b.daysCounted,
      daysInPeriod: b.daysInPeriod,
      daysWithoutScore: b.daysWithoutScore,
      rated,
      skipReason: rated ? null : b.acceptedDays > 0 ? 'no_score' : 'no_accepted_days',
    };
  });

  entries.sort(compareEntries);
  assignRanks(entries);

  return {
    entries,
    ratedCount: entries.filter((e) => e.rated).length,
    unratedCount: entries.filter((e) => !e.rated).length,
  };
}

/**
 * Tartib: ballanganlar oldinda → yuqori o'rtacha → ko'proq kun → `id`.
 *
 * «Ko'proq kun» ataylab: teng o'rtachada uzoqroq kuzatilgan natija ishonchliroq.
 * Oxirgi mezon `id` — nom EMAS (lokal saralashi barqaror emas).
 */
function compareEntries(a: RatingEntry, b: RatingEntry): number {
  if (a.rated !== b.rated) return a.rated ? -1 : 1;
  if (a.rated && b.rated) {
    const byScore = (b.averageScore ?? 0) - (a.averageScore ?? 0);
    if (byScore !== 0) return byScore;
    const byDays = b.daysCounted - a.daysCounted;
    if (byDays !== 0) return byDays;
  }
  return a.employeeId < b.employeeId ? -1 : a.employeeId > b.employeeId ? 1 : 0;
}

/**
 * Sport tartibi: to'liq teng natija BIR XIL o'rin oladi, keyingi o'rin
 * sakraydi (1, 1, 3). Tenglik faqat (o'rtacha, kunlar soni) bo'yicha —
 * `id` tie-break o'rinni AJRATMAYDI, u shunchaki chiqish tartibini qat'iy
 * qiladi.
 */
function assignRanks(entries: RatingEntry[]): void {
  let position = 0;
  let prev: RatingEntry | null = null;

  for (const e of entries) {
    if (!e.rated) {
      e.rank = null;
      continue;
    }
    position += 1;
    const tied =
      prev != null && prev.averageScore === e.averageScore && prev.daysCounted === e.daysCounted;
    e.rank = tied ? (prev?.rank ?? position) : position;
    prev = e;
  }
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
