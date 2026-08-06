/**
 * Egaga haftalik xulosa — «menejerni kim nazorat qiladi» (menejer KPI TZ M-Q7, §7).
 *
 * MODEL. Menejerga katta erkinlik berilgan: u har kunni qo'lda ko'radi, raqamni
 * tuzatishi, kunni majburan yopishi mumkin. Erkinlikning juftligi — **o'lchov**:
 * har qabul, rad etish va **qo'lda tuzatma** hodisa jurnaliga tushadi, egasi esa
 * haftada bir marta xulosani oladi.
 *
 * ⚠️ **Bu xulosa hech narsani BLOKLAMAYDI** (§7): u faqat ko'rinadi. Bloklovchi
 * qilish menejerni ishlay olmas holga solardi — model «ishonch + keyingi
 * nazorat», «har qadamda ruxsat» emas.
 *
 * Sof modul: agregatsiya shakli va matn qurish DB'siz sinaladi.
 */

/** Bitta menejerning hafta davomidagi faoliyati. */
export interface ManagerActivity {
  managerId: string | null;
  managerName: string | null;
  acceptedCount: number;
  rejectedCount: number;
  /** Qo'lda tuzatmalar soni — M-Q7 ning asosiy raqami. */
  adjustCount: number;
  /** Tuzatmalarning JAMI ABSOLYUT summasi (tiyin). */
  adjustedAbsMinor: bigint;
  /**
   * Bazasiz tuzatmalar soni — menejer raqamni TUZATMAGAN, YO'QDAN KIRITGAN.
   * Alohida sanaladi: «500 000 ni 440 000 ga tuzatdi» bilan «hech narsa
   * yo'q edi, 500 000 yozdi» — nazorat nuqtai nazaridan boshqa-boshqa ish.
   */
  noBaselineCount: number;
  /** Majburiy yopilgan kunlar — alohida, chunki bu eng kuchli amal. */
  forceAcceptedCount: number;
}

export interface WeeklySummaryInput {
  weekStart: Date;
  weekEndExclusive: Date;
  activity: ReadonlyArray<ManagerActivity>;
  /** Hafta oxirida hali qabul kutayotgan kunlar. */
  pendingDays: number;
  /** Eskirgan (manba o'zgargani uchun qaytgan) kunlar. */
  staleDays: number;
}

export interface WeeklySummary extends WeeklySummaryInput {
  totalAccepted: number;
  totalAdjust: number;
  totalAdjustedAbsMinor: bigint;
  totalForceAccepted: number;
  totalNoBaseline: number;
  /** Eng ko'p tuzatgan menejer — `null` bo'lsa tuzatma umuman bo'lmagan. */
  topAdjuster: ManagerActivity | null;
}

/**
 * Xulosa raqamlari.
 *
 * `topAdjuster` **tuzatma soni** bo'yicha, summa bo'yicha emas: bitta katta
 * to'g'ri tuzatma normal ish, o'nlab mayda tuzatma esa naqsh — egasi aynan
 * naqshni ko'rishi kerak.
 */
export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  let totalAccepted = 0;
  let totalAdjust = 0;
  let totalAdjustedAbsMinor = 0n;
  let totalForceAccepted = 0;
  let totalNoBaseline = 0;
  let topAdjuster: ManagerActivity | null = null;

  for (const a of input.activity) {
    totalAccepted += a.acceptedCount;
    totalAdjust += a.adjustCount;
    totalAdjustedAbsMinor += a.adjustedAbsMinor;
    totalForceAccepted += a.forceAcceptedCount;
    totalNoBaseline += a.noBaselineCount;
    if (a.adjustCount > 0 && (topAdjuster === null || a.adjustCount > topAdjuster.adjustCount)) {
      topAdjuster = a;
    }
  }

  return {
    ...input,
    totalAccepted,
    totalAdjust,
    totalAdjustedAbsMinor,
    totalForceAccepted,
    totalNoBaseline,
    topAdjuster,
  };
}

/** Pul matni: tiyin → «12 345,67». Faqat xabar uchun, hisob emas. */
function fmt(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(3, '0');
  const int = s.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '−' : ''}${int},${s.slice(-2)}`;
}

function dateLabel(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

/**
 * Egaga boradigan xabar matni.
 *
 * Tuzatma BO'LMAGAN hafta ham xabar oladi («tuzatma yo'q») — sukunatni
 * «hammasi joyida» deb o'qish xato bo'lardi: xabar kelmasa egasi tizim
 * ishlayaptimi yoki tuzatma yo'qmi ajrata olmasdi.
 */
export function formatWeeklySummary(s: WeeklySummary): string {
  const lines: string[] = [];
  lines.push(
    `📊 HAFTALIK XULOSA (${dateLabel(s.weekStart)}–${dateLabel(
      new Date(s.weekEndExclusive.getTime() - 86_400_000),
    )})`,
  );
  lines.push('');
  lines.push(`Qabul qilingan kunlar: ${s.totalAccepted}`);
  lines.push(`Qabul kutmoqda: ${s.pendingDays}`);
  if (s.staleDays > 0) lines.push(`Eskirgan (manba o'zgargan): ${s.staleDays}`);
  lines.push('');

  if (s.totalAdjust === 0) {
    // Sukunat emas, aniq javob: «tekshirdim, tuzatma yo'q».
    lines.push("Qo'lda tuzatma: YO'Q");
  } else {
    lines.push(`Qo'lda tuzatma: ${s.totalAdjust} ta · jami ${fmt(s.totalAdjustedAbsMinor)}`);
    if (s.totalNoBaseline > 0) {
      // «Yo'qdan kiritildi» — tuzatishdan boshqa ish, egasi buni ajratsin.
      lines.push(`  shundan yo'qdan kiritilgan: ${s.totalNoBaseline} ta`);
    }
    if (s.topAdjuster) {
      lines.push(`Eng ko'p: ${s.topAdjuster.managerName ?? '—'} — ${s.topAdjuster.adjustCount} ta`);
    }
  }

  if (s.totalForceAccepted > 0) {
    // Majburiy yopish — eng kuchli amal, shuning uchun alohida qatorda.
    lines.push(`Majburiy yopilgan: ${s.totalForceAccepted} ta`);
  }

  return lines.join('\n');
}

/**
 * Haftaning chegaralari — **dushanbadan** boshlab.
 *
 * `getDay()` yakshanbani 0 deb beradi; O'zbekistonda ish haftasi dushanbadan
 * boshlanadi, shuning uchun yakshanba OLDINGI haftaga tegishli.
 */
export function weekBounds(anyDayInWeek: Date): { start: Date; endExclusive: Date } {
  const d = new Date(anyDayInWeek.getFullYear(), anyDayInWeek.getMonth(), anyDayInWeek.getDate());
  const dow = d.getDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - backToMonday);
  const endExclusive = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, endExclusive };
}
