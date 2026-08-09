/**
 * MK13 / 4M TZ §2.5, §11 — KPI MAQSAD qatlami (`KpiTarget`).
 *
 * ## Nega alohida qatlam
 * Maqsad hozirgacha faqat `KpiProfileMetric.target` da edi — ya'ni **lavozim
 * profilining versiyasi** ichida. Undan bitta xodimga boshqa reja qo'yish
 * uchun butun profilni versiyalash kerak bo'lardi va o'sha xodimning kunlari
 * boshqa profilga o'tib ketardi. §2.5 esa maqsad **kun turiga** ham bog'liq
 * bo'lishini talab qiladi (dam olish/bayram).
 *
 * Shuning uchun maqsad **ustama qatlam**: profil maqsadi baza, `KpiTarget`
 * uni aniqroq qamrovda almashtiradi.
 *
 * ```
 * xodim maqsadi  >  lavozim maqsadi  >  hisob maqsadi  >  profil maqsadi  >  maqsad YO'Q
 * ```
 *
 * ## 🔴 Haftalik maqsad kunga JIMGINA bo'linmaydi
 * `period='weekly'` qator kunlik ballga **kirmaydi**. Haftalikni kunga
 * aylantirish uchun «shu haftada necha ish kuni» kerak — u dam olish, ta'til
 * va yarim stavkaga bog'liq, ya'ni bo'lish JIM TAXMIN bo'lardi. Taqsimlash —
 * **MK22 (maqsad kaskadi)** ishi; bu yerda maqsad faqat SAQLANADI va haftalik
 * so'rovda qaytadi.
 *
 * ## Sana — YORLIQ, instant emas
 * Hamma taqqoslash `YYYY-MM-DD` **satri** ustidan (leksikografik = xronologik).
 * Timezone'ga umuman tegilmaydi: `monthBounds` hodisasida (xotira
 * `month-bounds-label-vs-instant`) yorliqni instantga aylantirish kunni bir
 * kunga surib yuborgan edi.
 *
 * ## Sof modul
 * DB yo'q, soat yo'q, `Date.now()` yo'q — qatorlar kiradi, hal qilingan maqsad
 * chiqadi.
 */

export const TARGET_PERIOD = {
  daily: 'daily',
  weekly: 'weekly',
} as const;

export type TargetPeriod = (typeof TARGET_PERIOD)[keyof typeof TARGET_PERIOD];

export const TARGET_SCOPE = {
  /** Bitta xodimga qo'yilgan reja — eng aniq. */
  employee: 'employee',
  /** Lavozim bo'yicha. */
  position: 'position',
  /** Butun hisob bo'yicha. */
  account: 'account',
} as const;

export type TargetScope = (typeof TARGET_SCOPE)[keyof typeof TARGET_SCOPE];

/** Aniqlik darajasi — kattasi g'olib. */
const SCOPE_RANK: Readonly<Record<TargetScope, number>> = {
  [TARGET_SCOPE.employee]: 3,
  [TARGET_SCOPE.position]: 2,
  [TARGET_SCOPE.account]: 1,
};

/** Hamma kunlar yoqilgan maska (Du…Ya). */
export const ALL_WEEKDAYS = 127;

export interface KpiTargetRow {
  id: string;
  /** `kpi_metric_defs.key` — kod katalogidagi kalit. */
  metricKey: string;
  scope: TargetScope;
  /** `employee` → employeeId · `position` → positionId · `account` → accountId. */
  scopeRef: string;
  period: TargetPeriod;
  /** Ko'rsatkichning O'Z birligida, butun son (pul = tiyin). */
  targetValue: bigint;
  /** `YYYY-MM-DD` — shu kundan boshlab (YOPIQ chegara). */
  effectiveFrom: string;
  /** `YYYY-MM-DD` — shu kungacha (YOPIQ). NULL = muddatsiz. */
  effectiveTo: string | null;
  /** Bitmaska: 1=Du, 2=Se, 4=Cho, 8=Pa, 16=Ju, 32=Sha, 64=Ya. */
  weekdayMask: number;
  archived: boolean;
}

export interface TargetSubject {
  accountId: string;
  employeeId: string;
  /** Lavozimi yo'q xodim uchun `null` — lavozim qatorlari unga tushmaydi. */
  positionId: string | null;
}

export type TargetSource = 'target_override' | 'profile' | 'none';

export interface ResolvedTarget {
  metricKey: string;
  /** NULL = maqsad yo'q. **0 EMAS** — maqsadsiz ko'rsatkich ballanmaydi. */
  value: bigint | null;
  source: TargetSource;
  /** Qaysi `KpiTarget` qatori g'olib bo'ldi (ekranda «nega bu raqam»). */
  rowId: string | null;
  scope: TargetScope | null;
}

/**
 * Sana yorlig'idan hafta kuni bitini beradi (Du=1 … Ya=64).
 *
 * `Date.UTC` FAQAT yorliqni kunga aylantirish uchun — mahalliy vaqt ham,
 * joriy soat ham ishlatilmaydi, shuning uchun natija tz'dan mustaqil.
 */
export function weekdayBit(date: string): number {
  const parts = date.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    // Buzuq yorliq — hech bir maskaga tushmasin (jimgina «har kuni» BO'LMASIN).
    return 0;
  }
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Yak
  // 0(Yak) → 64; 1(Du) → 1; … 6(Sha) → 32
  return day === 0 ? 64 : 1 << (day - 1);
}

/** Maskadagi yoqilgan kunlar soni — TOR maska aniqroq hisoblanadi. */
function maskWidth(mask: number): number {
  let n = mask & ALL_WEEKDAYS;
  let count = 0;
  while (n) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

function appliesTo(row: KpiTargetRow, subject: TargetSubject): boolean {
  if (row.scope === TARGET_SCOPE.employee) return row.scopeRef === subject.employeeId;
  if (row.scope === TARGET_SCOPE.position) {
    return subject.positionId != null && row.scopeRef === subject.positionId;
  }
  return row.scopeRef === subject.accountId;
}

/**
 * Berilgan kun va davr uchun amaldagi maqsadlar (ko'rsatkich kaliti bo'yicha).
 *
 * Faqat `KpiTarget` qatorlari ko'riladi — profil maqsadi bilan birlashtirish
 * `resolveDailyTargets()` da.
 *
 * G'olibni tanlash tartibi (birinchi farq qilgani hal qiladi):
 *   1. **qamrov aniqligi** — xodim > lavozim > hisob;
 *   2. **maska torligi** — «faqat shanba» qoidasi «har kuni» qoidasini yengadi
 *      (§2.5: kun turi target'ga ta'sir qiladi);
 *   3. **keyingi `effectiveFrom`** — yangi qaror eskisini almashtiradi;
 *   4. **`id` o'sish tartibi** — hammasi teng bo'lsa ham natija BARQAROR
 *      (kirish tartibi javobni o'zgartirmasligi kerak).
 */
export function resolveTargets(
  rows: readonly KpiTargetRow[],
  subject: TargetSubject,
  date: string,
  period: TargetPeriod,
): Map<string, ResolvedTarget> {
  const bit = weekdayBit(date);

  const eligible = rows.filter(
    (r) =>
      !r.archived &&
      r.period === period &&
      appliesTo(r, subject) &&
      r.effectiveFrom <= date &&
      (r.effectiveTo == null || date <= r.effectiveTo) &&
      // Haftalik maqsad kun maskasiga bog'lanmaydi — u hafta uchun.
      (period !== TARGET_PERIOD.daily || (r.weekdayMask & bit) !== 0),
  );

  const best = new Map<string, KpiTargetRow>();
  for (const row of eligible) {
    const current = best.get(row.metricKey);
    if (current == null || beats(row, current)) best.set(row.metricKey, row);
  }

  const out = new Map<string, ResolvedTarget>();
  for (const [metricKey, row] of best) {
    out.set(metricKey, {
      metricKey,
      value: row.targetValue,
      source: 'target_override',
      rowId: row.id,
      scope: row.scope,
    });
  }
  return out;
}

function beats(candidate: KpiTargetRow, current: KpiTargetRow): boolean {
  const byScope = SCOPE_RANK[candidate.scope] - SCOPE_RANK[current.scope];
  if (byScope !== 0) return byScope > 0;

  // Tor maska = aniqroq qoida.
  const byMask = maskWidth(current.weekdayMask) - maskWidth(candidate.weekdayMask);
  if (byMask !== 0) return byMask > 0;

  if (candidate.effectiveFrom !== current.effectiveFrom) {
    return candidate.effectiveFrom > current.effectiveFrom;
  }
  return candidate.id < current.id;
}

/**
 * Kunlik ball uchun yakuniy maqsadlar: `KpiTarget` ustamasi + profil maqsadi.
 *
 * `profileTargets` — `KpiProfileMetric.target` (ko'rsatkich kaliti → maqsad).
 * Ustama qator bo'lmasa profil qiymati olinadi; ikkalasi ham bo'lmasa
 * `value: null` (**`source: 'none'`**) — bu «maqsad 0» EMAS va ballga
 * kirmaydi (`kpi-score.ts` `skipReason: 'no_target'` beradi).
 */
export function resolveDailyTargets(
  rows: readonly KpiTargetRow[],
  subject: TargetSubject,
  date: string,
  profileTargets: ReadonlyMap<string, bigint | null>,
): Map<string, ResolvedTarget> {
  const overrides = resolveTargets(rows, subject, date, TARGET_PERIOD.daily);
  const out = new Map<string, ResolvedTarget>(overrides);

  for (const [metricKey, value] of profileTargets) {
    if (out.has(metricKey)) continue;
    out.set(metricKey, {
      metricKey,
      value,
      source: value == null ? 'none' : 'profile',
      rowId: null,
      scope: null,
    });
  }

  return out;
}
