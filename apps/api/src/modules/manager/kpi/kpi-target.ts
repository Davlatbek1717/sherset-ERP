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
 * xodim  >  bo'lim  >  lavozim  >  hisob  >  profil maqsadi  >  maqsad YO'Q
 * ```
 * (`bo'lim` — MK22 kaskadining o'rta pog'onasi; sabab `SCOPE_RANK` izohida.)
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

/**
 * Davr lug'ati — §2.5. **YAGONA manba**: `employee_kpi_targets.period` CHECK'i
 * ham aynan shu uchtani qabul qiladi. Ikkinchi lug'at ochilsa birlik/davr
 * so'zlari ikki joyda ikki xil bo'lib ketardi (xotira:
 * `manager-kpi-unit-vocabularies`).
 */
export const TARGET_PERIOD = {
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
} as const;

export type TargetPeriod = (typeof TARGET_PERIOD)[keyof typeof TARGET_PERIOD];

export const TARGET_SCOPE = {
  /** Bitta xodimga qo'yilgan reja — eng aniq. */
  employee: 'employee',
  /** Bo'lim (`HrDepartment`) bo'yicha — MK22 kaskadining o'rta pog'onasi. */
  department: 'department',
  /** Lavozim bo'yicha. */
  position: 'position',
  /** Butun hisob bo'yicha. */
  account: 'account',
} as const;

export type TargetScope = (typeof TARGET_SCOPE)[keyof typeof TARGET_SCOPE];

/**
 * Aniqlik darajasi — kattasi g'olib.
 *
 * **Nega bo'lim lavozimdan yuqori (MK22):** bo'lim maqsadi — egadan pastga
 * TAQSIMLANGAN majburiyat (kaskadning bo'g'ini), lavozim maqsadi esa rolga
 * qo'yilgan umumiy sukut. Taqsimlangan majburiyat sukutni yengmasa, kaskad
 * o'z ta'sirini yo'qotadi. MK13'dagi mavjud nisbatlar (xodim eng yuqori,
 * hisob eng past) o'zgarmaydi — bo'lim ular ORASIGA qo'shildi.
 */
const SCOPE_RANK: Readonly<Record<TargetScope, number>> = {
  [TARGET_SCOPE.employee]: 4,
  [TARGET_SCOPE.department]: 3,
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
  /**
   * `employee` → employeeId · `department` → departmentId (`HrDepartment`) ·
   * `position` → positionId · `account` → accountId.
   */
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
  /**
   * `Employee.departmentId` (`HrDepartment`). Bo'limi yo'q xodim uchun `null` —
   * bo'lim qatorlari unga tushmaydi. Ataylab MAJBURIY maydon: ixtiyoriy bo'lsa
   * chaqiruvchi uni jimgina tushirib qoldirib, bo'lim maqsadini ko'rinmas
   * qilardi.
   */
  departmentId: string | null;
}

/**
 * Maqsad qaysi pog'onadan keldi. Tartib — ustuvorlik tartibi:
 * `employee_target` (KPI-01 biriktirilgan KPI) > `target_override` (MK13
 * `KpiTarget`) > `profile` > `none`.
 *
 * Bu qiymat `EmployeeDailyKpiMetric.targetSource` ga MUHRLANADI — ekranda
 * «nega bu raqam», o'quvchida esa «muhr bormi» savoliga javob beradi.
 */
export type TargetSource = 'employee_target' | 'target_override' | 'profile' | 'none';

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
  if (row.scope === TARGET_SCOPE.department) {
    return subject.departmentId != null && row.scopeRef === subject.departmentId;
  }
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
 *   1. **qamrov aniqligi** — xodim > bo'lim > lavozim > hisob;
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
  const eligible = rows.filter((r) => isTargetRowActive(r, date, period) && appliesTo(r, subject));

  const best = new Map<string, KpiTargetRow>();
  for (const row of eligible) {
    const current = best.get(row.metricKey);
    if (current == null || targetRowBeats(row, current)) best.set(row.metricKey, row);
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

/**
 * Qator shu kun va davr uchun UMUMAN amal qiladimi (qamrovdan qat'i nazar).
 *
 * Subyektga bog'liq emas — shuning uchun MK22 kaskadi ham ayni shu shartni
 * ishlatadi: kaskad qatorlarni qamrov bo'yicha emas, `scopeRef` bo'yicha
 * yig'adi, lekin «amal qiladimi» savolining javobi BITTA bo'lishi shart.
 */
export function isTargetRowActive(row: KpiTargetRow, date: string, period: TargetPeriod): boolean {
  return (
    !row.archived &&
    row.period === period &&
    row.effectiveFrom <= date &&
    (row.effectiveTo == null || date <= row.effectiveTo) &&
    // Haftalik maqsad kun maskasiga bog'lanmaydi — u hafta uchun.
    (period !== TARGET_PERIOD.daily || (row.weekdayMask & weekdayBit(date)) !== 0)
  );
}

/**
 * Ikki amaldagi qatordan qaysi biri g'olib (yuqoridagi tartib bo'yicha).
 *
 * Eksport qilingan — MK22 kaskadi bir `scopeRef` uchun bir nechta qator
 * uchraganda AYNI tanlovni qiladi. Nusxa-ko'chirilsa bir shox yo'qolardi
 * (xotira: `copy-paste-loses-a-branch`).
 */
export function targetRowBeats(candidate: KpiTargetRow, current: KpiTargetRow): boolean {
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

// ─────────────────────────────────────────────────────────────────────────────
// KPI-01 qatlami — «biriktirilgan KPI» (`EmployeeKpiTarget`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `EmployeeKpiTarget` qatorining shu modulga keraklik qismi (KPI-03 ko'prigi).
 *
 * **Nega alohida tur:** bu qatlam VERSIYALANMAYDI — unda `effectiveFrom/To`
 * ham, kun maskasi ham yo'q. Tarix butunligi qatorning oynasi bilan emas,
 * `EmployeeDailyKpiMetric` dagi KUN MUHRI bilan ta'minlanadi (§2.3 →
 * per-kun snapshot). Shuning uchun uni `KpiTargetRow` ga «siqib» kiritish
 * soxta maydonlar (`effectiveFrom: '1970-01-01'`, `weekdayMask: 127`) yozishni
 * talab qilardi va ular bir kun kelib haqiqiy qoida deb o'qilardi.
 */
export interface EmployeeTargetRow {
  id: string;
  employeeId: string;
  /** `kpi_metric_defs.key` — built-in YOKI hisobning o'z (qo'lda) kaliti. */
  metricKey: string;
  period: TargetPeriod;
  /** Ko'rsatkichning O'Z birligida. **NULL = RAQAMSIZ «todo»**, 0 EMAS. */
  targetValue: bigint | null;
  /**
   * Kompozit balldagi og'irligi (foiz). **NULL = og'irlik QO'YILMAGAN** —
   * KPI ataylab ballanmaydi, faqat kuzatiladi (KPI-05). `0` esa og'irlik
   * qo'yilgan-u nol: ballash uchun bir xil, ekranda farqli.
   */
  weight: number | null;
  /**
   * `manualDoneAt` ning MAHALLIY KUN YORLIG'I (`YYYY-MM-DD`), NULL =
   * belgilanmagan. Instant EMAS: bu modul tz'siz, taqqoslash yorliq ustidan
   * (xotira: `month-bounds-label-vs-instant`).
   */
  manualDoneDate: string | null;
  /** `false` = arxiv: tarixda qoladi, yangi kunlarga ta'sir qilmaydi. */
  active: boolean;
}

/**
 * Raqamsiz («todo») maqsadning shartli birligi: bajarildi = 1, aks holda 0.
 *
 * NEGA KERAK: `kpi-score.ts` maqsadi NULL ko'rsatkichni `no_target` deb ballab
 * o'tkazib yuboradi. Ya'ni birliksiz «bajarildi» belgisi hech qachon ballga
 * aylanmasdi va menejer buni ekranda ham ko'rmasdi.
 */
export const MANUAL_DONE_UNIT = 1n;

/**
 * Shu xodim va davr uchun g'olib qatorlar (ko'rsatkich kaliti bo'yicha).
 *
 * **YAGONA tanlov nuqtasi** — maqsad ham, og'irlik ham AYNAN shu qatordan
 * o'qiladi. Ikki joyda takrorlansa bir kun kelib maqsad bir qatordan,
 * og'irlik boshqasidan olinib, ekrandagi raqam hech qaysi sozlamaga mos
 * kelmasdi (xotira: `copy-paste-loses-a-branch`).
 */
function pickEmployeeRows(
  rows: readonly EmployeeTargetRow[],
  employeeId: string,
  period: TargetPeriod,
): Map<string, EmployeeTargetRow> {
  const best = new Map<string, EmployeeTargetRow>();
  for (const row of rows) {
    if (!row.active || row.employeeId !== employeeId || row.period !== period) continue;
    const current = best.get(row.metricKey);
    if (current == null || row.id < current.id) best.set(row.metricKey, row);
  }
  return best;
}

/**
 * Biriktirilgan KPI qatorlaridan shu davr uchun amaldagi maqsadlar.
 *
 * Qamrov savoli yo'q — qator allaqachon BITTA xodimniki. Determinizm uchun
 * teng qatorlar orasidan `id` bo'yicha kichigi olinadi: bazada
 * `@@unique([employeeId, metricKey, period])` teng qatorni imkonsiz qiladi,
 * lekin sof funksiya kirish tartibiga bog'liq bo'lmasligi kerak.
 */
export function resolveEmployeeTargets(
  rows: readonly EmployeeTargetRow[],
  employeeId: string,
  period: TargetPeriod,
): Map<string, ResolvedTarget> {
  const best = pickEmployeeRows(rows, employeeId, period);

  const out = new Map<string, ResolvedTarget>();
  for (const [metricKey, row] of best) {
    out.set(metricKey, {
      metricKey,
      // NULL bu yerda «maqsad yo'q» EMAS — «raqamsiz maqsad». Qator MAVJUD,
      // shuning uchun u pastdagi pog'onalarni baribir to'sadi.
      value: row.targetValue,
      source: 'employee_target',
      rowId: row.id,
      scope: TARGET_SCOPE.employee,
    });
  }
  return out;
}

/**
 * Qo'lda (o'lchanmaydigan) ko'rsatkichning shu KUNDAGI fakti va maqsadi.
 *
 * Dvigatel bunday ko'rsatkichni hisoblay olmaydi — fakt yagona manbadan,
 * menejerning «bajarildi» belgisidan keladi (ikki manba = ikki haqiqat).
 * Belgi **kun yorlig'iga** taqqoslanadi: aks holda bugun bosilgan tugma butun
 * tarixni «bajarildi» qilib ko'rsatardi.
 *
 * Fakt = maqsad (bajarish 100%) yoki 0 (0%). Oraliq qiymat yo'q — «yarim
 * bajarildi» degan ma'lumot manbada umuman mavjud emas.
 */
export function manualDailyOutcome(
  row: EmployeeTargetRow,
  date: string,
): { fact: bigint; target: bigint } {
  const target = row.targetValue ?? MANUAL_DONE_UNIT;
  return { fact: row.manualDoneDate === date ? target : 0n, target };
}

/**
 * Og'irlik qaysi pog'onadan keldi. `EmployeeDailyKpiMetric.weightSource` ga
 * MUHRLANADI — «muhr bormi» savoliga javob shu ustunda (KPI-05).
 */
export type WeightSource = 'employee_target' | 'profile' | 'none';

export interface ResolvedWeight {
  metricKey: string;
  /** Foiz. **NULL = og'irlik qo'yilmagan** — ballanmaydi, faqat kuzatiladi. */
  value: number | null;
  source: WeightSource;
}

/**
 * Kunlik ball uchun og'irliklar — biriktirilgan KPI > profil versiyasi.
 *
 * 🔴 **Biriktirilgan qator og'irligi NULL bo'lsa ham USTUN turadi.** Qator
 * MAVJUD, ya'ni menejer shu ko'rsatkichni ataylab ballsiz qo'ygan; profildagi
 * eski og'irlik uni jimgina qaytarib ballasa, «og'irlik ixtiyoriy» va'dasi
 * buzilardi. Aynan shu qoida maqsad tomonida ham amal qiladi
 * (`resolveEmployeeTargets` — raqamsiz «todo» pastdagi pog'onalarni to'sadi).
 *
 * Haftalik/oylik qator kunlik og'irlikka KIRMAYDI — §KPI-03.3 bilan bir xil:
 * u kunlik ballda umuman qatnashmaydi, demak og'irligi ham qatnashmaydi.
 *
 * Hech bir pog'onada topilmagan ko'rsatkich MAP'GA TUSHMAYDI — chaqiruvchi uni
 * `none` deb muhrlaydi (bo'sh qoldirilmaydi).
 */
export function resolveDailyWeights(
  employeeTargets: readonly EmployeeTargetRow[],
  employeeId: string,
  profileWeights: ReadonlyMap<string, number>,
): Map<string, ResolvedWeight> {
  const out = new Map<string, ResolvedWeight>();
  for (const [metricKey, row] of pickEmployeeRows(
    employeeTargets,
    employeeId,
    TARGET_PERIOD.daily,
  )) {
    out.set(metricKey, { metricKey, value: row.weight, source: 'employee_target' });
  }

  for (const [metricKey, value] of profileWeights) {
    if (out.has(metricKey)) continue;
    out.set(metricKey, { metricKey, value, source: 'profile' });
  }

  return out;
}

/**
 * Kunlik ball uchun yakuniy maqsadlar — uch pog'ona bitta joyda.
 *
 * `employeeTargets` (KPI-01 biriktirilgan KPI) > `rows` (MK13 `KpiTarget`
 * ustamasi) > `profileTargets` (`KpiProfileMetric.target`). Hech birida
 * bo'lmasa `value: null` (**`source: 'none'`**) — bu «maqsad 0» EMAS va ballga
 * kirmaydi (`kpi-score.ts` `skipReason: 'no_target'` beradi).
 *
 * `employeeTargets` ATAYLAB ixtiyoriy: mavjud chaqiruvchilar (MK22 kaskadi,
 * testlar) shartnomani o'zgartirmasdan ishlashda davom etadi.
 */
export function resolveDailyTargets(
  rows: readonly KpiTargetRow[],
  subject: TargetSubject,
  date: string,
  profileTargets: ReadonlyMap<string, bigint | null>,
  employeeTargets: readonly EmployeeTargetRow[] = [],
): Map<string, ResolvedTarget> {
  const out = resolveEmployeeTargets(employeeTargets, subject.employeeId, TARGET_PERIOD.daily);

  for (const [metricKey, resolved] of resolveTargets(rows, subject, date, TARGET_PERIOD.daily)) {
    if (!out.has(metricKey)) out.set(metricKey, resolved);
  }

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
