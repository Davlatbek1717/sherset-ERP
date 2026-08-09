import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { parseLocalIso } from '../../hr/hr-shared/tz.util.js';
import {
  DATA_QUALITY,
  type DataQualityLevel,
  aggregateQuality,
  overallQuality,
  sharePercent,
} from '../../report/metrics/index.js';
import { DAILY_KPI_STATE, type DailyKpiState, countsTowardPayroll } from './daily-kpi-fsm.js';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';

/**
 * Ma'lumot sifati paneli (MK09 · menejer KPI TZ §2.4, §0.2).
 *
 * SAVOL: «bu raqamga qanchalik ishonish mumkin». Panel to'rt javob beradi:
 *   1. har ko'rsatkich uchun bayroq — to'liq / qisman / yig'ilmagan;
 *   2. tan narxi yig'ilmagan cheklar ULUSHI (X1 bug-klassining o'lchovi);
 *   3. qabul qilinmagan kunlar ulushi (M-Q8: ular oylikni bloklaydi);
 *   4. manbasi yo'q ko'rsatkichlar ro'yxati — «raqam o'zi paydo bo'ladi» deb
 *      kutib o'tirilmasin.
 *
 * BAYROQ QOIDASI BU YERDA YO'Q — u `report/metrics/data-quality.ts` da
 * (yagona formulalar qatlami). Bu yerda faqat Prisma-I/O va sanoqlarni
 * o'sha qoidaga uzatish. Aks holda menejer ekranidagi bayroq bilan
 * hisobotdagi bayroq bir kun kelib ikki xil bo'lib ketardi.
 *
 * ⚠️ Panel HECH NARSANI BLOKLAMAYDI va hech narsani tuzatmaydi — u faqat
 * ko'rinadi. Tuzatish yo'li boshqa: tan narx muzlatish (1.1), kunni qabul
 * qilish (4M.2).
 */
@Injectable()
export class DataQualityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KpiMetricCatalogService) private readonly catalog: KpiMetricCatalogService,
  ) {}

  async panel(accountId: string, range: DataQualityRange = {}): Promise<DataQualityPanel> {
    const { fromLabel, toLabel, fromInstant, toInstantExclusive, from, to } = resolveRange(range);

    const [catalog, metricGroups, stateGroups, receipts, receiptsMissingCost, daysWithoutProfile] =
      await Promise.all([
        this.catalog.resolve(accountId),
        // Agregat SERVERDA: qatorlar soni = xodim × kun × ko'rsatkich, bu
        // oylik davrda o'n minglab bo'ladi — ularni JS'ga tortish shart emas.
        // `_count.autoValue` — NULL BO'LMAGAN qiymatlar soni, ya'ni aynan
        // «o'lchangan» sanog'i (NULL nolga aylanmaydi).
        this.prisma.client.employeeDailyKpiMetric.groupBy({
          by: ['metricKey', 'complete'],
          where: { accountId, dailyKpi: { date: { gte: fromLabel, lte: toLabel } } },
          _count: { _all: true, autoValue: true },
        }),
        this.prisma.client.employeeDailyKpi.groupBy({
          by: ['state'],
          where: { accountId, date: { gte: fromLabel, lte: toLabel } },
          _count: { _all: true },
        }),
        // Chek = hujjat. «Cheklarning nechta foizida tan narx yig'ilmagan»
        // degan savolga qator emas, HUJJAT darajasidagi sanoq javob beradi.
        this.prisma.client.retailSale.count({
          where: {
            accountId,
            state: 'posted',
            postedAt: { gte: fromInstant, lt: toInstantExclusive },
          },
        }),
        this.prisma.client.retailSale.count({
          where: {
            accountId,
            state: 'posted',
            postedAt: { gte: fromInstant, lt: toInstantExclusive },
            positions: { some: { costMinor: null } },
          },
        }),
        this.prisma.client.employeeDailyKpi.count({
          where: { accountId, date: { gte: fromLabel, lte: toLabel }, profileVersionId: null },
        }),
      ]);

    // ── Ko'rsatkich bayroqlari ────────────────────────────────────────────
    const byKey = new Map<string, { total: number; measured: number; partial: number }>();
    const bucket = (key: string) => {
      let b = byKey.get(key);
      if (!b) {
        b = { total: 0, measured: 0, partial: 0 };
        byKey.set(key, b);
      }
      return b;
    };
    for (const g of metricGroups) {
      const b = bucket(g.metricKey);
      const measured = g._count.autoValue;
      b.total += g._count._all;
      b.measured += measured;
      // Chala = O'LCHANDI-yu manbasi to'liq emas. O'lchanmagan qator chala
      // emas — u umuman yo'q (`uncollected` tomonida sanaladi).
      if (!g.complete) b.partial += measured;
    }
    // Katalogda bor-u davr ichida bironta qatori yo'q ko'rsatkich ham
    // ro'yxatda bo'lishi SHART: «ekranda yo'q» degani «muammo yo'q» emas.
    for (const key of catalog.keys()) bucket(key);

    const metrics: MetricQualityRow[] = [...byKey.entries()]
      .map(([key, s]) => {
        const def = catalog.get(key);
        return {
          key,
          // Katalogdan tushib qolgan (arxivlangan) ko'rsatkich YASHIRILMAYDI —
          // uning qatorlari mavjud va menejer nimadan gap ketayotganini
          // ko'rishi kerak. Nomi bo'lmasa kalitning o'zi ko'rsatiladi.
          labelUz: def?.labelUz ?? key,
          labelRu: def?.labelRu ?? key,
          source: def?.source ?? 'manual',
          level: aggregateQuality(s),
          total: s.total,
          measured: s.measured,
          partial: s.partial,
          /** Qatorlarning necha foizi o'lchangan. Qator yo'q ⇒ NULL. */
          coveragePercent: sharePercent(s.measured, s.total),
        };
      })
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.key.localeCompare(b.key));

    // ── Tan narx (X1 bug-klassining jonli o'lchovi) ───────────────────────
    const cost: CostQuality = {
      receipts,
      receiptsMissingCost,
      missingPercent: sharePercent(receiptsMissingCost, receipts),
      level:
        receipts === 0 || receiptsMissingCost >= receipts
          ? DATA_QUALITY.uncollected
          : receiptsMissingCost > 0
            ? DATA_QUALITY.partial
            : DATA_QUALITY.complete,
    };

    // ── Qabul qilingan kunlar (M-Q8) ──────────────────────────────────────
    const byState = stateGroups
      .map((g) => ({ state: g.state as DailyKpiState, count: g._count._all }))
      .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
    const days = byState.reduce((sum, s) => sum + s.count, 0);
    // «Qabul qilingan» ta'rifi FSM'dan (`countsTowardPayroll`) — bu yerda
    // holatlar ro'yxati QAYTA yozilmaydi, aks holda oylik bir javob,
    // panel boshqa javob berardi.
    const accepted = byState
      .filter((s) => countsTowardPayroll(s.state))
      .reduce((sum, s) => sum + s.count, 0);
    const acceptance: AcceptanceQuality = {
      days,
      accepted,
      unaccepted: days - accepted,
      unacceptedPercent: sharePercent(days - accepted, days),
      byState,
      daysWithoutProfile,
      withoutProfilePercent: sharePercent(daysWithoutProfile, days),
    };

    return {
      from,
      to,
      // Umumiy bayroq uch blokdan: ko'rsatkichlar · tan narx · qabul.
      overall: overallQuality([
        ...metrics.map((m) => m.level),
        cost.level,
        acceptanceLevel(acceptance),
      ]),
      metrics,
      unsourced: metrics
        .filter((m) => m.level === DATA_QUALITY.uncollected)
        .map((m) => ({ key: m.key, labelUz: m.labelUz, labelRu: m.labelRu, source: m.source })),
      cost,
      acceptance,
    };
  }
}

/** Qabul bloki bayrog'i: bitta qabul qilinmagan kun ham panelni «qisman» qiladi. */
function acceptanceLevel(a: AcceptanceQuality): DataQualityLevel {
  if (a.days === 0) return DATA_QUALITY.uncollected;
  if (a.accepted === 0) return DATA_QUALITY.uncollected;
  return a.unaccepted > 0 ? DATA_QUALITY.partial : DATA_QUALITY.complete;
}

/** Yomoni tepada — menejer aynan aralashuv kerak joyni birinchi ko'radi. */
const LEVEL_ORDER: Record<DataQualityLevel, number> = {
  [DATA_QUALITY.uncollected]: 0,
  [DATA_QUALITY.partial]: 1,
  [DATA_QUALITY.complete]: 2,
};

const STATE_ORDER: readonly DailyKpiState[] = [
  DAILY_KPI_STATE.pending,
  DAILY_KPI_STATE.rejected,
  DAILY_KPI_STATE.escalated,
  DAILY_KPI_STATE.stale,
  DAILY_KPI_STATE.computed,
  DAILY_KPI_STATE.accepted,
  DAILY_KPI_STATE.forceAccepted,
];

/** Panel sukut bo'yicha oxirgi shuncha kunni ko'rsatadi (bugun bilan tugaydi). */
export const DEFAULT_RANGE_DAYS = 30;

export interface DataQualityRange {
  /** `YYYY-MM-DD` (Toshkent kuni). Berilmasa — `to` dan 29 kun oldin. */
  from?: string;
  /** `YYYY-MM-DD` (Toshkent kuni). Berilmasa — bugun. */
  to?: string;
}

/**
 * Sana chegaralari — IKKI XIL, va ular aralashmasligi kerak.
 *
 * `EmployeeDailyKpi.date` — `@db.Date`, ya'ni **yorliq**: UTC yarim tun bilan
 * saqlanadi va `localDateOnly` shunday yozadi. `RetailSale.postedAt` esa
 * **instant** (`timestamptz`). Yorliqni instant sifatida ishlatish 1-iyul
 * soat 00:00–05:00 (Toshkent) chekларini iyun oyiga qo'shib yuborardi —
 * `monthBounds` bilan bo'lgan aynan shu xato klassi.
 */
function resolveRange(range: DataQualityRange) {
  const to = range.to ?? todayLabel();
  const from = range.from ?? shiftDays(to, -(DEFAULT_RANGE_DAYS - 1));
  return {
    from,
    to,
    fromLabel: new Date(`${from}T00:00:00.000Z`),
    toLabel: new Date(`${to}T00:00:00.000Z`),
    fromInstant: parseLocalIso(`${from}T00:00:00`),
    toInstantExclusive: new Date(parseLocalIso(`${to}T00:00:00`).getTime() + 86_400_000),
  };
}

function todayLabel(): string {
  // Toshkent kuni: `parseLocalIso` teskarisi kerak emas — sana yorlig'ini
  // formatlash uchun UTC+5 siljishi yetadi.
  return new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
}

function shiftDays(label: string, days: number): string {
  const d = new Date(`${label}T00:00:00.000Z`);
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

// ── Javob shakli ────────────────────────────────────────────────────────────

export interface MetricQualityRow {
  key: string;
  labelUz: string;
  labelRu: string;
  source: string;
  level: DataQualityLevel;
  total: number;
  measured: number;
  partial: number;
  coveragePercent: number | null;
}

export interface CostQuality {
  receipts: number;
  receiptsMissingCost: number;
  /** Mahraj yo'q (chek yo'q) ⇒ **null**, `0%` EMAS. */
  missingPercent: number | null;
  level: DataQualityLevel;
}

export interface AcceptanceQuality {
  days: number;
  accepted: number;
  unaccepted: number;
  unacceptedPercent: number | null;
  byState: Array<{ state: DailyKpiState; count: number }>;
  daysWithoutProfile: number;
  withoutProfilePercent: number | null;
}

export interface DataQualityPanel {
  from: string;
  to: string;
  overall: DataQualityLevel;
  metrics: MetricQualityRow[];
  unsourced: Array<{ key: string; labelUz: string; labelRu: string; source: string }>;
  cost: CostQuality;
  acceptance: AcceptanceQuality;
}
