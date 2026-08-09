/**
 * Menejer bo'limi API client (TZ 4M.2) — **har-xodim KPI konfiguratsiyasi**
 * (`/hr/employees/[id]/kpi` tab'i uchun).
 *
 * Kunlik QABUL QILISH ekrani (`/menejer`) bu client'ni ishlatmaydi: u
 * `/manager/kpi/days*` endpointlariga `api.get/post` bilan to'g'ridan-to'g'ri
 * boradi. Ikki joyda ikki client saqlash o'lik kod bergani uchun (2026-08-04
 * merge'da FE↔BE kontrakt-testi aynan shuni tutdi) bu yerda faqat config bor.
 */

import { api } from './api-client';

export type KpiUnit = 'money' | 'count' | 'percent' | 'minutes';
export type KpiDirection = 'higher_better' | 'lower_better' | 'neutral';
/**
 * `manual` — hisob O'ZI yaratgan ko'rsatkich: tizim uni hisoblamaydi,
 * faktni menejer qo'lda kiritadi (`autoValue` doim NULL).
 */
export type KpiSource = 'cashier' | 'sales' | 'attendance' | 'task' | 'warehouse' | 'manual';

export interface KpiMetricDef {
  key: string;
  labelUz: string;
  labelRu: string;
  unit: KpiUnit;
  direction: KpiDirection;
  source: KpiSource;
  perHour: boolean;
  /** Hisob o'zi yaratganmi (tahrirlash/arxivlash faqat shularga). */
  custom?: boolean;
}

/** Yangi/tahrirlanadigan o'z ko'rsatkichi. `source` yo'q — u doim `manual`. */
export interface SaveCustomMetricInput {
  labelUz: string;
  labelRu?: string;
  unit: KpiUnit;
  direction: KpiDirection;
  perHour?: boolean;
}

/** Bitta konfiguratsiya qatori (og'irlik + ixtiyoriy maqsad, xom string). */
export interface KpiConfigMetric {
  metricKey: string;
  weight: number;
  /** Maqsad-raqam, ko'rsatkich birligida BUTUN son (string — pul tiyinini saqlaydi). null = maqsadsiz. */
  target: string | null;
}

export interface KpiEmployeeConfig {
  profileId: string | null;
  version: number;
  effectiveFrom: string | null;
  metrics: KpiConfigMetric[];
}

export interface SaveKpiConfigInput {
  metrics: Array<{ metricKey: string; weight: number; target?: number | null }>;
  note?: string | null;
}

/** Hisoblangan kunlik natija — bitta ko'rsatkich. */
export interface KpiDailyMetric {
  metricKey: string;
  autoValue: string | null;
  adjustValue: string | null;
  target: string | null;
  weight: number | null;
  complete: boolean;
}

export interface KpiEmployeeDaily {
  date: string;
  state: string;
  dataComplete: boolean;
  workedMinutes: number | null;
  metrics: KpiDailyMetric[];
}

// ─── Egaga haftalik xulosa (M-Q7 · MK04) ───────────────────────────────

/** Bitta menejerning hafta davomidagi faoliyati. */
export interface WeeklyManagerActivity {
  managerId: string | null;
  managerName: string | null;
  acceptedCount: number;
  rejectedCount: number;
  adjustCount: number;
  /** Tuzatmalarning jami ABSOLYUT summasi (tiyin, string). */
  adjustedAbsMinor: string;
  /**
   * Bazasiz tuzatmalar — menejer raqamni TUZATMAGAN, YO'QDAN KIRITGAN.
   * Alohida sanaladi: nazorat nuqtai nazaridan boshqa-boshqa ish.
   */
  noBaselineCount: number;
  forceAcceptedCount: number;
}

export interface OwnerWeeklySummary {
  weekStart: string;
  weekEndExclusive: string;
  totalAccepted: number;
  totalAdjust: number;
  totalAdjustedAbsMinor: string;
  totalForceAccepted: number;
  totalNoBaseline: number;
  pendingDays: number;
  staleDays: number;
  topAdjuster: WeeklyManagerActivity | null;
  activity: WeeklyManagerActivity[];
}

// ─── Ma'lumot sifati paneli (TZ §2.4/§0.2 · MK09) ──────────────────────

/**
 * Sifat darajasi: to'liq / qisman / **yig'ilmagan**.
 *
 * `uncollected` — o'lchov umuman yo'q. Bu `0` EMAS va ekranda hech qachon
 * `0%` bo'lib chizilmaydi (NULL ≠ 0 shartnomasi).
 */
export type DataQualityLevel = 'complete' | 'partial' | 'uncollected';

export interface DataQualityMetricRow {
  key: string;
  labelUz: string;
  labelRu: string;
  source: string;
  level: DataQualityLevel;
  /** Davr ichida ochilgan qatorlar soni (xodim × kun). */
  total: number;
  /** Shulardan qiymati BOR (o'lchangan) qatorlar. */
  measured: number;
  /** O'lchangan-u manbasi chala qatorlar. */
  partial: number;
  /** `measured / total`. Qator umuman yo'q ⇒ **null**, `0` emas. */
  coveragePercent: number | null;
}

export interface DataQualityPanel {
  from: string;
  to: string;
  overall: DataQualityLevel;
  metrics: DataQualityMetricRow[];
  /** Manbasi yo'q (davr ichida bironta ham o'lchov bo'lmagan) ko'rsatkichlar. */
  unsourced: Array<{ key: string; labelUz: string; labelRu: string; source: string }>;
  cost: {
    receipts: number;
    receiptsMissingCost: number;
    /** Chek bo'lmasa **null** (`0%` emas). */
    missingPercent: number | null;
    level: DataQualityLevel;
  };
  acceptance: {
    days: number;
    accepted: number;
    unaccepted: number;
    unacceptedPercent: number | null;
    byState: Array<{ state: string; count: number }>;
    daysWithoutProfile: number;
    withoutProfilePercent: number | null;
  };
}

// ─── «Korxona puli qayerda» — pul manzarasi paneli (4M TZ §8.1/1 · MK15) ──

/** Panel bloklari — server tartibida (ekran tartibi ham shu). */
export type MoneyMapBlockKey =
  | 'cash'
  | 'bank'
  | 'customer_debt'
  | 'supplier_debt'
  | 'driver_cash'
  | 'goods_in_transit';

/** Kursi topilmagani uchun jamiga QO'SHILMAGAN pul — o'z valyutasida. */
export interface UnconvertedAmount {
  currency: string;
  amountMinor: string;
}

export interface MoneyMapBlock {
  key: MoneyMapBlockKey;
  /** `asset` — bizniki · `liability` — biz qarzdormiz (yakunda ayiriladi). */
  direction: 'asset' | 'liability';
  /** Raqam qaysi servisdan kelgani (provenance — ekranda ham ko'rinadi). */
  source: string;
  /**
   * Bazaga konsolidatsiya qilingan summa. **`null` = «hisoblanmadi»**, `0`
   * EMAS — ekranda `—` bo'lib chiziladi. Bank hisobi uchun bu real holat:
   * daftar yozuvi bo'lmagan hisobning qoldig'i hech qachon o'lchanmagan.
   */
  amountMinor: string | null;
  quality: DataQualityLevel;
  unconvertedByCurrency: UnconvertedAmount[];
  mixedCurrency: boolean;
}

export interface MoneyMapSnapshot {
  blocks: MoneyMapBlock[];
  summary: {
    /** Aktivlar − passivlar. Bitta blok o'lchanmagan bo'lsa — **`null`**. */
    netMinor: string | null;
    currency: string;
    quality: DataQualityLevel;
    unconvertedByCurrency: UnconvertedAmount[];
  };
}

export const managerMoneyMapApi = {
  /** «Hozir qayerda qancha pul turibdi» — parametrsiz, joriy holat. */
  snapshot: () => api.get<MoneyMapSnapshot>('/manager/money-map'),
};

// ── MK19 — ertalabki brifing / kechki yakun (4M TZ §8.1/5) ───────────────────

export type BriefingKind = 'morning' | 'evening';

export type BriefingBlockKey =
  | 'stuck'
  | 'sla_breach'
  | 'acceptance_pending'
  | 'stock_signal'
  | 'revenue'
  | 'shift_acceptance'
  | 'cash_variance'
  | 'open_items';

/**
 * `signal` — nolga teng bo'lmasa DIQQAT · `measure` — kontekst raqami.
 *
 * Ekran ikkalasini BOSHQACHA chizadi: `measure` hech qachon ogohlantirish
 * rangini olmaydi. «Jarayonda 9 ta buyurtma» va «bugun 12 mln tushum» —
 * normal ish kuni, muammo emas.
 */
export type BriefingBlockRole = 'signal' | 'measure';

export interface BriefingBlock {
  key: BriefingBlockKey;
  role: BriefingBlockRole;
  /** Raqam qaysi servisdan kelgani (provenance — ekranda ham ko'rinadi). */
  source: string;
  /** **`null` = «o'lchanmadi»**, `0` EMAS — ekranda `—` bo'lib chiziladi. */
  count: number | null;
  /** Blokning pul o'lchovi (bo'lsa). `null` = yo'q yoki o'lchanmadi. */
  amountMinor: string | null;
  quality: DataQualityLevel;
  attention: boolean;
  context: Record<string, number | string | null>;
}

/**
 * `quiet` — hamma signal O'LCHANDI va nol · `attention` — o'lchangan signal
 * bor · `incomplete` — signalning bir qismi o'lchanmagan (⚠️ «tinch kun» deb
 * ATALMAYDI: o'lchanmagan manbadan chiqqan xotirjamlik yolg'on).
 */
export type BriefingStatus = 'quiet' | 'attention' | 'incomplete';

export interface BriefingSnapshot {
  kind: BriefingKind;
  /** `YYYY-MM-DD` (Toshkent kuni). */
  businessDate: string;
  generatedAt: string;
  currency: string;
  blocks: BriefingBlock[];
  summary: {
    kind: BriefingKind;
    status: BriefingStatus;
    /** Bitta signal o'lchanmasa — **`null`** (yarim yig'indi berilmaydi). */
    attentionCount: number | null;
    attentionBlocks: BriefingBlockKey[];
    quality: DataQualityLevel;
  };
}

export interface BriefingSendResult {
  sent: boolean;
  /** `duplicate` — shu kunning digesti allaqachon navbatda/yuborilgan. */
  skipped: 'duplicate' | null;
  outboxId: string | null;
  chatId: string;
  tag: string;
  businessDate: string;
  status: BriefingStatus;
}

export const managerBriefingApi = {
  /** «Bugun nima muhim» (morning) / «bugun nima bo'ldi» (evening). */
  snapshot: (kind: BriefingKind) => api.get<BriefingSnapshot>(`/manager/briefing/${kind}`),
  /** Digestni Telegram navbatiga qo'yadi — bir kunda bir marta. */
  sendTelegram: (kind: BriefingKind) =>
    api.post<BriefingSendResult>(`/manager/briefing/${kind}/telegram`, {}),
};

export const managerKpiApi = {
  /** Ma'lumot sifati paneli. Davr berilmasa — oxirgi 30 kun. */
  dataQuality: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range?.from) qs.set('from', range.from);
    if (range?.to) qs.set('to', range.to);
    const suffix = qs.toString();
    return api.get<DataQualityPanel>(`/manager/kpi/data-quality${suffix ? `?${suffix}` : ''}`);
  },

  /** `week` berilmasa — O'TGAN hafta (tugagan hafta ko'rsatiladi). */
  weeklySummary: (week?: string) =>
    api.get<OwnerWeeklySummary>(`/manager/kpi/weekly-summary${week ? `?week=${week}` : ''}`),

  metrics: () => api.get<KpiMetricDef[]>('/manager/kpi/metrics'),
  getConfig: (employeeId: string) =>
    api.get<KpiEmployeeConfig>(`/manager/kpi/employee/${employeeId}/config`),
  saveConfig: (employeeId: string, data: SaveKpiConfigInput) =>
    api.put<{ profileId: string; version: number; effectiveFrom: string }>(
      `/manager/kpi/employee/${employeeId}/config`,
      data,
    ),
  daily: (employeeId: string, date?: string) =>
    api.get<KpiEmployeeDaily | null>(
      `/manager/kpi/employee/${employeeId}/daily${date ? `?date=${date}` : ''}`,
    ),

  // — hisobning O'Z ko'rsatkichlari —
  createMetric: (data: SaveCustomMetricInput) =>
    api.post<KpiMetricDef>('/manager/kpi/metrics', data),
  updateMetric: (key: string, data: SaveCustomMetricInput) =>
    api.post<KpiMetricDef>(`/manager/kpi/metrics/${key}`, data),
  archiveMetric: (key: string) =>
    api.post<{ key: string; archived: boolean }>(`/manager/kpi/metrics/${key}/archive`, {}),
};
