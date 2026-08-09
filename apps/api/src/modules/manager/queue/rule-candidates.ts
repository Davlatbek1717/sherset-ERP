/**
 * MK07 / 4M TZ §5.2 — 12 QOIDA TURINING NOMZOD QURUVCHILARI. Sof modul
 * (Prisma'siz): har biri **allaqachon o'qilgan** manba qatorlarini navbat
 * nomzodiga aylantiradi. Saqlash `work-queue-planner.ts` + servis ishi.
 *
 * MK06 ning ikki namunaviy quruvchisi (`PRICE_CHANGE`, `CASH_VARIANCE`)
 * `work-item-rules.ts` da qoldi — o'sha fazaning kodini ko'chirish MK07 ga
 * kirmaydi va diff'ni behuda kattalashtirardi. Registr esa BITTA joyda
 * (`MANAGER_RULES`), ya'ni «qoida bormi?» degan savolga bir manba javob beradi.
 *
 * ## Ikki oila: HODISA va HOLAT
 * `dedupKey` shakli qoidaning tabiatidan kelib chiqadi va bu farq **ataylab**:
 *
 *   - **Hodisa qoidasi** (`BELOW_COST`, `LATE`, `PICKING_SLA`, …) — kalitda
 *     manba yozuvning `id` si. Hodisa bir marta bo'lgan, bir marta ko'riladi.
 *   - **Holat qoidasi** (`BIG_DEBT`, `OVERDUE_DEBT`, `LOW_STOCK`, `DEAD_STOCK`)
 *     — kalitda obyekt + **OY** (`periodKey`). Holat davom etadi: menejer uni
 *     yopgach oy oxirigacha qaytmaydi, keyingi oyda esa yana ko'tariladi.
 *     Kalitga oy qo'shilmasa, holat bir marta ko'rilib **abadiy** jim bo'lardi;
 *     har `sync` da yangilansa — navbat bir xil qator bilan ko'milardi.
 *
 * `periodKey` bu yerda HISOBLANMAYDI: uni chaqiruvchi Toshkent kalendari
 * bo'yicha beradi (UTC yarim tunidan hisoblangan oy yorlig'i 5 soatga
 * adashardi — `month-bounds-label-vs-instant` sabog'i).
 *
 * ## O'lchanmagan ≠ 0
 * Pul o'lchanmagan bo'lsa `amountMinor: null` — hech qachon `0n`. Element esa
 * JIM TASHLANMAYDI: hodisa bo'lgan, faqat narxi noma'lum. Yagona istisno
 * `DEAD_STOCK` ning `no_history` qatori — pastdagi izohga qara.
 */

import { computeLineCost, parseDecimalScaled } from '../../shared/decimal.js';
import type { StockSignalRow } from '../inventory/stock-signals.js';
import type { ManagerRuleType, ResolvedRule, WorkItemCandidate } from './work-item-rules.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ── Payload o'quvchilari ────────────────────────────────────────────────────
//
// `CashierAuditEvent.payload` — `Json`. Undan tip kafolati YO'Q, shuning uchun
// har o'qish shu ikki yordamchidan o'tadi: noto'g'ri shakl `null` beradi va
// yuqorida «o'lchanmadi» bo'lib ko'rinadi, `NaN`/`0` bo'lib emas.

function asRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

/** Tiyin satri → `bigint`. Noto'g'ri/yo'q qiymat — `null` (0 EMAS). */
function minorOf(payload: Record<string, unknown>, key: string): bigint | null {
  const raw = payload[key];
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return BigInt(Math.trunc(raw));
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) return null;
  return BigInt(raw);
}

function numberOf(payload: Record<string, unknown>, key: string): number | null {
  const raw = payload[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function stringOf(payload: Record<string, unknown>, key: string): string | null {
  const raw = payload[key];
  return typeof raw === 'string' ? raw : null;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/** Chegara — tiyinda. `null` chegara = «har qanday» (0 kabi). */
function thresholdMinor(rule: ResolvedRule): bigint {
  return BigInt(Math.trunc(Math.abs(rule.threshold ?? 0)));
}

// ── Manba qator shakllari ───────────────────────────────────────────────────

/** `CashierAuditEvent` ning shu modulga keraklic qismi. */
export interface CashierAuditRow {
  id: string;
  employeeId: string;
  sessionId: string;
  type: string;
  docId: string | null;
  payload: unknown;
  createdAt: Date;
}

export interface DebtRow {
  id: string;
  name: string;
  counterpartyId: string;
  counterpartyName: string | null;
  totalMinor: bigint;
  paidMinor: bigint;
  currency: string;
  status: string;
  createdAt: Date;
  /** Mas'ul (call-markaz operatori). */
  ownerId: string | null;
  /** Qarzni bergan kassir — mas'ul yo'q bo'lsa javobgar shu. */
  issuedById: string | null;
}

export interface LateAttendanceRow {
  id: string;
  employeeId: string;
  employeeName: string | null;
  checkInTime: Date;
  lateMinutes: number;
}

/**
 * «Shu xodim shu kuni ishlashi kerak edimi» — jadval hukmi
 * (`resolveShift`, HR modulida testlangan) shu shaklga keltiriladi.
 * Jadvalni bu yerda QAYTA hisoblash ikkinchi haqiqat bo'lardi.
 */
export interface ExpectedWorkday {
  employeeId: string;
  employeeName: string | null;
  /** Toshkent kalendar sanasi, "yyyy-MM-dd". */
  localDate: string;
  isWorkday: boolean;
  /** O'sha mahalliy kunning boshlanish instanti — element vaqti. */
  dayStart: Date;
}

export interface PickingTaskRow {
  id: string;
  sourceName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: string;
  skladNo: number | null;
  createdAt: Date;
}

export interface InventoryVarianceRow {
  id: string;
  name: string;
  storeId: string;
  storeName: string | null;
  ownerId: string | null;
  occurredAt: Date;
  positions: ReadonlyArray<{ varianceQty: string; costMinor: bigint | null }>;
}

// ── 1–3. Zararga sotuv va chegirma (manba: CashierAuditEvent) ───────────────

/**
 * Uch quruvchining umumiy skeleti: hodisa turini filtrlaydi, pulni payload'dan
 * oladi, chegarani QO'LLAYDI — lekin faqat pul O'LCHANGAN bo'lsa.
 *
 * O'lchanmagan hodisani chegara bilan tashlab bo'lmaydi: taqqoslashga raqam
 * yo'q. Uni jim tashlash «zarar bo'lmagan» degan yolg'on bo'lardi, shuning
 * uchun element `amountMinor: null` bilan chiqadi va ekranda «summa
 * o'lchanmadi» deb ko'rinadi.
 */
function saleAuditCandidates(
  rows: ReadonlyArray<CashierAuditRow>,
  rule: ResolvedRule,
  spec: {
    eventType: string;
    ruleType: ManagerRuleType;
    dedupPrefix: string;
    amountKey: string;
    extraContext: (payload: Record<string, unknown>) => Record<string, unknown>;
  },
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limit = thresholdMinor(rule);

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    if (row.type !== spec.eventType) continue;

    const payload = asRecord(row.payload);
    const amount = minorOf(payload, spec.amountKey);
    if (amount != null && abs(amount) <= limit) continue;

    out.push({
      dedupKey: `${spec.dedupPrefix}:${row.id}`,
      ruleType: spec.ruleType,
      severity: rule.severity,
      subjectEmployeeId: row.employeeId,
      amountMinor: amount == null ? null : abs(amount),
      // Chek valyutasi audit payload'ida MUHRLANMAGAN — ekranda akkаuntning
      // asosiy valyutasi ko'rsatiladi (ochiq cheklov, hisobotda yozilgan).
      currency: null,
      docType: 'retailsale',
      docId: row.docId,
      occurredAt: row.createdAt,
      context: {
        sessionId: row.sessionId,
        productId: stringOf(payload, 'productId'),
        productName: stringOf(payload, 'productName'),
        quantity: stringOf(payload, 'quantity'),
        ...spec.extraContext(payload),
      },
    });
  }
  return out;
}

/** `SOLD_BELOW_COST` — «pul yo'qotildimi?» savoli (siyosat nazorati). */
export function buildBelowCostCandidates(
  rows: ReadonlyArray<CashierAuditRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  return saleAuditCandidates(rows, rule, {
    eventType: 'SOLD_BELOW_COST',
    ruleType: 'BELOW_COST',
    dedupPrefix: 'below_cost',
    amountKey: 'lossMinor',
    extraContext: (p) => ({ costMinor: stringOf(p, 'costMinor') }),
  });
}

/**
 * `PRICE_CHANGED` hodisasidan chegirmani ajratadi.
 *
 * Farqi yuqoridagi skeletdan: bu yerda chegara **foizda**, va hodisaning o'zi
 * «chegirma» degani EMAS — `PRICE_CHANGED` narx oshirilganda ham yoziladi.
 * Shuning uchun foiz noma'lum bo'lsa element YARATILMAYDI: hodisa turi zarar
 * haqida hech narsa da'vo qilmaydi (`BELOW_COST` dan farqli o'laroq).
 */
export function buildBigDiscountCandidates(
  rows: ReadonlyArray<CashierAuditRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limitPercent = rule.threshold ?? 0;

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    if (row.type !== 'PRICE_CHANGED') continue;

    const payload = asRecord(row.payload);
    const percent = numberOf(payload, 'discountPercent');
    // Manfiy foiz = narx OSHIRILGAN. Bu ham nazorat mavzusi, lekin boshqa
    // qoidaniki (`PRICE_CHANGE`) — chegirma qoidasiga aralashtirilmaydi.
    if (percent == null || percent <= limitPercent) continue;

    const diff = minorOf(payload, 'diffMinor');
    out.push({
      dedupKey: `big_discount:${row.id}`,
      ruleType: 'BIG_DISCOUNT',
      severity: rule.severity,
      subjectEmployeeId: row.employeeId,
      amountMinor: diff == null ? null : abs(diff),
      currency: null,
      docType: 'retailsale',
      docId: row.docId,
      occurredAt: row.createdAt,
      context: {
        sessionId: row.sessionId,
        productId: stringOf(payload, 'productId'),
        productName: stringOf(payload, 'productName'),
        discountPercent: percent,
        basePriceMinor: stringOf(payload, 'basePriceMinor'),
        thresholdPercent: limitPercent,
      },
    });
  }
  return out;
}

/** `SOLD_BELOW_WHOLESALE` — kelishilgan optom pol buzildi. */
export function buildBelowWholesaleCandidates(
  rows: ReadonlyArray<CashierAuditRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  return saleAuditCandidates(rows, rule, {
    eventType: 'SOLD_BELOW_WHOLESALE',
    ruleType: 'BELOW_WHOLESALE',
    dedupPrefix: 'below_wholesale',
    amountKey: 'belowByMinor',
    extraContext: (p) => ({ wholesaleMinor: stringOf(p, 'wholesaleMinor') }),
  });
}

// ── 4. Jadvaldan tashqari smena ────────────────────────────────────────────

/**
 * `SHIFT_OUT_OF_SCHEDULE` — chegarasiz qoida: smena jadvaldan tashqari
 * ochilgani hodisaning O'ZIDA turibdi. Sabab yuqori oqimda MAJBURIY, shuning
 * uchun u har doim kontekstda bo'ladi va menejer «nega» deb so'ramaydi.
 */
export function buildShiftOutOfScheduleCandidates(
  rows: ReadonlyArray<CashierAuditRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    if (row.type !== 'SHIFT_OUT_OF_SCHEDULE') continue;

    const payload = asRecord(row.payload);
    out.push({
      dedupKey: `shift_out_of_schedule:${row.id}`,
      ruleType: 'SHIFT_OUT_OF_SCHEDULE',
      severity: rule.severity,
      subjectEmployeeId: row.employeeId,
      // Vaqt hodisasi — pul o'lchovi yo'q (0 emas, YO'Q).
      amountMinor: null,
      currency: null,
      docType: 'cashiersession',
      docId: row.docId ?? row.sessionId,
      occurredAt: row.createdAt,
      context: {
        sessionId: row.sessionId,
        smenaName: stringOf(payload, 'smenaName'),
        reason: stringOf(payload, 'reason'),
      },
    });
  }
  return out;
}

// ── 5–6. Qarz ──────────────────────────────────────────────────────────────

/** Yopilmagan qoldiq. `paid` holati yoki nol qoldiq — qarz emas. */
function openRemainder(debt: DebtRow): bigint | null {
  if (debt.status === 'paid') return null;
  const remainder = debt.totalMinor - debt.paidMinor;
  return remainder > 0n ? remainder : null;
}

function debtSubject(debt: DebtRow): string | null {
  return debt.ownerId ?? debt.issuedById;
}

function debtContext(debt: DebtRow, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    debtName: debt.name,
    counterpartyId: debt.counterpartyId,
    counterpartyName: debt.counterpartyName,
    totalMinor: debt.totalMinor.toString(),
    paidMinor: debt.paidMinor.toString(),
    ...extra,
  };
}

/**
 * `BIG_DEBT` — qoldiq chegaradan katta. Jami emas, **QOLDIQ** solishtiriladi:
 * 6 mln qarzning 5.9 mlni to'langan bo'lsa, bu katta qarz emas.
 */
export function buildBigDebtCandidates(
  rows: ReadonlyArray<DebtRow>,
  rule: ResolvedRule,
  periodKey: string,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limit = thresholdMinor(rule);

  const out: WorkItemCandidate[] = [];
  for (const debt of rows) {
    const remainder = openRemainder(debt);
    if (remainder == null || remainder <= limit) continue;

    out.push({
      dedupKey: `big_debt:${debt.id}:${periodKey}`,
      ruleType: 'BIG_DEBT',
      severity: rule.severity,
      subjectEmployeeId: debtSubject(debt),
      amountMinor: remainder,
      currency: debt.currency,
      docType: 'debt',
      docId: debt.id,
      occurredAt: debt.createdAt,
      context: debtContext(debt, { thresholdMinor: limit.toString() }),
    });
  }
  return out;
}

/** `OVERDUE_DEBT` — qarz yozilganidan beri chegaradan ko'p kun o'tdi. */
export function buildOverdueDebtCandidates(
  rows: ReadonlyArray<DebtRow>,
  rule: ResolvedRule,
  now: Date,
  periodKey: string,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limitDays = Math.max(0, Math.trunc(rule.threshold ?? 0));

  const out: WorkItemCandidate[] = [];
  for (const debt of rows) {
    const remainder = openRemainder(debt);
    if (remainder == null) continue;

    const overdueDays = Math.floor((now.getTime() - debt.createdAt.getTime()) / DAY_MS);
    if (overdueDays <= limitDays) continue;

    out.push({
      dedupKey: `overdue_debt:${debt.id}:${periodKey}`,
      ruleType: 'OVERDUE_DEBT',
      severity: rule.severity,
      subjectEmployeeId: debtSubject(debt),
      amountMinor: remainder,
      currency: debt.currency,
      docType: 'debt',
      docId: debt.id,
      occurredAt: debt.createdAt,
      context: debtContext(debt, { overdueDays, thresholdDays: limitDays }),
    });
  }
  return out;
}

// ── 7–8. Davomat ───────────────────────────────────────────────────────────

/**
 * `LATE` — `HrAttendance.lateMinutes` **kelish paytida** yozilgan; bu yerda
 * qayta hisoblanmaydi (HR dvigateli yagona hukm manbai).
 */
export function buildLateCandidates(
  rows: ReadonlyArray<LateAttendanceRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limitMinutes = Math.max(0, Math.trunc(rule.threshold ?? 0));

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    if (row.lateMinutes <= limitMinutes) continue;

    out.push({
      dedupKey: `late:${row.id}`,
      ruleType: 'LATE',
      severity: rule.severity,
      subjectEmployeeId: row.employeeId,
      amountMinor: null,
      currency: null,
      docType: 'hrattendance',
      docId: row.id,
      occurredAt: row.checkInTime,
      context: {
        employeeName: row.employeeName,
        lateMinutes: row.lateMinutes,
        thresholdMinutes: limitMinutes,
      },
    });
  }
  return out;
}

/**
 * `ABSENT` — jadval bo'yicha ish kuni, davomat yozuvi esa YO'Q.
 *
 * `attendedKeys` — `"<employeeId>:<localDate>"` to'plami. Yo'qlik dalili
 * yozuvning YO'QLIGI bo'lgani uchun, hujjat havolasi ham yo'q (`docId: null`)
 * — bu yagona qoida turi shunday.
 */
export function buildAbsentCandidates(
  expected: ReadonlyArray<ExpectedWorkday>,
  attendedKeys: ReadonlySet<string>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];

  const out: WorkItemCandidate[] = [];
  for (const day of expected) {
    if (!day.isWorkday) continue;
    if (attendedKeys.has(`${day.employeeId}:${day.localDate}`)) continue;

    out.push({
      dedupKey: `absent:${day.employeeId}:${day.localDate}`,
      ruleType: 'ABSENT',
      severity: rule.severity,
      subjectEmployeeId: day.employeeId,
      amountMinor: null,
      currency: null,
      docType: null,
      docId: null,
      occurredAt: day.dayStart,
      context: { employeeName: day.employeeName, localDate: day.localDate },
    });
  }
  return out;
}

// ── 9–10. Zaxira signallari ────────────────────────────────────────────────

const SIGNAL_KIND_BY_RULE = {
  LOW_STOCK: 'stockout_risk',
  DEAD_STOCK: 'dead_money',
} as const;

export type StockSignalRuleType = keyof typeof SIGNAL_KIND_BY_RULE;

const DEDUP_PREFIX_BY_RULE: Record<StockSignalRuleType, string> = {
  LOW_STOCK: 'low_stock',
  DEAD_STOCK: 'dead_stock',
};

/**
 * `stock-signals.ts` (4M.8) hukmini navbat elementiga aylantiradi. Chegara shu
 * yerda QAYTA qo'llanmaydi — u signal hisoblanayotganda ishlatilgan; ikkinchi
 * marta tekshirish ikki haqiqat bo'lardi.
 *
 * **`no_history` qatori tashlanadi.** U «bu tovar haqida hech narsa deya
 * olmaymiz» degani — qoida buzilishi emas, ma'lumot sifati savoli (MK09
 * paneli). Navbatga qo'shilsa, hech qachon sotilmagan HAR tovar menejer
 * ro'yxatiga tushib, navbatni o'qib bo'lmas holga keltirardi.
 */
export function buildStockSignalCandidates(
  rows: ReadonlyArray<StockSignalRow>,
  rule: ResolvedRule,
  ruleType: StockSignalRuleType,
  periodKey: string,
  /**
   * Holat qoidasida «hodisa vaqti» yo'q — signal hisoblangan on ishlatiladi.
   * Chaqiruvchidan keladi, chunki `sync` ning bir yugurishida hamma element
   * bir xil vaqt tamg'asini olishi kerak.
   */
  observedAt: Date,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const wantedKind = SIGNAL_KIND_BY_RULE[ruleType];
  const prefix = DEDUP_PREFIX_BY_RULE[ruleType];

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    if (row.kind !== wantedKind) continue;
    if (row.unmeasuredReason === 'no_history') continue;

    out.push({
      dedupKey: `${prefix}:${row.storeId}:${row.assortmentKind}:${row.assortmentId}:${periodKey}`,
      ruleType,
      severity: rule.severity,
      // Zaxira signali xodimga bog'lanmaydi — bu jarayon muammosi.
      subjectEmployeeId: null,
      amountMinor: row.amountMinor,
      currency: null,
      docType: row.assortmentKind,
      docId: row.assortmentId,
      occurredAt: observedAt,
      context: {
        storeId: row.storeId,
        storeName: row.storeName,
        productName: row.name,
        qty: row.qty,
        signalQty: row.signalQty,
        daysIdle: row.daysIdle,
        coverDays: row.coverDays,
        unmeasuredReason: row.unmeasuredReason,
      },
    });
  }
  return out;
}

// ── 11. Yig'ish SLA'si ─────────────────────────────────────────────────────

/** Hali yopilmagan topshiriq holatlari — faqat shular qotib qola oladi. */
const OPEN_TASK_STATUSES = new Set(['pending', 'in_progress']);

export function buildPickingSlaCandidates(
  rows: ReadonlyArray<PickingTaskRow>,
  rule: ResolvedRule,
  now: Date,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limitHours = Math.max(0, Math.trunc(rule.threshold ?? 0));

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    // Bajarilgan yoki bekor qilingan topshiriq «qotib qolgan» emas.
    if (!OPEN_TASK_STATUSES.has(row.status)) continue;

    const ageHours = Math.floor((now.getTime() - row.createdAt.getTime()) / HOUR_MS);
    if (ageHours <= limitHours) continue;

    out.push({
      dedupKey: `picking_sla:${row.id}`,
      ruleType: 'PICKING_SLA',
      severity: rule.severity,
      subjectEmployeeId: row.assigneeId,
      amountMinor: null,
      currency: null,
      docType: 'restocktask',
      docId: row.id,
      occurredAt: row.createdAt,
      context: {
        sourceName: row.sourceName,
        assigneeName: row.assigneeName,
        status: row.status,
        skladNo: row.skladNo,
        ageHours,
        thresholdHours: limitHours,
      },
    });
  }
  return out;
}

// ── 12. Inventarizatsiya farqi ─────────────────────────────────────────────

/**
 * Farq **puli** o'lchov: dona menejerga «ko'pmi yoki ozmi» demaydi.
 *
 * Uch holat ajratiladi (`data-quality-flag-layer` shartnomasi):
 *   - farq umuman yo'q ⇒ element YO'Q;
 *   - farq bor va tan narx ma'lum ⇒ chegara qo'llanadi;
 *   - farq bor, LEKIN birorta pozitsiyaning tan narxi yo'q ⇒ element bor,
 *     `amountMinor: null`, chegara qo'llanmaydi (taqqoslashga raqam yo'q).
 */
export function buildInventoryVarianceCandidates(
  rows: ReadonlyArray<InventoryVarianceRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];
  const limit = thresholdMinor(rule);

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    let varianceCount = 0;
    let measuredCount = 0;
    let unmeasuredPositions = 0;
    let measuredMinor = 0n;

    for (const position of row.positions) {
      if (parseDecimalScaled(position.varianceQty) === 0n) continue;
      varianceCount += 1;
      if (position.costMinor == null || position.costMinor <= 0n) {
        unmeasuredPositions += 1;
        continue;
      }
      measuredCount += 1;
      // Kamomad ham, ortiqcha ham farq — belgisi emas, KATTALIGI muhim.
      const qty = position.varianceQty.startsWith('-')
        ? position.varianceQty.slice(1)
        : position.varianceQty;
      measuredMinor += computeLineCost(qty, position.costMinor);
    }

    if (varianceCount === 0) continue;
    if (measuredCount > 0 && measuredMinor <= limit) continue;

    out.push({
      dedupKey: `inventory_variance:${row.id}`,
      ruleType: 'INVENTORY_VARIANCE',
      severity: rule.severity,
      subjectEmployeeId: row.ownerId,
      amountMinor: measuredCount > 0 ? measuredMinor : null,
      currency: null,
      docType: 'inventory',
      docId: row.id,
      occurredAt: row.occurredAt,
      context: {
        inventoryName: row.name,
        storeId: row.storeId,
        storeName: row.storeName,
        varianceCount,
        unmeasuredPositions,
      },
    });
  }
  return out;
}
