/**
 * MK06 / 4M TZ §5.2 — MENEJER NAVBATINING QOIDA REGISTRI. Sof modul (Prisma'siz).
 *
 * Registr ikki narsani ushlab turadi:
 *   1. **Qoida ta'rifi** — turi, toifasi, chegarasi va birligi, jiddiyligi.
 *      MK07 shu yerga 12 turni to'ldiradi; MK06 ikkitasi bilan dvigatelni
 *      isbotlaydi (reja: «1–2 namunaviy qoida yetarli»).
 *   2. **Nomzod yasovchi** — manba ma'lumotini navbat elementiga aylantiradi.
 *      Nomzod hali SAQLANMAYDI: uni `work-queue-planner.ts` dedup qiladi.
 *
 * ## 🔴 NAVBAT BLOKLAMAYDI (§5.1)
 * Har ta'rifda `blocks: false` **literal tipi** turadi, ya'ni kimdir taqiq
 * qo'shmoqchi bo'lsa avval tipni buzishi kerak. Xuddi shu qulf uch qatlamda
 * takrorlangan — bazada CHECK, bu yerda tip, `price-change-control.ts` da
 * hukm — chunki bitta qatlamdagi qulf refaktoring paytida jimgina yo'qoladi.
 *
 * ## Chegara BIRLIGI bilan birga o'qiladi
 * Sozlamadagi `thresholdValue` ni `thresholdUnit` siz ishlatish taqiqlangan:
 * «20%» ni «20 tiyin» deb talqin qilish chegarani amalda nolga tushirib,
 * butun tarixni navbatga quyardi. Birlik mos kelmasa — sozlama RAD etiladi va
 * registr qiymati qoladi (`thresholdRejected: true` bilan ko'rinadi).
 */

import {
  DEFAULT_PRICE_THRESHOLD_PERCENT,
  type PriceChangeReview,
} from '../inventory/price-change-control.js';

// ── Umumiy tiplar ───────────────────────────────────────────────────────────

export const WORK_ITEM_SEVERITY = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
} as const;

export type WorkItemSeverity = (typeof WORK_ITEM_SEVERITY)[keyof typeof WORK_ITEM_SEVERITY];

/** Navbatdagi tartib: eng jiddiysi tepada. */
export const SEVERITY_ORDER: Record<WorkItemSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

/**
 * `observe` — element yaratiladi, lekin bildirishnoma yo'q (kuzatuv rejimi).
 * `notify` — element yaratiladi va menejer navbatida ko'rinadi.
 *
 * **`block` YO'Q va bo'lmaydi** — §5.1 egasining falsafasi: «erkinlik +
 * keyingi nazorat».
 */
export const RULE_MODE = { observe: 'observe', notify: 'notify' } as const;
export type RuleMode = (typeof RULE_MODE)[keyof typeof RULE_MODE];

export const THRESHOLD_UNIT = {
  percent: 'percent',
  minor: 'minor',
  days: 'days',
  qty: 'qty',
} as const;

export type ThresholdUnit = (typeof THRESHOLD_UNIT)[keyof typeof THRESHOLD_UNIT];

/** §5.2 ning to'rt toifasi — MK07 qolgan qoidalarni shularga taqsimlaydi. */
export const RULE_CATEGORY = {
  lossDiscount: 'loss_discount',
  debt: 'debt',
  shiftAttendance: 'shift_attendance',
  warehouse: 'warehouse',
} as const;

export type RuleCategory = (typeof RULE_CATEGORY)[keyof typeof RULE_CATEGORY];

export interface ManagerRuleDefinition {
  readonly ruleType: string;
  readonly category: RuleCategory;
  readonly defaultEnabled: boolean;
  /** `null` = chegarasiz qoida. Aks holda `thresholdUnit` MAJBURIY. */
  readonly defaultThreshold: number | null;
  readonly thresholdUnit: ThresholdUnit | null;
  readonly defaultSeverity: WorkItemSeverity;
  /** 🔴 Literal `false` — navbat kuzatadi, to'xtatmaydi. */
  readonly blocks: false;
}

// ── Registr ─────────────────────────────────────────────────────────────────

/**
 * MK06 namunaviy qoidalari. **MK07** shu obyektga qolgan turlarni qo'shadi
 * (§5.2 jadvali: `BELOW_COST`, `BIG_DISCOUNT`, `BELOW_WHOLESALE`, `BIG_DEBT`,
 * `OVERDUE_DEBT`, `LATE`/`ABSENT`, `SHIFT_OUT_OF_SCHEDULE`, `LOW_STOCK`,
 * `DEAD_STOCK`, `PICKING_SLA`, `INVENTORY_VARIANCE`).
 *
 * Ikkitasi ataylab tanlangan: ikkalasining ham MANBASI allaqachon qurilgan
 * (MK11 narx tarixi, MK08/kassa farq akti), ya'ni dvigatel jonli ma'lumotda
 * sinaladi — bo'sh registr ustida emas.
 */
export const MANAGER_RULES = {
  /** MK11 `reviewPriceChanges` chegarasi endi SOZLAMADAN keladi. */
  PRICE_CHANGE: {
    ruleType: 'PRICE_CHANGE',
    category: RULE_CATEGORY.lossDiscount,
    defaultEnabled: true,
    defaultThreshold: DEFAULT_PRICE_THRESHOLD_PERCENT,
    thresholdUnit: THRESHOLD_UNIT.percent,
    defaultSeverity: WORK_ITEM_SEVERITY.warning,
    blocks: false,
  },
  /**
   * Kassa farq akti (Kassa TZ §8.4). Chegara **0** — ya'ni nolga teng
   * bo'lmagan HAR farq navbatga tushadi. Bu «o'ylab topilgan raqam»ni
   * kiritmaslik uchun: farq aktining o'zi allaqachon istisno hodisa. Shovqin
   * ko'p bo'lsa egasi chegarani sozlamadan ko'taradi.
   */
  CASH_VARIANCE: {
    ruleType: 'CASH_VARIANCE',
    category: RULE_CATEGORY.shiftAttendance,
    defaultEnabled: true,
    defaultThreshold: 0,
    thresholdUnit: THRESHOLD_UNIT.minor,
    defaultSeverity: WORK_ITEM_SEVERITY.critical,
    blocks: false,
  },
} as const satisfies Record<string, ManagerRuleDefinition>;

export type ManagerRuleType = keyof typeof MANAGER_RULES;

export function isManagerRuleType(value: string): value is ManagerRuleType {
  return Object.hasOwn(MANAGER_RULES, value);
}

// ── Sozlama birlashtirish ───────────────────────────────────────────────────

/** `ManagerRuleConfig` qatorining shu modulga keraklic qismi. */
export interface RuleConfigRow {
  ruleType: string;
  enabled: boolean;
  /** Prisma `Decimal` ni satr sifatida beradi; raqam ham qabul qilinadi. */
  thresholdValue: string | number | null;
  thresholdUnit: string | null;
  mode: string;
  severity: string;
}

export interface ResolvedRule extends ManagerRuleDefinition {
  enabled: boolean;
  /** Amaldagi chegara (sozlama yoki registr). */
  threshold: number | null;
  mode: RuleMode;
  severity: WorkItemSeverity;
  /**
   * Sozlamadagi chegara BIRLIGI mos kelmagani uchun tashlab yuborildimi.
   * Ekranda ko'rsatiladi — jim tushib qolgan sozlama menejerni «men chegarani
   * o'zgartirdim-ku» degan yolg'on ishonchda qoldirardi.
   */
  thresholdRejected: boolean;
}

function parseThreshold(value: string | number | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asSeverity(value: string, fallback: WorkItemSeverity): WorkItemSeverity {
  return Object.hasOwn(WORK_ITEM_SEVERITY, value) ? (value as WorkItemSeverity) : fallback;
}

/** `block` yoki notanish qiymat — HAR DOIM `notify` (§5.1). */
function asMode(value: string): RuleMode {
  return Object.hasOwn(RULE_MODE, value) ? (value as RuleMode) : RULE_MODE.notify;
}

/**
 * Registr + akkаunt sozlamasi → amaldagi qoidalar xaritasi.
 *
 * Notanish `ruleType` sozlamasi JIM tashlanadi: qoida kod tomonidan olib
 * tashlangan bo'lishi mumkin, eski qator esa bazada qoladi — bu xato emas.
 */
export function resolveRules(
  rows: ReadonlyArray<RuleConfigRow>,
): Map<ManagerRuleType, ResolvedRule> {
  const byType = new Map<string, RuleConfigRow>();
  for (const row of rows) byType.set(row.ruleType, row);

  const out = new Map<ManagerRuleType, ResolvedRule>();

  for (const [key, def] of Object.entries(MANAGER_RULES) as [
    ManagerRuleType,
    ManagerRuleDefinition,
  ][]) {
    const row = byType.get(key);
    if (!row) {
      out.set(key, {
        ...def,
        enabled: def.defaultEnabled,
        threshold: def.defaultThreshold,
        mode: RULE_MODE.notify,
        severity: def.defaultSeverity,
        thresholdRejected: false,
      });
      continue;
    }

    const configured = parseThreshold(row.thresholdValue);
    // Birlik mos kelmasa — raqamga TEGILMAYDI (yuqoridagi izoh).
    const unitMatches = configured != null && row.thresholdUnit === def.thresholdUnit;
    const thresholdRejected = configured != null && !unitMatches;

    out.set(key, {
      ...def,
      enabled: row.enabled,
      threshold: unitMatches ? configured : def.defaultThreshold,
      mode: asMode(row.mode),
      severity: asSeverity(row.severity, def.defaultSeverity),
      thresholdRejected,
    });
  }

  return out;
}

// ── Nomzod ──────────────────────────────────────────────────────────────────

/**
 * Navbatga tushishga TAYYOR element, lekin hali saqlanmagan. `dedupKey` —
 * manba bilan ombor o'rtasidagi ko'prik: dvigatel qayta ishga tushirilganda
 * shu kalit bo'yicha takror element yaratilmaydi.
 */
export interface WorkItemCandidate {
  dedupKey: string;
  ruleType: ManagerRuleType;
  severity: WorkItemSeverity;
  /** «Kim». `null` = xodimga bog'lanmagan signal. */
  subjectEmployeeId: string | null;
  /** «Qancha» — tiyin. `null` = O'LCHANMADI (0 EMAS). */
  amountMinor: bigint | null;
  currency: string | null;
  docType: string | null;
  docId: string | null;
  /** «Qachon» — HODISA vaqti. */
  occurredAt: Date;
  context: Record<string, unknown>;
}

// ── Namunaviy qoida 1: narx o'zgarishi ──────────────────────────────────────

/**
 * MK11 `reviewPriceChanges` hukmini navbat nomzodiga aylantiradi.
 *
 * Chegara bu yerda QAYTA hisoblanmaydi — chaqiruvchi `reviewPriceChanges` ni
 * `rule.threshold` bilan chaqiradi. Ikkinchi joyda takrorlash ikki haqiqat
 * bo'lardi (`copy-paste-loses-a-branch` sabog'i).
 */
export function buildPriceChangeCandidates(
  reviews: ReadonlyArray<PriceChangeReview>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];

  const out: WorkItemCandidate[] = [];
  for (const review of reviews) {
    const item = review.workItem;
    if (!item) continue;
    out.push({
      dedupKey: item.dedupKey,
      ruleType: 'PRICE_CHANGE',
      severity: rule.severity,
      subjectEmployeeId: item.subjectEmployeeId,
      amountMinor: item.amountMinor,
      currency: review.currencyCode,
      docType: item.docType,
      docId: item.docId,
      occurredAt: item.at,
      context: {
        ...item.context,
        // BigInt JSON'ga tushmaydi — kontekst satrga aylantiriladi.
        beforeMinor: item.context.beforeMinor?.toString() ?? null,
        afterMinor: item.context.afterMinor.toString(),
        productName: review.productName,
        changedByName: review.changedByName,
      },
    });
  }
  return out;
}

// ── Namunaviy qoida 2: kassa farqi ──────────────────────────────────────────

/** `CashierSessionVariance` qatorining shu modulga keraklic qismi. */
export interface CashVarianceRow {
  id: string;
  sessionId: string;
  cashierId: string;
  currency: string;
  /** Manfiy = KAMOMAD, musbat = ORTIQCHA. */
  varianceMinor: bigint;
  kind: string;
  createdAt: Date;
  /** Menejer aktni ko'rgan bo'lsa — navbatga qayta tushmaydi. */
  acknowledgedAt: Date | null;
}

export function buildCashVarianceCandidates(
  rows: ReadonlyArray<CashVarianceRow>,
  rule: ResolvedRule,
): WorkItemCandidate[] {
  if (!rule.enabled) return [];

  // Chegara tiyin o'lchovida; `bigint` ga o'tkazamiz — `Number` bilan
  // taqqoslash katta summada aniqlikni yo'qotardi.
  const thresholdMinor = BigInt(Math.trunc(Math.abs(rule.threshold ?? 0)));

  const out: WorkItemCandidate[] = [];
  for (const row of rows) {
    // Ko'rilgan akt takror ish emas (MK08 `acknowledgedAt` shu ma'noda).
    if (row.acknowledgedAt) continue;

    const magnitude = row.varianceMinor < 0n ? -row.varianceMinor : row.varianceMinor;
    if (magnitude <= thresholdMinor) continue;

    out.push({
      dedupKey: `cash_variance:${row.id}`,
      ruleType: 'CASH_VARIANCE',
      severity: rule.severity,
      subjectEmployeeId: row.cashierId,
      amountMinor: row.varianceMinor,
      currency: row.currency,
      docType: 'cashiersession',
      docId: row.sessionId,
      occurredAt: row.createdAt,
      context: {
        kind: row.kind,
        varianceMinor: row.varianceMinor.toString(),
        thresholdMinor: thresholdMinor.toString(),
      },
    });
  }
  return out;
}
