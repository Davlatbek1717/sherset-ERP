/**
 * MK22 / 4M TZ §8.1/9 — MAQSAD KASKADI (ega → bo'lim → xodim).
 *
 * ## Nega yangi model YO'Q
 * Maqsad allaqachon `KpiTargetRow` da saqlanadi (MK13): `scope` + `scopeRef`
 * bilan hisob/bo'lim/lavozim/xodim qamroviga qo'yiladi, `effectiveFrom/To`
 * bilan versiyalanadi. Kaskad — shu qatorlarning **ustidagi ko'rinish**:
 * «egadagi raqamdan qanchasi pastga taqsimlangan, qanchasi taqsimlanmay
 * qolgan». Uchinchi plan modeli ochilsa (`KpiTarget`, `SalesPlan` yonida)
 * darhol uchta haqiqat manbai bo'lardi va ular bir-biriga qarshi chiqardi.
 *
 * ## 🔴 Bosh qoida: taqsimlanmagan qoldiq JIM QOLMAYDI
 * Bu modulning butun mavjudlik sababi — «100% taqsimlandi» degan yolg'onni
 * imkonsiz qilish. Shuning uchun:
 *   - ota maqsadi qo'yilmagan bo'lsa qoldiq `null`, foiz `null` — **0 yoki
 *     100% EMAS** (mahrajsiz ulush null; xotira `data-quality-flag-layer`);
 *   - maqsadi qo'yilmagan bola 0 deb SANALMAYDI, `unsetChildRefs` ga tushadi;
 *   - bo'limga biriktirilmagan xodim `unassignedEmployeeRefs` da ko'rinadi;
 *   - kaskad o'qiga tushmagan qator (`position`) `outOfCascadeRowIds` da.
 *
 * ## Oshib ketish OGOHLANTIRADI, bloklamaydi
 * Xodim maqsadlari yig'indisi bo'lim maqsadidan oshsa `status: 'over'` va
 * `overAllocated > 0`, lekin `blocking: false`. Menejer ataylab «zapas»
 * qo'yishi mumkin (yig'indi 110%) — buni taqiqlash ish jarayonini to'xtatardi.
 *
 * ## Sof modul
 * DB yo'q, soat yo'q, `Date.now()` yo'q — qatorlar kiradi, hisobot chiqadi.
 * Ballga ta'sir qilmaydi: kunlik ball hamon `resolveDailyTargets()` dan.
 */

import {
  type KpiTargetRow,
  TARGET_SCOPE,
  type TargetPeriod,
  type TargetScope,
  isTargetRowActive,
  targetRowBeats,
} from './kpi-target.js';

/** Kaskadning o'qi — ega ⊇ bo'lim ⊇ xodim. `position` bu o'qda EMAS. */
export const CASCADE_SCOPES: readonly TargetScope[] = [
  TARGET_SCOPE.account,
  TARGET_SCOPE.department,
  TARGET_SCOPE.employee,
];

export const CASCADE_STATUS = {
  /** Yuqoridagi maqsad umuman qo'yilmagan — ulushni O'LCHAB BO'LMAYDI. */
  parent_not_set: 'parent_not_set',
  /** Bolalar yig'indisi otadan kam — taqsimlanmagan qoldiq bor. */
  under: 'under',
  /** Aynan teng. */
  exact: 'exact',
  /** Bolalar yig'indisi otadan ko'p — OGOHLANTIRISH (bloklamaydi). */
  over: 'over',
} as const;

export type CascadeStatus = (typeof CASCADE_STATUS)[keyof typeof CASCADE_STATUS];

export interface CascadeNode {
  /** `scopeRef` — hisob / bo'lim / xodim identifikatori. */
  ref: string;
  /** Maqsad qiymati ko'rsatkichning O'Z birligida. `null` = QO'YILMAGAN (0 emas). */
  value: bigint | null;
  /** Qaysi `KpiTargetRow` bergani — ekranda «bu raqam qayerdan». */
  rowId: string | null;
}

export interface CascadeLevel {
  parentRef: string;
  parentValue: bigint | null;
  parentRowId: string | null;
  /** Faqat maqsadi QO'YILGAN bolalar yig'indisi. */
  allocated: bigint;
  /**
   * `parentValue − allocated`, manfiy bo'lmaydi (oshgani `overAllocated` da).
   * `null` = ota maqsadi qo'yilmagan, ya'ni qoldiqni o'lchab bo'lmaydi.
   */
  unallocated: bigint | null;
  /** `allocated − parentValue`, faqat musbat. `0n` = oshmagan. */
  overAllocated: bigint;
  status: CascadeStatus;
  /** Maqsadi qo'yilmagan bolalar — 0 deb sanalmaydi, ochiq ko'rsatiladi. */
  unsetChildRefs: string[];
  /** Qoplangan ulush foizi. Ota yo'q yoki 0 bo'lsa `null` (mahrajsiz ulush yo'q). */
  allocatedPercent: number | null;
  /** Oshib ketish ish jarayonini TO'XTATMAYDI — bu bayroq shartnomani qulflaydi. */
  blocking: false;
  children: CascadeNode[];
}

/** Kaskad qurish uchun tashkiliy tuzilma (chaqiruvchi HR ma'lumotidan beradi). */
export interface CascadeOrg {
  accountId: string;
  departments: readonly { id: string; employeeIds: readonly string[] }[];
  /** Bo'limga biriktirilmagan xodimlar — kaskadga tushmaydi, lekin YO'QOLMAYDI. */
  unassignedEmployeeIds: readonly string[];
}

export interface CascadeQuery {
  metricKey: string;
  period: TargetPeriod;
  /** `YYYY-MM-DD` — kaskad shu kun holatiga ko'ra quriladi. */
  date: string;
}

export interface CascadeReport extends CascadeQuery {
  /** Ega → bo'limlar. */
  top: CascadeLevel;
  /** Har bo'lim → o'z xodimlari. */
  departments: CascadeLevel[];
  unassignedEmployeeRefs: readonly string[];
  /** Kaskad o'qiga tushmagan, lekin amaldagi qatorlar (masalan `position`). */
  outOfCascadeRowIds: readonly string[];
}

/**
 * Bitta pog'onani hisoblaydi: ota maqsadi va bolalar taqsimoti.
 *
 * Bolalar tartibi kiritilgan tartibda saqlanadi — hisobot barqaror bo'lsin.
 */
export function allocate(parent: CascadeNode, children: readonly CascadeNode[]): CascadeLevel {
  let allocated = 0n;
  const unsetChildRefs: string[] = [];
  for (const child of children) {
    if (child.value == null) unsetChildRefs.push(child.ref);
    else allocated += child.value;
  }

  const parentValue = parent.value;

  if (parentValue == null) {
    return {
      parentRef: parent.ref,
      parentValue: null,
      parentRowId: parent.rowId,
      allocated,
      unallocated: null,
      overAllocated: 0n,
      status: CASCADE_STATUS.parent_not_set,
      unsetChildRefs,
      allocatedPercent: null,
      blocking: false,
      children: [...children],
    };
  }

  const diff = parentValue - allocated;
  const status =
    diff > 0n ? CASCADE_STATUS.under : diff === 0n ? CASCADE_STATUS.exact : CASCADE_STATUS.over;

  return {
    parentRef: parent.ref,
    parentValue,
    parentRowId: parent.rowId,
    allocated,
    unallocated: diff > 0n ? diff : 0n,
    overAllocated: diff < 0n ? -diff : 0n,
    status,
    unsetChildRefs,
    // Maqsad 0 bo'lsa ulushning MAHRAJI yo'q — foiz o'ylab topilmaydi.
    allocatedPercent: parentValue === 0n ? null : percentOf(allocated, parentValue),
    blocking: false,
    children: [...children],
  };
}

/**
 * `allocated ÷ parent` foizi, 2 kasr xonagacha.
 *
 * `bigint` → `number` o'tishi ataylab BO'LISHDAN KEYIN emas, oldin: avval
 * 10 000 ga ko'paytirib butun songa bo'lamiz, keyingina `number` ga o'tamiz —
 * shunda pul kattaliklarida ham suzuvchi nuqta xatosi yig'ilmaydi.
 */
function percentOf(part: bigint, whole: bigint): number {
  return Number((part * 10_000n) / whole) / 100;
}

/**
 * Amaldagi qatorlardan `scopeRef` → g'olib qator xaritasini quradi.
 *
 * Bir `scopeRef` uchun bir nechta amaldagi qator bo'lishi mumkin (turli maska
 * yoki `effectiveFrom`) — tanlov MK13'ning `targetRowBeats()` i bilan, ya'ni
 * kaskad va kunlik ball AYNI qatorni g'olib deb biladi.
 */
function winnersByRef(
  rows: readonly KpiTargetRow[],
  scope: TargetScope,
): Map<string, KpiTargetRow> {
  const best = new Map<string, KpiTargetRow>();
  for (const row of rows) {
    if (row.scope !== scope) continue;
    const current = best.get(row.scopeRef);
    if (current == null || targetRowBeats(row, current)) best.set(row.scopeRef, row);
  }
  return best;
}

function node(ref: string, row: KpiTargetRow | undefined): CascadeNode {
  // Qator yo'q = maqsad QO'YILMAGAN. `0n` qaytarish bu yerda eng xavfli xato
  // bo'lardi: «bo'lim 0 reja bajardi» «bo'limga reja qo'yilmagan» dan butunlay
  // boshqa gap.
  return row == null
    ? { ref, value: null, rowId: null }
    : { ref, value: row.targetValue, rowId: row.id };
}

/** Ega → bo'lim → xodim kaskadini bitta ko'rsatkich va bitta kun uchun quradi. */
export function buildCascade(
  rows: readonly KpiTargetRow[],
  org: CascadeOrg,
  query: CascadeQuery,
): CascadeReport {
  const active = rows.filter(
    (r) => r.metricKey === query.metricKey && isTargetRowActive(r, query.date, query.period),
  );

  const accounts = winnersByRef(active, TARGET_SCOPE.account);
  const departments = winnersByRef(active, TARGET_SCOPE.department);
  const employees = winnersByRef(active, TARGET_SCOPE.employee);

  const top = allocate(
    node(org.accountId, accounts.get(org.accountId)),
    org.departments.map((d) => node(d.id, departments.get(d.id))),
  );

  const perDepartment = org.departments.map((d) =>
    allocate(
      node(d.id, departments.get(d.id)),
      d.employeeIds.map((e) => node(e, employees.get(e))),
    ),
  );

  return {
    ...query,
    top,
    departments: perDepartment,
    unassignedEmployeeRefs: [...org.unassignedEmployeeIds],
    outOfCascadeRowIds: active
      .filter((r) => !CASCADE_SCOPES.includes(r.scope))
      .map((r) => r.id)
      .sort(),
  };
}

export interface CascadeChangePoint {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Shu kundan boshlab amal qila boshlagan qatorlar. */
  startedRowIds: string[];
  /** Shu kun — oxirgi amal kuni (`effectiveTo` YOPIQ chegara). */
  endedRowIds: string[];
}

/**
 * Kaskad o'zgargan sanalar — MAVJUD qatorlarning `effectiveFrom`/`effectiveTo`
 * chegaralaridan. Yangi «tarix jadvali» ochilmaydi: qatorlarning o'zi
 * versiyalangan, tarix ular ichida turibdi.
 *
 * Chegaralar qator YORLIG'I bilan qaytadi (kun qo'shish/ayirish YO'Q) — sana
 * arifmetikasi timezone bug-klassini ochadi (xotira `month-bounds-label-vs-instant`).
 * Arxivlangan qator tarixda ko'rinmaydi: arxivlash sanasi saqlanmaydi, ya'ni
 * uni tarixga qo'yish taxmin bo'lardi.
 */
export function cascadeChangePoints(
  rows: readonly KpiTargetRow[],
  query: { metricKey: string; period: TargetPeriod },
): CascadeChangePoint[] {
  const byDate = new Map<string, CascadeChangePoint>();
  const at = (date: string): CascadeChangePoint => {
    const existing = byDate.get(date);
    if (existing != null) return existing;
    const fresh: CascadeChangePoint = { date, startedRowIds: [], endedRowIds: [] };
    byDate.set(date, fresh);
    return fresh;
  };

  for (const row of rows) {
    if (row.archived) continue;
    if (row.metricKey !== query.metricKey || row.period !== query.period) continue;
    if (!CASCADE_SCOPES.includes(row.scope)) continue;
    at(row.effectiveFrom).startedRowIds.push(row.id);
    if (row.effectiveTo != null) at(row.effectiveTo).endedRowIds.push(row.id);
  }

  return [...byDate.values()]
    .map((p) => ({
      date: p.date,
      startedRowIds: [...p.startedRowIds].sort(),
      endedRowIds: [...p.endedRowIds].sort(),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Butun sonni teng bo'laklarga bo'ladi va QOLDIQNI OCHIQ qaytaradi.
 *
 * Bu — `kpi-target.ts` dagi «haftalik maqsad kunga JIMGINA bo'linmaydi»
 * qoidasining amaliy tomoni: bo'lish o'zi taqiqlanmagan, YASHIRIN bo'lish
 * taqiqlangan. Chaqiruvchi qoldiqni ko'radi va uni kimga berishni O'ZI hal
 * qiladi (yoki ekranda ko'rsatadi).
 *
 * `parts <= 0` → `null`: «necha ish kuni» noma'lum bo'lsa bo'lish natijasi
 * ham noma'lum, 0 emas.
 */
export function splitEvenly(
  total: bigint,
  parts: number,
): { each: bigint; remainder: bigint } | null {
  if (!Number.isInteger(parts) || parts <= 0) return null;
  const n = BigInt(parts);
  return { each: total / n, remainder: total % n };
}
