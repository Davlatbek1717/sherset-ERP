import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { startOfLocalDay } from '../../hr/hr-shared/tz.util.js';
import { CASHIER_EVENT } from '../../retail-sale/cashier-audit.js';
import { metricDef } from './kpi-metrics.js';

/**
 * Drill-down — «bu raqam qayerdan chiqdi» (menejer TZ §3.5).
 *
 * BU MODUL ATAYLAB MAVJUD ENDPOINTLARNI QAYTA ISHLATMAYDI, garchi
 * `/demands`, `/cashier-sessions`, `/tasks` ro'yxatlari bor bo'lsa ham.
 * Sabab — repoda **uchta har xil sana-oynasi** ishlatiladi:
 *   · KPI hisoblash:  `startOfLocalDay()` (Asia/Tashkent), yarim-ochiq `[gte, lt)`
 *   · demand ro'yxati: `moment` ustuni, `-5h/+19h` arifmetikasi
 *   · retail/session/task ro'yxatlari: xom `{gte, lte}`, TZ tuzatmasisiz, YOPIQ yuqori chegara
 * Ustunlar ham farq qiladi (`moment` vs `postedAt`). Ya'ni tile'ni bosgan
 * menejer BOSHQA to'plamni ko'rardi va «raqam noto'g'ri» degan xulosaga
 * kelardi — qabul qilish esa aynan ishonchga tayanadi.
 *
 * Shuning uchun har so'rov `employee-daily-kpi.service.ts` dagi AYNAN o'sha
 * o'q (`CashierSession.cashierId` / `CashierAuditEvent.employeeId` /
 * `Demand.ownerId` / `RestockTaskLine.confirmedById`) va AYNAN o'sha
 * chegara bilan quriladi.
 *
 * CHALA KO'RSATKICH: agar ko'rsatkich `complete: false` bo'lsa, hujjatlar
 * yig'indisi tile bilan mos KELMASLIGI mumkin — chunki ba'zi qatorlar
 * o'lchovdan tashqarida qolgan. Shuning uchun javobda `excluded` alohida
 * qaytariladi: menejer nima hisobga olinmaganini KO'RADI, taxmin qilmaydi.
 */
@Injectable()
export class DailyKpiDrilldownService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async forMetric(
    accountId: string,
    dailyKpiId: string,
    metricKey: string,
    limit = 100,
  ): Promise<DrilldownResult> {
    const def = metricDef(metricKey);
    if (!def) throw new NotFoundException(`Noma'lum ko'rsatkich: ${metricKey}`);

    const day = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id: dailyKpiId, accountId },
      select: { employeeId: true, date: true },
    });
    if (!day) throw new NotFoundException('Kun topilmadi');

    // `date` — DATE ustun (UTC yarim tun). Uni mahalliy kun boshiga aylantirish
    // uchun sanani matn sifatida olib, `startOfLocalDay` ga beramiz — bu
    // hisoblash servisi bilan bir xil chegarani beradi.
    const from = startOfLocalDay(new Date(`${day.date.toISOString().slice(0, 10)}T12:00:00Z`));
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const ctx = { accountId, employeeId: day.employeeId, from, to, take: cap(limit) };

    switch (metricKey) {
      case 'cash_revenue':
      case 'receipt_count':
        return this.cashReceipts(ctx);
      case 'cash_gross_profit':
        return this.cashProfit(ctx);
      case 'till_variance_abs':
        return this.sessions(ctx);
      case 'discount_given':
        return this.auditEvents(ctx, CASHIER_EVENT.priceChanged, 'discount');
      case 'below_cost_count':
      case 'below_cost_loss':
        return this.auditEvents(ctx, CASHIER_EVENT.soldBelowCost);
      case 'cancel_count':
        return this.auditEvents(ctx, CASHIER_EVENT.saleCancelled);
      case 'refund_count':
        return this.auditEvents(ctx, CASHIER_EVENT.refund);
      case 'credit_given':
        return this.auditEvents(ctx, CASHIER_EVENT.soldOnCredit);
      case 'sales_revenue':
      case 'gross_profit':
        return this.demands(ctx);
      case 'worked_minutes':
      case 'late_minutes':
        return this.attendance(ctx);
      case 'tasks_done':
        return this.tasks(ctx, 'done');
      case 'tasks_overdue':
        return this.tasks(ctx, 'overdue');
      case 'picked_lines':
        return this.pickedLines(ctx);
      default:
        return { kind: 'none', rows: [], excluded: [], note: 'drilldown_not_available' };
    }
  }

  // ── Kassa ─────────────────────────────────────────────────────────────────

  /**
   * `cash_revenue` / `receipt_count` — smena agregat ustunlaridan o'qiladi
   * (`CashierSession.salesSumMinor` / `salesCount`), shuning uchun ular
   * ortida turgan hujjatlar = o'sha smenalarning POSTED cheklari.
   */
  private async cashReceipts(c: Ctx): Promise<DrilldownResult> {
    const sessions = await this.sessionIds(c);
    if (sessions.length === 0) return { kind: 'retail_sale', rows: [], excluded: [] };

    const sales = await this.prisma.client.retailSale.findMany({
      where: { accountId: c.accountId, sessionId: { in: sessions }, state: 'posted' },
      select: {
        id: true,
        name: true,
        moment: true,
        postedAt: true,
        sumMinor: true,
        agent: { select: { id: true, name: true } },
      },
      orderBy: { postedAt: 'desc' },
      take: c.take,
    });
    return {
      kind: 'retail_sale',
      rows: sales.map((s) => ({
        id: s.id,
        label: s.name,
        at: s.postedAt ?? s.moment,
        amountMinor: s.sumMinor.toString(),
        extra: { agent: s.agent?.name ?? null },
      })),
      excluded: [],
    };
  }

  /**
   * `cash_gross_profit` — qatorlar darajasida. Tan narxi MUZLATILMAGAN
   * qatorlar foydaga kirmagan, shuning uchun ular `excluded` ga chiqadi:
   * bu aynan «kun chala» bayrog'ining sababi va menejer uni ko'rishi shart.
   */
  private async cashProfit(c: Ctx): Promise<DrilldownResult> {
    const positions = await this.prisma.client.retailSalePosition.findMany({
      where: {
        accountId: c.accountId,
        retailSale: {
          state: 'posted',
          postedAt: { gte: c.from, lt: c.to },
          session: { cashierId: c.employeeId },
        },
      },
      select: {
        id: true,
        sumMinor: true,
        costMinor: true,
        quantity: true,
        product: { select: { name: true } },
        retailSale: { select: { id: true, name: true, postedAt: true } },
      },
      orderBy: { retailSale: { postedAt: 'desc' } },
      take: c.take,
    });

    const rows: DrilldownRow[] = [];
    const excluded: DrilldownRow[] = [];
    for (const p of positions) {
      const qty = decimalOf(p.quantity);
      const row: DrilldownRow = {
        id: p.id,
        label: `${p.retailSale.name} · ${p.product?.name ?? '—'}`,
        at: p.retailSale.postedAt,
        amountMinor:
          p.costMinor != null && qty != null ? (p.sumMinor - p.costMinor * qty).toString() : null,
        extra: {
          saleId: p.retailSale.id,
          sumMinor: p.sumMinor.toString(),
          costMinor: p.costMinor?.toString() ?? null,
          quantity: String(p.quantity),
        },
      };
      if (p.costMinor == null || qty == null) excluded.push(row);
      else rows.push(row);
    }
    return {
      kind: 'retail_position',
      rows,
      excluded,
      note: excluded.length > 0 ? 'cost_not_frozen' : undefined,
    };
  }

  private async sessions(c: Ctx): Promise<DrilldownResult> {
    const rows = await this.prisma.client.cashierSession.findMany({
      where: {
        accountId: c.accountId,
        cashierId: c.employeeId,
        openedAt: { gte: c.from, lt: c.to },
      },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        state: true,
        discrepancyMinor: true,
        salesSumMinor: true,
        salesCount: true,
        cashDesk: { select: { name: true } },
      },
      orderBy: { openedAt: 'desc' },
      take: c.take,
    });
    return {
      kind: 'cashier_session',
      rows: rows.map((s) => ({
        id: s.id,
        label: s.cashDesk?.name ?? 'Kassa',
        at: s.openedAt,
        amountMinor: s.discrepancyMinor?.toString() ?? null,
        extra: {
          state: s.state,
          closedAt: s.closedAt,
          salesSumMinor: s.salesSumMinor.toString(),
          salesCount: s.salesCount,
        },
      })),
      excluded: [],
    };
  }

  /**
   * Audit hodisalari. `discount` rejimida FAQAT narx TUSHIRILGAN hodisalar
   * qoladi — narxni oshirish ham `PRICE_CHANGED` yozadi, lekin chegirma
   * emas. Bu filtr bo'lmasa hujjatlar yig'indisi tile bilan mos kelmasdi.
   */
  private async auditEvents(c: Ctx, type: string, mode?: 'discount'): Promise<DrilldownResult> {
    const events = await this.prisma.client.cashierAuditEvent.findMany({
      where: {
        accountId: c.accountId,
        employeeId: c.employeeId,
        type,
        createdAt: { gte: c.from, lt: c.to },
      },
      select: { id: true, type: true, docId: true, payload: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: c.take,
    });

    const rows: DrilldownRow[] = [];
    const excluded: DrilldownRow[] = [];
    for (const e of events) {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const row: DrilldownRow = {
        id: e.id,
        label: labelOfEvent(e.type, p),
        at: e.createdAt,
        amountMinor: amountOfEvent(e.type, p),
        // `docId` ATAYLAB FK emas — hujjat o'chsa ham audit izi qoladi.
        // Shuning uchun havola «bo'lishi mumkin», kafolat emas.
        extra: { docId: e.docId, type: e.type, payload: p },
      };
      if (mode === 'discount' && !isDiscount(p)) excluded.push(row);
      else rows.push(row);
    }
    return {
      kind: 'cashier_event',
      rows,
      excluded,
      note: mode === 'discount' && excluded.length > 0 ? 'price_raised_not_discount' : undefined,
    };
  }

  private async sessionIds(c: Ctx): Promise<string[]> {
    const rows = await this.prisma.client.cashierSession.findMany({
      where: {
        accountId: c.accountId,
        cashierId: c.employeeId,
        openedAt: { gte: c.from, lt: c.to },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // ── Sotuv · davomat · vazifa · ombor ──────────────────────────────────────

  private async demands(c: Ctx): Promise<DrilldownResult> {
    const rows = await this.prisma.client.demand.findMany({
      where: {
        accountId: c.accountId,
        ownerId: c.employeeId,
        state: 'posted',
        postedAt: { gte: c.from, lt: c.to },
      },
      select: {
        id: true,
        name: true,
        postedAt: true,
        sumMinor: true,
        costSumMinor: true,
        agent: { select: { name: true } },
      },
      orderBy: { postedAt: 'desc' },
      take: c.take,
    });
    return {
      kind: 'demand',
      rows: rows.map((d) => ({
        id: d.id,
        label: d.name,
        at: d.postedAt,
        amountMinor: d.sumMinor.toString(),
        extra: { costSumMinor: d.costSumMinor?.toString() ?? null, agent: d.agent?.name ?? null },
      })),
      excluded: [],
    };
  }

  private async attendance(c: Ctx): Promise<DrilldownResult> {
    const rows = await this.prisma.client.hrAttendance.findMany({
      where: {
        accountId: c.accountId,
        employeeId: c.employeeId,
        checkInTime: { gte: c.from, lt: c.to },
      },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        lateMinutes: true,
        notes: true,
        autoClosed: true,
      },
      orderBy: { checkInTime: 'asc' },
      take: c.take,
    });
    return {
      kind: 'attendance',
      rows: rows.map((a) => ({
        id: a.id,
        label: a.notes?.trim() || 'davomat',
        at: a.checkInTime,
        amountMinor: null,
        extra: {
          checkOutTime: a.checkOutTime,
          lateMinutes: a.lateMinutes,
          // Avtomat yopilgan smena — ketish vaqti O'LCHANGAN emas, taxminiy.
          autoClosed: a.autoClosed,
        },
      })),
      // Ketish qayd etilmagan yozuv ishlangan vaqtni CHALA qiladi (4M.1).
      excluded: rows
        .filter((a) => a.checkOutTime == null)
        .map((a) => ({
          id: a.id,
          label: 'ketish qayd etilmagan',
          at: a.checkInTime,
          amountMinor: null,
          extra: {},
        })),
    };
  }

  private async tasks(c: Ctx, mode: 'done' | 'overdue'): Promise<DrilldownResult> {
    const rows = await this.prisma.client.task.findMany({
      where:
        mode === 'done'
          ? {
              accountId: c.accountId,
              assigneeId: c.employeeId,
              completedAt: { gte: c.from, lt: c.to },
            }
          : {
              accountId: c.accountId,
              assigneeId: c.employeeId,
              done: false,
              dueAt: { lt: c.to },
            },
      select: { id: true, title: true, dueAt: true, completedAt: true, done: true },
      orderBy: mode === 'done' ? { completedAt: 'desc' } : { dueAt: 'asc' },
      take: c.take,
    });
    return {
      kind: 'task',
      rows: rows.map((t) => ({
        id: t.id,
        label: t.title,
        at: mode === 'done' ? t.completedAt : t.dueAt,
        amountMinor: null,
        extra: { dueAt: t.dueAt, completedAt: t.completedAt, done: t.done },
      })),
      excluded: [],
    };
  }

  /**
   * Yig'ish — `RestockTaskLine.confirmedById` bo'yicha. Topshiriqning
   * `assigneeId` si EMAS: topshiriq bir odamga biriktirilib, boshqasi
   * yig'ishi mumkin (4M.1 dagi bir xil izoh).
   */
  private async pickedLines(c: Ctx): Promise<DrilldownResult> {
    const rows = await this.prisma.client.restockTaskLine.findMany({
      where: {
        accountId: c.accountId,
        confirmedById: c.employeeId,
        confirmedAt: { gte: c.from, lt: c.to },
      },
      select: {
        id: true,
        confirmedAt: true,
        quantity: true,
        // `productName` — qator ichida muzlatilgan nom; tovar keyin
        // o'zgartirilsa ham yig'ish payti nima bo'lganini ko'rsatadi.
        productName: true,
        binLocation: true,
        restockTaskId: true,
      },
      orderBy: { confirmedAt: 'desc' },
      take: c.take,
    });
    return {
      kind: 'restock_line',
      rows: rows.map((l) => ({
        id: l.id,
        label: l.productName,
        at: l.confirmedAt,
        amountMinor: null,
        extra: {
          taskId: l.restockTaskId,
          quantity: String(l.quantity),
          binLocation: l.binLocation,
        },
      })),
      excluded: [],
    };
  }
}

// ── Turlar va yordamchilar ──────────────────────────────────────────────────

interface Ctx {
  readonly accountId: string;
  readonly employeeId: string;
  readonly from: Date;
  readonly to: Date;
  readonly take: number;
}

export interface DrilldownRow {
  id: string;
  label: string;
  at: Date | null;
  /** Qatorning pul hissasi (tiyin, matn). `null` = pul o'lchovi yo'q. */
  amountMinor: string | null;
  extra: Record<string, unknown>;
}

export interface DrilldownResult {
  kind:
    | 'retail_sale'
    | 'retail_position'
    | 'cashier_session'
    | 'cashier_event'
    | 'demand'
    | 'attendance'
    | 'task'
    | 'restock_line'
    | 'none';
  rows: DrilldownRow[];
  /** O'lchovga KIRMAGAN qatorlar — «raqam nega mos kelmayapti» savoliga javob. */
  excluded: DrilldownRow[];
  note?: string;
}

function cap(n: number): number {
  return Math.min(Math.max(n, 1), 500);
}

/** Narx TUSHIRILGANmi — chegirma faqat shu holatda (4M.1 bilan bir xil shart). */
function isDiscount(p: Record<string, unknown>): boolean {
  const diff = bigOf(p.diffMinor);
  return diff != null && diff < 0n;
}

function labelOfEvent(type: string, p: Record<string, unknown>): string {
  if (typeof p.productName === 'string') return p.productName;
  if (typeof p.saleName === 'string') return p.saleName;
  if (typeof p.originalName === 'string') return p.originalName;
  if (typeof p.name === 'string') return p.name;
  return type;
}

/** Hodisaning pul hissasi — har tur o'z maydonini ishlatadi (1.3 payload'lari). */
function amountOfEvent(type: string, p: Record<string, unknown>): string | null {
  switch (type) {
    case CASHIER_EVENT.priceChanged: {
      const diff = bigOf(p.diffMinor);
      const qty = decimalOf(p.quantity);
      // Tile ham AYNAN shunday sanaydi: dona farqi × miqdor.
      return diff != null && qty != null ? (diff * qty).toString() : null;
    }
    case CASHIER_EVENT.soldBelowCost:
      return bigOf(p.lossMinor)?.toString() ?? null;
    case CASHIER_EVENT.soldOnCredit:
      return bigOf(p.debtMinor)?.toString() ?? null;
    default:
      return bigOf(p.sumMinor)?.toString() ?? null;
  }
}

/** Payload'dagi pul DOIM matn (BigInt JSON'ga sig'maydi) — son deb o'qilmaydi. */
function bigOf(v: unknown): bigint | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

function decimalOf(v: unknown): bigint | null {
  if (v == null) return null;
  const s = String(v);
  if (!/^-?\d+(\.0+)?$/.test(s)) return null;
  return BigInt(s.split('.')[0] ?? s);
}
