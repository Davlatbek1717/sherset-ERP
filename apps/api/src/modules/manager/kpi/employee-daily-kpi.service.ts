import type { Prisma } from '@moysklad/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { localDateOnly, startOfLocalDay } from '../../hr/hr-shared/tz.util.js';
import { DATA_QUALITY, aggregateQuality, countSamples } from '../../report/metrics/index.js';
import { CASHIER_EVENT } from '../../retail-sale/cashier-audit.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
import { KPI_METRICS, type MetricValue, measured, unmeasured } from './kpi-metrics.js';
import {
  type EmployeeTargetRow,
  type ResolvedTarget,
  TARGET_PERIOD,
  manualDailyOutcome,
  resolveDailyTargets,
} from './kpi-target.js';

/**
 * Kunlik xodim KPI snapshot (menejer TZ kengaytmasi, 4M.1).
 *
 * Bu servis FAQAT o'lchaydi. Qabul qilish, tuzatish va oylikka o'tkazish —
 * keyingi bosqichlar (4M.2 / 4M.3). Shu sababli u hech qachon `state` ni
 * o'zgartirmaydi va menejer tuzatmasiga (`adjustValue`) TEGMAYDI.
 *
 * IDEMPOTENT: bir kunni qayta hisoblash mavjud qatorni yangilaydi. Qayta
 * hisoblash **faqat `autoValue` va `complete`** ni yozadi — tuzatma va holat
 * saqlanadi. Aks holda menejer tuzatgan raqam tungi cron bilan jimgina
 * o'chib ketardi.
 *
 * Manbalar — faqat BUGUN mavjud bo'lganlar:
 *   kassa      `CashierSession` (smena agregatlari) + `CashierAuditEvent`
 *   kassa foyda `RetailSalePosition.costMinor` (1.1 da muzlatilgan)
 *   sotuv      `Demand` (`ownerId`, posted)
 *   davomat    `HrAttendance`
 *   vazifa     `Task`
 *   ombor      `RestockTaskLine.confirmedById`
 */
@Injectable()
export class EmployeeDailyKpiService {
  private readonly logger = new Logger(EmployeeDailyKpiService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DailyKpiAcceptanceService) private readonly acceptance: DailyKpiAcceptanceService,
  ) {}

  /**
   * Bitta hisob + bitta kunni hisoblaydi. Yozilgan xodim qatorlari sonini
   * qaytaradi. Cron ham, qo'lda ishga tushirish ham shuni chaqiradi.
   */
  async computeDay(accountId: string, day: Date): Promise<{ written: number; stale: number }> {
    const dayStart = startOfLocalDay(day);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dateOnly = localDateOnly(day);

    const employees = await this.prisma.client.employee.findMany({
      where: { accountId, archived: false },
      select: { id: true, positionId: true, departmentId: true },
    });
    if (employees.length === 0) return { written: 0, stale: 0 };

    const [
      cashier,
      cashProfit,
      sales,
      attendance,
      tasks,
      picking,
      profileVersions,
      employeeTargets,
    ] = await Promise.all([
      this.cashierMetrics(accountId, dayStart, dayEnd),
      this.cashierProfit(accountId, dayStart, dayEnd),
      this.salesMetrics(accountId, dayStart, dayEnd),
      this.attendanceMetrics(accountId, dayStart, dayEnd),
      this.taskMetrics(accountId, dayStart, dayEnd),
      this.pickingMetrics(accountId, dayStart, dayEnd),
      this.resolveProfileVersions(accountId, dateOnly),
      this.loadEmployeeTargets(accountId),
    ]);

    // Hisobning O'Z ko'rsatkichlari — tizim hisoblamaydi, lekin qatori bo'lishi
    // kerak (menejer faktni faqat mavjud qatorga kiritadi). `direction` KPI-03
    // uchun kerak: fakt faqat «ko'p = yaxshi» ko'rsatkichda to'qiladi.
    const manualDefs = await this.prisma.client.kpiMetricDef.findMany({
      where: { accountId, source: 'manual', archived: false },
      select: { key: true, direction: true },
    });

    // Kun YORLIG'I (`YYYY-MM-DD`) — maqsad qatlami tz'siz, taqqoslash yorliq
    // ustidan (`kpi-target.ts` shartnomasi).
    const dateLabel = dayLabel(dateOnly);

    let written = 0;
    const staleCandidates: string[] = [];
    for (const emp of employees) {
      const targetRows = employeeTargets.get(emp.id) ?? [];
      // Qo'lda ko'rsatkichning fakti biriktirilgan qatordan keladi — faqat
      // KUNLIK qator (haftalik/oylik kunga bo'linmaydi).
      const manualRows = new Map(
        targetRows
          .filter((t) => t.period === TARGET_PERIOD.daily && t.active)
          .map((t) => [t.metricKey, t]),
      );

      const values: MetricValue[] = [
        ...(cashier.get(emp.id) ?? emptyFor('cashier')),
        ...(cashProfit.get(emp.id) ?? [unmeasured('cash_gross_profit')]),
        ...(sales.get(emp.id) ?? emptyFor('sales')),
        ...(attendance.get(emp.id) ?? emptyFor('attendance')),
        ...(tasks.get(emp.id) ?? emptyFor('task')),
        ...(picking.get(emp.id) ?? emptyFor('warehouse')),
        // Hisobning O'Z ko'rsatkichlari (`manual`): tizim ularni hisoblay
        // olmaydi, shuning uchun qator ochiladi. Qator BO'LISHI shart —
        // menejer faktni faqat mavjud qatorga kirita oladi; qatorsiz
        // ko'rsatkich ekranda ko'rinib turib, tegib bo'lmaydigan bo'lardi.
        //
        // KPI-03: biriktirilgan KPI bo'lsa fakt menejer belgisidan keladi
        // (`manualDoneAt`), aks holda avvalgidek O'LCHANMAGAN qoladi.
        ...manualDefs.map((def) => {
          const row = manualRows.get(def.key);
          if (row == null || !isManualScorable(def.direction)) return unmeasured(def.key);
          return measured(def.key, manualDailyOutcome(row, dateLabel).fact);
        }),
      ];

      const workedMinutes = numberOf(values.find((v) => v.key === 'worked_minutes')?.value);
      // Kun to'liq bo'lishi uchun O'LCHANGAN ko'rsatkichlarning hammasi to'liq
      // bo'lishi kerak. O'lchanmagan (null) ko'rsatkich kunni chala qilmaydi —
      // masalan buxgalterda kassa ko'rsatkichi umuman bo'lmaydi, bu kamchilik
      // emas. Chala = «o'lchandi, lekin manba to'liq emas edi».
      //
      // Qoida SHU YERDA yozilmaydi — u `report/metrics/data-quality.ts` da
      // (MK09). Ilgari bu shart shu satrda qo'lda turardi va panel bayrog'i
      // bilan kunning `dataComplete` bayrog'i bir kun kelib ikki xil bo'lib
      // ketishi mumkin edi.
      const dataComplete = aggregateQuality(countSamples(values)) !== DATA_QUALITY.partial;
      // Profil tanlash: XODIM (individual) → LAVOZIM → hisob sukut profili.
      const profile =
        profileVersions.byEmployee.get(emp.id) ??
        (emp.positionId ? profileVersions.byPosition.get(emp.positionId) : undefined) ??
        profileVersions.byPosition.get(DEFAULT_PROFILE_KEY) ??
        null;

      // Maqsad pog'onalari: biriktirilgan KPI > `KpiTarget` ustamasi > profil.
      // `KpiTarget` DB modeli hali YO'Q (MK13 sof funksiya bo'lib qolgan) —
      // shuning uchun o'rta pog'ona bo'sh massiv bilan uzatiladi; qatlam
      // qo'shilganda faqat shu argument to'ladi, ustuvorlik mantiqi esa
      // yagona joyda (`kpi-target.ts`) qoladi.
      const resolved = resolveDailyTargets(
        [],
        {
          accountId,
          employeeId: emp.id,
          positionId: emp.positionId,
          departmentId: emp.departmentId,
        },
        dateLabel,
        profile?.targets ?? new Map(),
        targetRows,
      );

      const { staleCandidate } = await this.upsertDay(accountId, emp.id, dateOnly, {
        profileVersionId: profile?.versionId ?? null,
        dataComplete,
        workedMinutes,
        values,
        targets: sealTargets(values, resolved, manualRows, manualDefs, dateLabel),
      });
      if (staleCandidate) staleCandidates.push(emp.id);
      written++;
    }

    // Muzlagan kunning raqami o'zgargan bo'lsa — FSM orqali `stale` ga
    // o'tkazamiz (jurnal + optimistik da'vo bilan). Tranzaksiyadan TASHQARIDA:
    // holat o'zgarishi o'z da'vosini oladi va menejerning parallel qarori
    // ustun turadi.
    let stale = 0;
    for (const employeeId of staleCandidates) {
      const { marked } = await this.acceptance.markStale(accountId, employeeId, dateOnly);
      stale += marked;
    }
    return { written, stale };
  }

  /**
   * Kechagi kunni barcha hisoblar bo'yicha hisoblaydi (cron kirish nuqtasi),
   * so'ng yopilgan kunlarni menejer navbatiga qo'yadi va javobsiz qolganlarini
   * egaga eskalatsiya qiladi (4M.2).
   *
   * Tartib muhim: avval HISOBLASH, keyin NAVBAT. Aks holda hali hisoblanmagan
   * kun navbatga tushib, menejer bo'sh ekran ko'rardi.
   */
  async computeYesterdayAllAccounts(): Promise<void> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const accounts = await this.prisma.client.account.findMany({ select: { id: true } });
    for (const acc of accounts) {
      try {
        const { written, stale } = await this.computeDay(acc.id, yesterday);
        const { opened } = await this.acceptance.openForReview(acc.id);
        const { escalated } = await this.acceptance.escalateOverdue(acc.id);
        this.logger.log(
          `KPI[${acc.id}]: ${written} kun hisoblandi · ${stale} eskirdi · ${opened} navbatga · ${escalated} eskalatsiya`,
        );
      } catch (e) {
        // Bitta hisobning xatosi qolganlarini to'xtatmasin.
        this.logger.error(`KPI[${acc.id}] yiqildi: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // ── Manbalar ──────────────────────────────────────────────────────────────

  /**
   * Kassa: smena agregatlari + audit hodisalari.
   *
   * Kassir o'qi — `CashierSession.cashierId` va `CashierAuditEvent.employeeId`.
   * `RetailSale.ownerId` ATAYLAB ishlatilmaydi: qaytarishda u AKTYORGA
   * yoziladi (admin bo'lishi mumkin), ya'ni «kim qildi» degan savolga noto'g'ri
   * javob beradi (analitika TZ X2).
   */
  private async cashierMetrics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const [sessions, events] = await Promise.all([
      this.prisma.client.cashierSession.findMany({
        where: { accountId, openedAt: { gte: from, lt: to } },
        select: {
          cashierId: true,
          salesSumMinor: true,
          salesCount: true,
          discrepancyMinor: true,
        },
      }),
      this.prisma.client.cashierAuditEvent.findMany({
        where: { accountId, createdAt: { gte: from, lt: to } },
        select: { employeeId: true, type: true, payload: true },
      }),
    ]);

    const out = new Map<string, MetricValue[]>();
    const acc = new Map<
      string,
      {
        revenue: bigint;
        receipts: number;
        variance: bigint;
        discount: bigint;
        belowCostCount: number;
        belowCostLoss: bigint;
        cancels: number;
        refunds: number;
        credit: bigint;
      }
    >();
    const bucket = (id: string) => {
      let b = acc.get(id);
      if (!b) {
        b = {
          revenue: 0n,
          receipts: 0,
          variance: 0n,
          discount: 0n,
          belowCostCount: 0,
          belowCostLoss: 0n,
          cancels: 0,
          refunds: 0,
          credit: 0n,
        };
        acc.set(id, b);
      }
      return b;
    };

    for (const s of sessions) {
      const b = bucket(s.cashierId);
      b.revenue += s.salesSumMinor;
      b.receipts += s.salesCount;
      // Modul: −5 000 ham, +5 000 ham bir xil darajada muammo.
      const d = s.discrepancyMinor ?? 0n;
      b.variance += d < 0n ? -d : d;
    }

    for (const e of events) {
      const b = bucket(e.employeeId);
      const p = (e.payload ?? {}) as Record<string, unknown>;
      switch (e.type) {
        case CASHIER_EVENT.priceChanged: {
          // `diffMinor` = sotilgan narx − kartochka narxi (dona uchun).
          // Manfiy = tushirilgan. Faqat tushirilgani chegirma hisoblanadi.
          const diff = bigOf(p.diffMinor);
          const qty = decimalOf(p.quantity);
          if (diff != null && diff < 0n && qty != null) b.discount += -diff * qty;
          break;
        }
        case CASHIER_EVENT.soldBelowCost: {
          b.belowCostCount++;
          b.belowCostLoss += bigOf(p.lossMinor) ?? 0n;
          break;
        }
        case CASHIER_EVENT.saleCancelled:
          b.cancels++;
          break;
        case CASHIER_EVENT.refund:
          b.refunds++;
          break;
        case CASHIER_EVENT.soldOnCredit:
          b.credit += bigOf(p.debtMinor) ?? 0n;
          break;
        default:
          break;
      }
    }

    for (const [id, b] of acc) {
      out.set(id, [
        measured('cash_revenue', b.revenue),
        measured('receipt_count', BigInt(b.receipts)),
        measured('till_variance_abs', b.variance),
        measured('discount_given', b.discount),
        measured('below_cost_count', BigInt(b.belowCostCount)),
        measured('below_cost_loss', b.belowCostLoss),
        measured('cancel_count', BigInt(b.cancels)),
        measured('refund_count', BigInt(b.refunds)),
        measured('credit_given', b.credit),
      ]);
    }
    return out;
  }

  /**
   * Kassa yalpi foydasi — 1.1 da MUZLATILGAN tan narxdan.
   *
   * Bu yerda NULL ≠ 0 shartnomasi to'liq ishlaydi: `costMinor` NULL bo'lgan
   * qator «tan narx yig'ilmagan» degani. Uni nolga aylantirish foydani
   * oshirib ko'rsatardi (aynan `profitability` da 1.2 gacha bo'lgan xato).
   * Shuning uchun bunday qator foydaga QO'SHILMAYDI va ko'rsatkich
   * `complete: false` deb belgilanadi — menejer buni ekranda ko'radi.
   */
  private async cashierProfit(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const positions = await this.prisma.client.retailSalePosition.findMany({
      where: {
        accountId,
        retailSale: { state: 'posted', postedAt: { gte: from, lt: to } },
      },
      select: {
        sumMinor: true,
        costMinor: true,
        quantity: true,
        retailSale: { select: { session: { select: { cashierId: true } } } },
      },
    });

    const acc = new Map<string, { profit: bigint; complete: boolean }>();
    for (const p of positions) {
      const cashierId = p.retailSale.session.cashierId;
      let b = acc.get(cashierId);
      if (!b) {
        b = { profit: 0n, complete: true };
        acc.set(cashierId, b);
      }
      if (p.costMinor == null) {
        b.complete = false;
        continue;
      }
      const qty = decimalOf(p.quantity) ?? 0n;
      b.profit += p.sumMinor - p.costMinor * qty;
    }

    const out = new Map<string, MetricValue[]>();
    for (const [id, b] of acc) {
      out.set(id, [measured('cash_gross_profit', b.profit, b.complete)]);
    }
    return out;
  }

  /**
   * Sotuv: posted `Demand` bo'yicha xodim tushumi va yalpi foydasi.
   *
   * ⚠️ To'liqlik EVRISTIKA: `Demand.costSumMinor` NULL bo'la olmaydi (sxemada
   * `default(0)`), shuning uchun «tan narx yig'ilmagan» ni aniq bilib bo'lmaydi.
   * Yagona ishonchli signal — summasi bor, lekin tan narxi nol hujjat.
   * Bu chala baho, va shuning uchun bayroq qo'yiladi, raqam esa o'zgartirilmaydi.
   */
  private async salesMetrics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const demands = await this.prisma.client.demand.findMany({
      where: {
        accountId,
        state: 'posted',
        deletedAt: null,
        postedAt: { gte: from, lt: to },
        ownerId: { not: null },
      },
      select: { ownerId: true, sumMinor: true, costSumMinor: true },
    });

    const acc = new Map<string, { revenue: bigint; cost: bigint; complete: boolean }>();
    for (const d of demands) {
      if (!d.ownerId) continue;
      let b = acc.get(d.ownerId);
      if (!b) {
        b = { revenue: 0n, cost: 0n, complete: true };
        acc.set(d.ownerId, b);
      }
      b.revenue += d.sumMinor;
      b.cost += d.costSumMinor;
      if (d.sumMinor > 0n && d.costSumMinor === 0n) b.complete = false;
    }

    const out = new Map<string, MetricValue[]>();
    for (const [id, b] of acc) {
      out.set(id, [
        measured('sales_revenue', b.revenue),
        measured('gross_profit', b.revenue - b.cost, b.complete),
      ]);
    }
    return out;
  }

  /** Davomat: ishlangan daqiqa va kechikish. */
  private async attendanceMetrics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const rows = await this.prisma.client.hrAttendance.findMany({
      where: { accountId, deletedAt: null, checkInTime: { gte: from, lt: to } },
      select: { employeeId: true, checkInTime: true, checkOutTime: true, lateMinutes: true },
    });

    const acc = new Map<string, { worked: number; late: number; open: boolean }>();
    for (const r of rows) {
      let b = acc.get(r.employeeId);
      if (!b) {
        b = { worked: 0, late: 0, open: false };
        acc.set(r.employeeId, b);
      }
      b.late += r.lateMinutes;
      if (r.checkOutTime) {
        b.worked += Math.max(
          0,
          Math.round((r.checkOutTime.getTime() - r.checkInTime.getTime()) / 60000),
        );
      } else {
        // Ketish qayd etilmagan — ishlangan vaqt CHALA. Taxminiy raqam
        // yozilsa, u soatga normallashtirish orqali butun KPI'ga tarqaladi.
        b.open = true;
      }
    }

    const out = new Map<string, MetricValue[]>();
    for (const [id, b] of acc) {
      out.set(id, [
        b.worked > 0
          ? measured('worked_minutes', BigInt(b.worked), !b.open)
          : unmeasured('worked_minutes'),
        measured('late_minutes', BigInt(b.late)),
      ]);
    }
    return out;
  }

  /** Vazifa: shu kuni bajarilgan va muddati o'tgan (hali bajarilmagan). */
  private async taskMetrics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const [done, overdue] = await Promise.all([
      this.prisma.client.task.groupBy({
        by: ['assigneeId'],
        where: { accountId, completedAt: { gte: from, lt: to }, assigneeId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.client.task.groupBy({
        by: ['assigneeId'],
        where: { accountId, done: false, dueAt: { lt: to }, assigneeId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const out = new Map<string, MetricValue[]>();
    const put = (id: string | null, v: MetricValue) => {
      if (!id) return;
      const list = out.get(id) ?? [];
      list.push(v);
      out.set(id, list);
    };
    for (const r of done) put(r.assigneeId, measured('tasks_done', BigInt(r._count._all)));
    for (const r of overdue) put(r.assigneeId, measured('tasks_overdue', BigInt(r._count._all)));
    return out;
  }

  /**
   * Ombor: yig'ilgan qator soni.
   *
   * Manba `RestockTaskLine.confirmedById` — topshiriqning `assigneeId` si EMAS:
   * topshiriq bir odamga biriktirilib, boshqasi yig'ishi mumkin. «Kim qildi»
   * degan savolga qator darajasidagi tasdiq javob beradi.
   */
  private async pickingMetrics(
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, MetricValue[]>> {
    const rows = await this.prisma.client.restockTaskLine.groupBy({
      by: ['confirmedById'],
      where: { accountId, confirmedAt: { gte: from, lt: to }, confirmedById: { not: null } },
      _count: { _all: true },
    });
    const out = new Map<string, MetricValue[]>();
    for (const r of rows) {
      if (!r.confirmedById) continue;
      out.set(r.confirmedById, [measured('picked_lines', BigInt(r._count._all))]);
    }
    return out;
  }

  // ── Maqsad qatlamlari ─────────────────────────────────────────────────────

  /**
   * Biriktirilgan KPI qatorlari (KPI-01) — xodim bo'yicha guruhlangan.
   *
   * FAQAT `active` qatorlar: arxivlangani tarixda qoladi (muhrlangan kunlar
   * uni ko'rsatib turadi), lekin yangi kunlarga ta'sir qilmaydi.
   */
  private async loadEmployeeTargets(accountId: string): Promise<Map<string, EmployeeTargetRow[]>> {
    const rows = await this.prisma.client.employeeKpiTarget.findMany({
      where: { accountId, active: true },
      select: {
        id: true,
        employeeId: true,
        metricKey: true,
        period: true,
        targetValue: true,
        manualDoneAt: true,
        active: true,
      },
    });

    const out = new Map<string, EmployeeTargetRow[]>();
    for (const r of rows) {
      const list = out.get(r.employeeId) ?? [];
      list.push({
        id: r.id,
        employeeId: r.employeeId,
        metricKey: r.metricKey,
        period: r.period as EmployeeTargetRow['period'],
        targetValue: r.targetValue,
        // Instant → MAHALLIY KUN YORLIG'I. Sof modul tz bilmaydi, va bu
        // aylantirish aynan `localDateOnly` bilan qilinadi: instant bo'yicha
        // taqqoslash belgini bir kunga surib yuborardi.
        manualDoneDate: r.manualDoneAt == null ? null : dayLabel(localDateOnly(r.manualDoneAt)),
        active: r.active,
      });
      out.set(r.employeeId, list);
    }
    return out;
  }

  /**
   * Lavozim → o'sha kunda AMAL QILGAN profil versiyasi (TZ §2.3).
   *
   * Kun o'z versiyasiga havola qilib turadi, shuning uchun keyin og'irlik
   * o'zgartirilsa ham o'tgan kun raqami o'zgarmaydi.
   *
   * 🔎 BIRINCHI VERSIYA ORQAGA HAM AMAL QILADI (2026-08-04 runtime QA topilmasi).
   * Muammo: `saveEmployeeConfig` yangi versiyani `effectiveFrom = BUGUN` bilan
   * yozadi, dvigatel esa `effectiveFrom <= kun` shartini qo'yadi. Ya'ni menejer
   * KPI'ni birinchi marta sozlaganda allaqachon hisoblangan BARCHA kunlar
   * profilsiz qolar va abadiy «ball yo'q» bo'lib turardi — qabul qilish esa
   * aynan ballga tayanadi.
   *
   * Nega bu muzlatish shartnomasini BUZMAYDI: shartnoma og'irlik
   * O'ZGARTIRILGANDA o'tgan kunni qayta yozmaslik haqida. Birinchi versiyada
   * o'zgartiriladigan tarix YO'Q (hech bir kun ballanmagan), qabul qilingan
   * kunlar esa `scorePercent` da muzlagan va ular baribir tegilmaydi.
   * Shu sababli fallback FAQAT eng erta versiyaga va faqat mos versiya
   * topilmaganda ishlaydi.
   */
  private async resolveProfileVersions(
    accountId: string,
    day: Date,
  ): Promise<{ byEmployee: Map<string, ProfilePick>; byPosition: Map<string, ProfilePick> }> {
    const profiles = await this.prisma.client.kpiProfile.findMany({
      where: { accountId, archived: false },
      select: {
        positionId: true,
        employeeId: true,
        // Barcha versiyalar o'sish tartibida — tanlash JS'da (profil boshiga
        // versiyalar soni kichik, va bitta so'rovda ikki xil `take: 1` ni
        // Prisma bermaydi).
        versions: {
          orderBy: [{ effectiveFrom: 'asc' }, { version: 'asc' }],
          select: {
            id: true,
            effectiveFrom: true,
            // KPI-03: maqsad ENG PAST pog'ona sifatida shu yerdan o'qiladi —
            // ilgari uni faqat o'quvchi (`scoreRow`) join qilardi, ya'ni har
            // o'qishda qayta hisoblanardi.
            metrics: { select: { target: true, metricDef: { select: { key: true } } } },
          },
        },
      },
    });
    const byEmployee = new Map<string, ProfilePick>();
    const byPosition = new Map<string, ProfilePick>();
    for (const p of profiles) {
      const effective = [...p.versions].reverse().find((v) => v.effectiveFrom <= day);
      const version = effective ?? p.versions[0];
      if (!version) continue;
      const pick: ProfilePick = {
        versionId: version.id,
        targets: new Map((version.metrics ?? []).map((m) => [m.metricDef.key, m.target])),
      };
      // Individual (employeeId) profil lavozim profilidan ustun — u byEmployee'ga
      // tushadi va resolution xodimni avval shu yerdan qidiradi.
      if (p.employeeId) byEmployee.set(p.employeeId, pick);
      else byPosition.set(p.positionId ?? DEFAULT_PROFILE_KEY, pick);
    }
    return { byEmployee, byPosition };
  }

  // ── Yozish ────────────────────────────────────────────────────────────────

  private async upsertDay(
    accountId: string,
    employeeId: string,
    date: Date,
    data: {
      profileVersionId: string | null;
      dataComplete: boolean;
      workedMinutes: number | null;
      values: MetricValue[];
      /** Ko'rsatkich kaliti → o'sha kunga MUHRLANADIGAN maqsad (KPI-03). */
      targets: Map<string, SealedTarget>;
    },
  ): Promise<{ staleCandidate: boolean }> {
    let staleCandidate = false;
    await this.prisma.client.$transaction(async (tx) => {
      // `state` ATAYLAB yozilmaydi — qayta hisoblash menejer qabul qilgan
      // kunni «hisoblandi» ga qaytarib yubormasligi kerak (4M.2 mantiqi).
      const day = await tx.employeeDailyKpi.upsert({
        where: { accountId_employeeId_date: { accountId, employeeId, date } },
        create: {
          accountId,
          employeeId,
          date,
          profileVersionId: data.profileVersionId,
          dataComplete: data.dataComplete,
          workedMinutes: data.workedMinutes,
        },
        update: {
          profileVersionId: data.profileVersionId,
          dataComplete: data.dataComplete,
          workedMinutes: data.workedMinutes,
          computedAt: new Date(),
        },
        select: {
          id: true,
          state: true,
          metrics: { select: { metricKey: true, autoValue: true } },
        },
      });

      const before = new Map(day.metrics.map((m) => [m.metricKey, m.autoValue]));

      for (const v of data.values) {
        const seal = data.targets.get(v.key) ?? NO_TARGET;
        await tx.employeeDailyKpiMetric.upsert({
          where: { dailyKpiId_metricKey: { dailyKpiId: day.id, metricKey: v.key } },
          create: {
            accountId,
            dailyKpiId: day.id,
            metricKey: v.key,
            autoValue: v.value,
            complete: v.complete,
            // 🔴 MUHR FAQAT SHU YERDA (`create`) — reja §KPI-03.2.
            targetValue: seal.value,
            targetSource: seal.source,
          },
          // FAQAT avtomat qiymat yangilanadi. `adjustValue` va `reasonCode`
          // menejerniki — tungi cron ularni o'chirib yubormaydi.
          //
          // 🔴 MAQSAD HAM YO'Q: `EmployeeKpiTarget` versiyalanmaydi, ya'ni
          // «o'tgan oy qayta yozilmasin» kafolati (§2.3) faqat shu muhrda
          // yashaydi. Maqsad bu yerga qo'shilsa, bugungi tahrir qayta hisoblash
          // paytida o'tgan kunning bajarish foizini va ballini o'zgartirardi.
          update: { autoValue: v.value, complete: v.complete },
        });
      }

      // ESKIRISH (TZ §3.4): qabul qilingan kunning raqami qayta hisoblashda
      // o'zgargan bo'lsa (chek tahrirlandi, qaytarish kiritildi) — kun JIMGINA
      // yangilanmaydi. Bu yerda faqat NOMZOD deb belgilanadi; haqiqiy o'tishni
      // `DailyKpiAcceptanceService.markStale()` qiladi, chunki holat o'zgarishi
      // FAQAT FSM orqali va jurnal yozuvi bilan bo'lishi kerak.
      //
      // Manba hujjatlarga hook osish ATAYLAB tanlanmadi: ~130 modulning har
      // biriga ulanish to'lanmagan qarz bo'lib qolardi; qayta hisoblash esa
      // allaqachon hamma manbani o'qiydi.
      if (FROZEN_STATES.includes(day.state)) {
        staleCandidate = data.values.some(
          (v) => before.has(v.key) && before.get(v.key) !== v.value,
        );
      }
    });
    return { staleCandidate };
  }
}

/** Muzlagan holatlar — «eskirish» tushunchasi faqat ular uchun mavjud. */
const FROZEN_STATES: readonly string[] = ['accepted', 'force_accepted'];

const DEFAULT_PROFILE_KEY = '__default__';

/** O'sha kunda amal qilgan profil versiyasi va uning maqsadlari. */
interface ProfilePick {
  versionId: string;
  /** Ko'rsatkich kaliti → profil maqsadi (NULL = qo'yilmagan). */
  targets: Map<string, bigint | null>;
}

/** Kun qatoriga muhrlanadigan maqsad (`EmployeeDailyKpiMetric`). */
interface SealedTarget {
  value: bigint | null;
  source: ResolvedTarget['source'];
}

/** Hech bir pog'onada maqsad topilmagani — MUHRLANADI, bo'sh qoldirilmaydi. */
const NO_TARGET: SealedTarget = { value: null, source: 'none' };

/** `Date` (UTC yarim tun yorlig'i) → `YYYY-MM-DD`. */
function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Qo'lda ko'rsatkichga fakt TO'QISH mumkinmi.
 *
 * Faqat «ko'p = yaxshi» yo'nalishida: `lower_better` da «bajarilmadi» → fakt 0
 * bo'lardi, bu esa `kpi-score.ts` formulasida 200% (ya'ni ishlamaslik
 * MUKOFOTLANARDI). Bunday ko'rsatkich o'lchanmagan bo'lib qoladi va menejer
 * buni ekranda `skipReason: 'unmeasured'` bilan ochiq ko'radi.
 */
function isManualScorable(direction: string): boolean {
  return direction === 'higher_better';
}

/**
 * Har ko'rsatkich uchun muhrlanadigan maqsad.
 *
 * Qo'lda ko'rsatkich ISTISNO: uning maqsadi `manualDailyOutcome` dan keladi,
 * chunki raqamsiz («todo») KPI ga shartli birlik beriladi — aks holda maqsad
 * NULL bo'lib, «bajarildi» belgisi hech qachon ballga aylanmasdi.
 */
function sealTargets(
  values: readonly MetricValue[],
  resolved: ReadonlyMap<string, ResolvedTarget>,
  manualRows: ReadonlyMap<string, EmployeeTargetRow>,
  manualDefs: ReadonlyArray<{ key: string; direction: string }>,
  dateLabel: string,
): Map<string, SealedTarget> {
  const manualScorable = new Set(
    manualDefs.filter((d) => isManualScorable(d.direction)).map((d) => d.key),
  );

  const out = new Map<string, SealedTarget>();
  for (const v of values) {
    const manual = manualScorable.has(v.key) ? manualRows.get(v.key) : undefined;
    if (manual) {
      out.set(v.key, {
        value: manualDailyOutcome(manual, dateLabel).target,
        source: 'employee_target',
      });
      continue;
    }
    const r = resolved.get(v.key);
    out.set(v.key, r == null ? NO_TARGET : { value: r.value, source: r.source });
  }
  return out;
}

/** Manba bo'yicha «o'lchanmagan» to'plam — xodimda o'sha faoliyat bo'lmasa. */
function emptyFor(source: string): MetricValue[] {
  return KPI_METRICS.filter((m) => m.source === source && m.key !== 'cash_gross_profit').map((m) =>
    unmeasured(m.key),
  );
}

function bigOf(v: unknown): bigint | null {
  if (typeof v !== 'string' || v === '') return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

/** Decimal/`string` miqdorni butun songa (POS butun dona sotadi). */
function decimalOf(v: unknown): bigint | null {
  const s = typeof v === 'string' ? v : v == null ? null : String(v);
  if (s == null || s === '') return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.round(n));
}

function numberOf(v: bigint | null | undefined): number | null {
  return v == null ? null : Number(v);
}

export type { Prisma };
