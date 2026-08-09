import type { RuleConfigRow } from '../queue/work-item-rules.js';

/**
 * MK13 / 4M TZ §2.5, §11 — menejer bo'limining SON-CHEGARALARI registri.
 *
 * ## Nega bitta registr
 * Ikki qiymat kodda «o'ylab topilgan raqam» bo'lib qotib qolgan edi:
 *   • `SCORE_CAP_PERCENT = 150` (`kpi-score.ts`) — **QAROR-B2**;
 *   • `DEFAULT_WARN_PERCENT = 90` (`expense-budget/budget-variance.ts`) — MK12 DEFER-3,
 *     u yerda ochiq yozilgan: «sozlamaga chiqarish MK13 dagi `SCORE_CAP_PERCENT` bilan
 *     **birga** qilinsin (bir xil naqsh, ikki marta emas)».
 * Shuning uchun ikkalasi ham shu yerda — ikkinchi sozlama manbai yaratilmaydi.
 *
 * ## Qayerda saqlanadi
 * `manager_rule_configs` — MK06 navbat qoidalari va MK10 `SLA_*` bilan **ayni
 * jadval** (xotira: `sla-thresholds-in-rule-config-table.md`). Begona `ruleType`
 * qatorlari bu yerda **o'qilmaydi**.
 *
 * ## 🔴 Noto'g'ri sozlama JIMGINA qo'llanmaydi
 * Birlik mos kelmasa yoki qiymat oraliqdan chiqsa — raqamga **tegilmaydi**,
 * registr sukuti amal qiladi va `rejectReason` ochiq qaytadi. Foizni boshqa
 * birlikda talqin qilish shu repoda allaqachon yuz bergan bug-klass
 * (`per-unit-snapshot` hodisasi); `stuck-sla.ts` dagi `resolveSlaStages` ham
 * aynan shu intizomda ishlaydi.
 *
 * ## Sof modul
 * DB yo'q, soat yo'q — faqat qator ro'yxati kiradi, hal qilingan chegara chiqadi.
 */

export const MANAGER_THRESHOLD = {
  /** Kompozit balldagi bitta ko'rsatkich hissasining shifti (QAROR-B2). */
  kpiScoreCap: 'KPI_SCORE_CAP',
  /** Xarajat byudjetida «ogohlantirish» chegarasi, rejaning % (MK12). */
  budgetWarnPercent: 'BUDGET_WARN_PERCENT',
} as const;

export type ManagerThresholdKey = (typeof MANAGER_THRESHOLD)[keyof typeof MANAGER_THRESHOLD];

export interface ManagerThresholdDefinition {
  readonly key: ManagerThresholdKey;
  /** `manager_rule_configs.rule_type` — kalitning o'zi (nusxa emas). */
  readonly ruleType: ManagerThresholdKey;
  readonly defaultValue: number;
  /** Har doim `percent`: boshqa birlikdagi qator RAD ETILADI, talqin qilinmaydi. */
  readonly unit: 'percent';
  readonly min: number;
  readonly max: number;
  /** Ekranda ko'rsatiladigan qisqa izoh (nega bu raqam bor). */
  readonly rationale: string;
}

export const MANAGER_THRESHOLDS: Readonly<Record<ManagerThresholdKey, ManagerThresholdDefinition>> =
  {
    [MANAGER_THRESHOLD.kpiScoreCap]: {
      key: MANAGER_THRESHOLD.kpiScoreCap,
      ruleType: MANAGER_THRESHOLD.kpiScoreCap,
      // QAROR-B2 (2026-08-09, egasining tasdig'i): 150% qoladi.
      defaultValue: 150,
      unit: 'percent',
      // 100 dan past shift rejani AYNAN bajargan kunni ham jazolagan bo'lardi —
      // «100% = reja bajarildi» ma'nosini buzadi.
      min: 100,
      max: 1000,
      rationale:
        "Bitta ko'rsatkichning kompozit ballga qo'shadigan eng katta hissasi. " +
        "Chekni olib tashlash uchun sozlamani o'chiring (enabled=false).",
    },
    [MANAGER_THRESHOLD.budgetWarnPercent]: {
      key: MANAGER_THRESHOLD.budgetWarnPercent,
      ruleType: MANAGER_THRESHOLD.budgetWarnPercent,
      defaultValue: 90,
      unit: 'percent',
      min: 1,
      // 100% dan yuqorisi ma'nosiz: reja oshib ketgani allaqachon `over` statusi.
      max: 100,
      rationale: 'Xarajat moddasi rejaning shu foiziga yetganda ogohlantiriladi.',
    },
  };

export type ThresholdRejectReason = 'unit_mismatch' | 'out_of_range' | 'not_a_number';

export interface ResolvedThreshold extends ManagerThresholdDefinition {
  /** Amaldagi qiymat. Sozlama rad etilgan bo'lsa — registr sukuti. */
  value: number;
  /** Hisobda shu chegara uchun qator bormi va u QO'LLANDIMI. */
  configured: boolean;
  /** Sozlamada nima turgani (rad etilgan bo'lsa ham ko'rinadi). NULL = qator yo'q. */
  configuredValue: number | null;
  /**
   * 🔴 `false` = chegara UMUMAN qo'llanmaydi (masalan «cheksiz ball»).
   * Bu registr sukutiga qaytish EMAS — `effectiveThreshold()` ga qara.
   */
  enabled: boolean;
  rejectReason: ThresholdRejectReason | null;
}

/**
 * Chegaraning amaldagi qiymati.
 *
 * `null` = chegara yo'q (o'chirilgan). Chaqiruvchi buni ATAYLAB ochiq hal
 * qiladi: `Math.min(x, cap)` ga jimgina `Infinity` uzatish o'rniga «chegara
 * yo'q» holati kodda ko'rinib tursin.
 */
export function effectiveThreshold(t: ResolvedThreshold): number | null {
  return t.enabled ? t.value : null;
}

export function resolveManagerThresholds(
  rows: readonly RuleConfigRow[],
): Map<ManagerThresholdKey, ResolvedThreshold> {
  const byType = new Map<string, RuleConfigRow>();
  for (const row of rows) byType.set(row.ruleType, row);

  const out = new Map<ManagerThresholdKey, ResolvedThreshold>();

  for (const def of Object.values(MANAGER_THRESHOLDS)) {
    const row = byType.get(def.ruleType);
    if (!row) {
      out.set(def.key, {
        ...def,
        value: def.defaultValue,
        configured: false,
        configuredValue: null,
        enabled: true,
        rejectReason: null,
      });
      continue;
    }

    const parsed = parseNumber(row.thresholdValue);
    const rejectReason: ThresholdRejectReason | null =
      parsed == null
        ? 'not_a_number'
        : row.thresholdUnit !== def.unit
          ? 'unit_mismatch'
          : parsed < def.min || parsed > def.max
            ? 'out_of_range'
            : null;

    out.set(def.key, {
      ...def,
      value: rejectReason == null && parsed != null ? parsed : def.defaultValue,
      configured: rejectReason == null,
      configuredValue: parsed,
      enabled: row.enabled,
      rejectReason,
    });
  }

  return out;
}

/** Prisma `Decimal` satri ham, oddiy raqam ham. NaN/bo'sh = `null`. */
function parseNumber(v: string | number | null): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
