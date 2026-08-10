import type { Prisma } from '@moysklad/db';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
// TZ §3.4 — tuzatuvchi qator qoidalari (sof modul, 17 test).
import { PAYROLL_SALES_METRIC_KEY } from '../../hr/hr-salary/payroll-acceptance.util.js';
import { localDateOnly, startOfLocalDay } from '../../hr/hr-shared/tz.util.js';
import { ManagerCommentTemplateService } from '../comments/manager-comment-template.service.js';
import {
  ACTOR,
  type Actor,
  DAILY_KPI_ACTION,
  DAILY_KPI_STATE,
  type DailyKpiAction,
  type DailyKpiState,
  ESCALATE_AFTER_DAYS,
  type FsmFailure,
  QUEUE_STATES,
  countsTowardPayroll,
  evaluate,
  evaluateAdjust,
} from './daily-kpi-fsm.js';
import {
  type AccrualDecision,
  type AccrualRuleInput,
  KPI_ACCRUAL_REVERSAL_SOURCE,
  KPI_ACCRUAL_SOURCE,
  planAccrual,
  planReversalRows,
} from './kpi-accrual.js';
import { correctionPeriod, planCorrection } from './kpi-correction.js';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';
import {
  BUILT_IN_CATALOG,
  type MetricCatalog,
  deviationPercent,
  metricDef,
  perHourValue,
} from './kpi-metrics.js';
import { type DayScore, type ScoreMetricInput, scoreDay } from './kpi-score.js';

/**
 * Kunlik KPI qabul qilish servisi (menejer TZ §3, bosqich 4M.2).
 *
 * QOIDA SHU YERDA EMAS — u `daily-kpi-fsm.ts` da. Bu servis FSM javobini
 * bajaradi va bazaga yozadi, xolos. Sabab: `supply-approval` da o'tish jadvali
 * yozilgan-u, servis uni IMPORT QILMAGAN — har chaqiruv joyida from/to qo'lda
 * yozilgan va jadval faqat testlarda ishlagan. Ya'ni qoida ikkiga bo'linib
 * ketgan. Bu yerda `evaluate()` dan boshqa yo'l yo'q.
 *
 * ATOMLIK: holat o'zgarishi **optimistik da'vo** bilan olinadi —
 * `updateMany({ where: { id, accountId, state: from } })`. `count === 0` = kimdir
 * bizdan oldin ulgurdi (409). Da'vo va jurnal yozuvi BITTA tranzaksiyada
 * ketadi — jurnalsiz o'tish audit izini teshib qo'yadi.
 */
@Injectable()
export class DailyKpiAcceptanceService {
  private readonly logger = new Logger(DailyKpiAcceptanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(KpiMetricCatalogService) private readonly catalog: KpiMetricCatalogService,
    /**
     * MK20 — shablon izohlar. Jurnalga shablon MATNI ko'chiriladi (havola
     * emas): shablon keyin tahrirlansa kechagi qaror o'zgarmasligi kerak.
     */
    @Inject(ManagerCommentTemplateService)
    private readonly commentTemplates: ManagerCommentTemplateService,
  ) {}

  // ── Navbat ────────────────────────────────────────────────────────────────

  /**
   * Menejer navbati. Tartib — TZ §3.5: «og'ishli kunlar birinchi».
   *
   * Tartib qoidasi ATAYLAB oddiy va ko'rinadigan: e'tibor signallari SANALADI
   * (ma'lumot chala · eskirgan · eskalatsiya · kam-yaxshi ko'rsatkich noldan
   * katta). Bu REYTING EMAS — kompozit ball va uning formulasi 4M.10 ga
   * qoldirilgan va bu yerda o'ylab topilmaydi. Bu faqat navbat tartibi.
   */
  async queue(
    accountId: string,
    filter: {
      dateFrom?: Date;
      dateTo?: Date;
      employeeId?: string;
      states?: DailyKpiState[];
      limit?: number;
    } = {},
  ) {
    const states = filter.states?.length ? filter.states : [...QUEUE_STATES];
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);

    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: {
        accountId,
        state: { in: states },
        ...(filter.employeeId && { employeeId: filter.employeeId }),
        ...(filter.dateFrom || filter.dateTo
          ? {
              date: {
                ...(filter.dateFrom && { gte: localDateOnly(filter.dateFrom) }),
                ...(filter.dateTo && { lte: localDateOnly(filter.dateTo) }),
              },
            }
          : {}),
      },
      select: {
        id: true,
        date: true,
        state: true,
        dataComplete: true,
        workedMinutes: true,
        staleAt: true,
        stateChangedAt: true,
        scorePercent: true,
        scoreCoverage: true,
        employee: { select: EMPLOYEE_SELECT },
        metrics: { select: SCORABLE_METRIC_SELECT },
        profileVersion: { select: PROFILE_METRIC_SELECT },
      },
      orderBy: [{ date: 'desc' }],
      take: limit,
    });

    const items = rows
      .map((r) => {
        const signals = attentionSignals(r);
        // MUZLAGAN kun uchun qabul paytidagi ball ko'rsatiladi, jonli qayta
        // hisoblangani EMAS — aks holda ro'yxat va to'langan oylik bir-biriga
        // zid bo'lardi (og'irlik keyin o'zgargan bo'lishi mumkin).
        const frozen = r.scorePercent == null ? null : Number(r.scorePercent);
        const live = scoreRow(r);
        return {
          id: r.id,
          date: r.date,
          state: r.state as DailyKpiState,
          dataComplete: r.dataComplete,
          workedMinutes: r.workedMinutes,
          staleAt: r.staleAt,
          stateChangedAt: r.stateChangedAt,
          employee: {
            id: r.employee.id,
            name: r.employee.name,
            position: employeePosition(r.employee),
          },
          attentionSignals: signals,
          /** Ish yuki konteksti — «kam sotdi» xulosasi shusiz noto'g'ri (§3.5). */
          revenuePerHourMinor: perHourValue(
            metricValue(r.metrics, 'cash_revenue'),
            r.workedMinutes,
          )?.toString(),
          receiptCount: Number(metricValue(r.metrics, 'receipt_count') ?? 0n),
          /**
           * Kompozit ball (og'irlik × bajarish %). NULL = hech narsa
           * ballanmadi (profil/maqsad yo'q) — bu «0%» EMAS.
           */
          score: frozen ?? live.score,
          scoreFrozen: frozen,
          coverage:
            frozen != null && r.scoreCoverage != null ? Number(r.scoreCoverage) : live.coverage,
          hasProfile: r.profileVersion != null,
          adjustedCount: r.metrics.filter((m) => m.adjustValue != null).length,
          summary: SUMMARY_KEYS.map((key) => ({
            key,
            value: metricValue(r.metrics, key)?.toString() ?? null,
          })),
        };
      })
      .sort(
        (a, b) =>
          b.attentionSignals.length - a.attentionSignals.length ||
          b.date.getTime() - a.date.getTime(),
      );

    return { items, total: items.length };
  }

  // ── Detal ─────────────────────────────────────────────────────────────────

  /**
   * Bitta xodim kuni — bitta ekran uchun hamma narsa (§3.5).
   *
   * «Nima o'zgardi» — har ko'rsatkich xodimning O'Z 30 kunlik o'rtachasi bilan
   * solishtiriladi. Menejerga mutlaq raqam emas, OG'ISH kerak: 11 810 000
   * ko'p mi kam mi — buni faqat o'sha odamning odatiy kuni aytadi.
   */
  async detail(accountId: string, id: string) {
    const day = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id, accountId },
      include: {
        employee: { select: EMPLOYEE_SELECT },
        metrics: true,
        events: { orderBy: { createdAt: 'asc' } },
        profileVersion: { select: { version: true, ...PROFILE_METRIC_SELECT } },
      },
    });
    if (!day) throw new NotFoundException('Kun topilmadi');

    const baseline = await this.baseline(accountId, day.employeeId, day.date);
    // Katalog = built-in + hisobning O'Z ko'rsatkichlari. Ilgari bu yerda
    // `KPI_METRICS` turardi, shuning uchun egasining o'z KPI'si ekranda
    // umuman ko'rinmasdi (qiymati bazada bo'lsa ham).
    const catalog = await this.catalog.resolve(accountId);
    const score = scoreRow(day, catalog);
    const scored = new Map(score.metrics.map((m) => [m.metricKey, m]));

    const metrics = [...catalog.values()].map((def) => {
      const row = day.metrics.find((m) => m.metricKey === def.key);
      const auto = row?.autoValue ?? null;
      const avg = baseline.get(def.key) ?? null;
      return {
        key: def.key,
        labelUz: def.labelUz,
        labelRu: def.labelRu,
        unit: def.unit,
        direction: def.direction,
        perHour: def.perHour,
        autoValue: auto?.toString() ?? null,
        adjustValue: row?.adjustValue?.toString() ?? null,
        reasonCode: row?.reasonCode ?? null,
        complete: row?.complete ?? false,
        /** 30 kunlik o'z o'rtachasi va undan og'ish (%). Ikkalasi ham null bo'lishi mumkin. */
        baselineValue: avg?.toString() ?? null,
        deviationPercent: deviationPercent(auto, avg),
        perHourValue: def.perHour
          ? (perHourValue(auto, day.workedMinutes)?.toString() ?? null)
          : null,
        /** Reja bajarilishi va ballga qo'shgan hissasi (`kpi-score.ts`). */
        target: scored.get(def.key)?.target?.toString() ?? null,
        weight: scored.get(def.key)?.weight ?? 0,
        achievementPercent: scored.get(def.key)?.achievementPercent ?? null,
        contributionPercent: scored.get(def.key)?.contributionPercent ?? null,
        scored: scored.get(def.key)?.scored ?? false,
        /** Ballga NEGA kirmagani — ekranda ochiq aytiladi, jimgina 0 emas. */
        skipReason: scored.get(def.key)?.skipReason ?? null,
      };
    });

    return {
      id: day.id,
      date: day.date,
      state: day.state as DailyKpiState,
      dataComplete: day.dataComplete,
      workedMinutes: day.workedMinutes,
      profileVersionId: day.profileVersionId,
      profileVersion: day.profileVersion ? { version: day.profileVersion.version } : null,
      /** Jonli hisoblangan ball; muzlagan kun uchun `scoreFrozen` ustun turadi. */
      score: day.scorePercent == null ? score.score : Number(day.scorePercent),
      scoreFrozen: day.scorePercent == null ? null : Number(day.scorePercent),
      coverage: day.scoreCoverage == null ? score.coverage : Number(day.scoreCoverage),
      weightScored: score.weightScored,
      weightTotal: score.weightTotal,
      staleAt: day.staleAt,
      acceptedById: day.acceptedById,
      acceptedAt: day.acceptedAt,
      stateChangedAt: day.stateChangedAt,
      employee: {
        id: day.employee.id,
        name: day.employee.name,
        position: employeePosition(day.employee),
      },
      metrics,
      events: day.events.map((e) => ({
        id: e.id,
        action: e.action,
        fromState: e.fromState,
        toState: e.toState,
        actorType: e.actorType,
        actorId: e.actorId,
        reasonCode: e.reasonCode,
        comment: e.comment,
        detail: e.detail,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * Xodimning shu ko'rsatkich bo'yicha oldingi 30 kunlik o'rtachasi.
   *
   * Joriy kun CHIQARIB TASHLANADI (`lt: date`) — aks holda kun o'zi o'z
   * o'rtachasiga qo'shilib, og'ish sun'iy ravishda kichrayardi.
   * O'lchanmagan (`null`) kunlar o'rtachaga KIRMAYDI — 0 deb hisoblansa
   * o'rtacha pasayib, har kun «yaxshilanish» bo'lib ko'rinardi (NULL ≠ 0).
   */
  private async baseline(
    accountId: string,
    employeeId: string,
    date: Date,
  ): Promise<Map<string, bigint>> {
    const from = new Date(date.getTime() - BASELINE_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.client.employeeDailyKpiMetric.findMany({
      where: {
        accountId,
        autoValue: { not: null },
        dailyKpi: { accountId, employeeId, date: { gte: from, lt: date } },
      },
      select: { metricKey: true, autoValue: true },
    });

    const sums = new Map<string, { sum: bigint; n: bigint }>();
    for (const r of rows) {
      if (r.autoValue == null) continue;
      const cur = sums.get(r.metricKey) ?? { sum: 0n, n: 0n };
      cur.sum += r.autoValue;
      cur.n += 1n;
      sums.set(r.metricKey, cur);
    }
    const out = new Map<string, bigint>();
    for (const [key, { sum, n }] of sums) if (n > 0n) out.set(key, sum / n);
    return out;
  }

  // ── O'tishlar ─────────────────────────────────────────────────────────────

  /**
   * Holat o'zgarishi. FSM ruxsat bersa — optimistik da'vo + jurnal, bitta
   * tranzaksiyada.
   */
  async transition(
    ctx: ActorContext,
    id: string,
    action: DailyKpiAction,
    input: { reasonCode?: string | null; comment?: string | null; templateId?: string | null } = {},
  ) {
    const day = await this.load(ctx, id);
    const from = day.state as DailyKpiState;

    // MK20 — shablon matni FSM tekshiruvidan OLDIN: `other` sababida izoh
    // majburiy, shablondan kelgan matn ham shu shartni qoplashi kerak.
    const comment = await this.commentTemplates.resolveComment(ctx.accountId, {
      templateId: input.templateId,
      comment: input.comment,
    });

    const verdict = evaluate({
      from,
      action,
      actor: ctx.actor,
      reasonCode: input.reasonCode,
      comment: comment ?? undefined,
    });
    if (!verdict.ok) throw fsmError(verdict.failure);

    // IDEMPOTENTLIK (TZ §10.2): kun allaqachon maqsad holatida edi — na yozuv,
    // na jurnal qatori. 4M.3 da bonus aynan shu yerdan ikki marta yozilmaydi.
    if (verdict.noop) return { id, from, to: verdict.to, changed: false };

    const now = new Date();
    const extra: Prisma.EmployeeDailyKpiUpdateManyMutationInput = {
      state: verdict.to,
      stateChangedAt: now,
    };
    // Kun oylikka KIRDIMI yoki undan CHIQDIMI — ro'yxat `countsTowardPayroll`
    // da, bu yerda takrorlanmaydi (FSM shartnomasi: 4M.3 o'z ro'yxatini
    // yozmaydi, aks holda ikki joyda ikki javob bo'lardi).
    const entersPayroll = !countsTowardPayroll(from) && countsTowardPayroll(verdict.to);
    const leavesPayroll = countsTowardPayroll(from) && !countsTowardPayroll(verdict.to);
    // Qabul qilingan payt oylik hisobiga kiradi (§4), shuning uchun kim va
    // qachon — alohida ustunlarda, jurnalga qo'shimcha.
    if (verdict.to === DAILY_KPI_STATE.accepted || verdict.to === DAILY_KPI_STATE.forceAccepted) {
      extra.acceptedById = ctx.actorId;
      extra.acceptedAt = now;
      // 🔴 BALL MUZLATILADI. Profil versiyasi kabi: keyin og'irlik o'zgartirilsa
      // yoki katalog kengaysa, allaqachon to'langan oylik ortidagi raqam qayta
      // hisoblanib boshqacha chiqardi (tan narx muzlatish bilan bir klass).
      const frozen = await this.computeScore(ctx.accountId, id);
      extra.scorePercent = frozen.score;
      extra.scoreCoverage = frozen.coverage;
      // 🔴 OYLIK-FAKTI HAM MUZLATILADI (§3.4). Busiz oylik har safar joriy
      // raqamni qayta yig'ardi va ALLAQACHON TO'LANGAN oyning summasi
      // jimgina o'zgarardi — buxgalter buni tushuntira olmasdi.
      extra.acceptedFactMinor = await this.currentFactMinor(ctx.accountId, id);
    }
    // Navbatga qaytgan kun endi qabul qilingan emas — eski qabul izini
    // qoldirish «kim qabul qilgan» savoliga eski javob berardi.
    if (verdict.to === DAILY_KPI_STATE.pending || verdict.to === DAILY_KPI_STATE.rejected) {
      extra.acceptedById = null;
      extra.acceptedAt = null;
      // Muzlatilgan ball ham tozalanadi: kun qayta ko'rikda, uning eski
      // «qabul paytidagi» balli endi hech narsani anglatmaydi.
      extra.scorePercent = null;
      extra.scoreCoverage = null;
    }
    if (verdict.to === DAILY_KPI_STATE.stale) extra.staleAt = now;
    if (from === DAILY_KPI_STATE.stale && verdict.to !== DAILY_KPI_STATE.stale)
      extra.staleAt = null;

    // Bonus/jarima KERAKMI (QAROR-B1). Manba — endigina MUZLATILGAN ball:
    // jonli qayta hisob olinsa, keyin og'irlik o'zgarganda pul boshqacha
    // chiqardi. Qaror sof modulda (`kpi-accrual.ts`), bu yerda I/O.
    const accrual = entersPayroll
      ? planAccrual({
          scorePercent: (extra.scorePercent as number | null) ?? null,
          rules: await this.accrualRules(ctx.accountId),
        })
      : null;
    if (accrual) this.logAccrualSkip(id, accrual);

    // Tuzatuvchi qator KERAKMI — qabuldan OLDINGI muzlatilgan fakt bilan
    // solishtiriladi. Qaror sof modulda; bu yerda faqat ma'lumot yig'iladi.
    const correction =
      verdict.to === DAILY_KPI_STATE.accepted || verdict.to === DAILY_KPI_STATE.forceAccepted
        ? planCorrection({
            previousMinor: day.acceptedFactMinor ?? null,
            nextMinor: (extra.acceptedFactMinor as bigint | undefined) ?? 0n,
          })
        : null;

    await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.employeeDailyKpi.updateMany({
        where: { id, accountId: ctx.accountId, state: from },
        data: extra,
      });
      if (claimed.count === 0) {
        // Da'vo tegmadi: yo kun yo'q, yo holat biz o'qigandan keyin o'zgardi.
        throw new ConflictException('Kun holati o`zgarib ketdi — sahifani yangilang');
      }
      const event = await tx.employeeDailyKpiEvent.create({
        data: {
          accountId: ctx.accountId,
          dailyKpiId: id,
          fromState: from,
          toState: verdict.to,
          action,
          actorType: ctx.actor,
          actorId: ctx.actorId,
          reasonCode: input.reasonCode ?? null,
          // Shablon MATNI (havola emas) — MK20.
          comment,
        },
      });

      // ⚠️ Pul yozuvi ham AYNI tranzaksiyada va hodisaga BOG'LANGAN
      // (`kpiEventId` — tabiiy kalit). Alohida ketsa: holat qaytadi
      // (rollback), bonus esa qolib ketardi.
      if (accrual?.accrue) {
        await tx.hrBonusFineLog.create({
          data: {
            accountId: ctx.accountId,
            employeeId: day.employeeId,
            employeeName: day.employee?.name ?? null, // snapshot (§13.17)
            kind: accrual.kind,
            source: KPI_ACCRUAL_SOURCE,
            // Summa qoidadan NUSXA — keyin qoida tahrirlansa tarix o'zgarmaydi.
            amountMinor: accrual.amountMinor,
            reason: accrualReason(accrual.ruleName, extra.scorePercent as number | null),
            dailyKpiId: id,
            kpiEventId: event.id,
            ruleId: accrual.ruleId,
            createdById: ctx.actorId,
          },
        });
      }
      if (leavesPayroll) {
        await writeReversal(tx, {
          accountId: ctx.accountId,
          dailyKpiId: id,
          eventId: event.id,
          actorId: ctx.actorId,
          action,
        });
      }

      // ⚠️ Tuzatma AYNI tranzaksiyada: agar u alohida yozilsa va oradagi
      // xato yuz bersa, kun yangi fakt bilan qabul qilingan-u oylikda
      // farq ko'rinmagan holat qolardi — ya'ni pul jimgina o'zgarardi.
      if (correction) {
        await tx.employeeKpiCorrection.create({
          data: {
            accountId: ctx.accountId,
            dailyKpiId: id,
            employeeId: day.employeeId,
            kpiDate: day.date,
            // Kun sanasi bo'yicha EMAS: iyul kunining avgustdagi xatosi
            // avgust oyligiga kiradi (iyul yopilgan).
            period: correctionPeriod(now),
            previousMinor: correction.previousMinor,
            nextMinor: correction.nextMinor,
            diffMinor: correction.diffMinor,
            direction: correction.direction,
            acceptedById: ctx.actorId,
          },
        });
      }
    });

    return {
      id,
      from,
      to: verdict.to,
      changed: true,
      /** Tuzatuvchi qator yozilgan bo'lsa — FE uni darhol ko'rsatadi. */
      correction: correction
        ? { diffMinor: correction.diffMinor.toString(), direction: correction.direction }
        : null,
    };
  }

  /**
   * Kunning JORIY oylik-fakti (tiyin) — qabul lahzasida muzlatiladi.
   *
   * Manba `sumAcceptedSales` bilan BIR XIL bo'lishi shart: tuzatma o'sha
   * raqamdan hisoblanadi. Shuning uchun bu yerda ham `adjust` (menejer
   * tuzatmasi) `auto` dan ustun turadi.
   */
  private async currentFactMinor(accountId: string, id: string): Promise<bigint> {
    const row = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id, accountId },
      select: {
        metrics: {
          where: { metricKey: PAYROLL_SALES_METRIC_KEY },
          select: { autoValue: true, adjustValue: true },
        },
      },
    });
    const m = row?.metrics[0];
    return m?.adjustValue ?? m?.autoValue ?? 0n;
  }

  /**
   * Kunning JORIY kompozit balli — qabul lahzasida muzlatish uchun.
   * Formula `kpi-score.ts` da (sof modul); bu yerda faqat o'qish.
   */
  private async computeScore(
    accountId: string,
    id: string,
  ): Promise<{ score: number | null; coverage: number | null }> {
    const row = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id, accountId },
      select: {
        metrics: { select: SCORABLE_METRIC_SELECT },
        profileVersion: { select: PROFILE_METRIC_SELECT },
      },
    });
    if (!row) return { score: null, coverage: null };
    const s = scoreRow(row);
    return { score: s.score, coverage: s.coverage };
  }

  /**
   * Ko'rsatkich tuzatmasi. `autoValue` GA TEGILMAYDI — tuzatma yonma-yon
   * saqlanadi (§3.2). «Menejer qancha va nega tuzatdi» degan savolga javob
   * aynan shu ikkisining farqidan chiqadi.
   */
  async adjust(
    ctx: ActorContext,
    id: string,
    input: {
      metricKey: string;
      adjustValue: bigint | null;
      reasonCode: string;
      comment?: string | null;
      templateId?: string | null;
    },
  ) {
    if (!metricDef(input.metricKey, await this.catalog.resolve(ctx.accountId))) {
      throw new NotFoundException(`Noma'lum ko'rsatkich: ${input.metricKey}`);
    }
    const day = await this.load(ctx, id);
    const from = day.state as DailyKpiState;

    // MK20 — «tuzatma» shabloni aynan shu amal uchun (`ACTION_KIND.adjust`).
    const comment = await this.commentTemplates.resolveComment(ctx.accountId, {
      templateId: input.templateId,
      comment: input.comment,
    });

    // Tuzatishga faqat menejer/ega haqli — xodim o'z raqamini tuzata olmaydi.
    if (ctx.actor !== ACTOR.manager && ctx.actor !== ACTOR.owner) {
      throw new ForbiddenException('Ko`rsatkichni faqat menejer tuzata oladi');
    }
    const verdict = evaluateAdjust({
      from,
      reasonCode: input.reasonCode,
      comment: comment ?? undefined,
    });
    if (!verdict.ok) throw fsmError(verdict.failure);

    const existing = await this.prisma.client.employeeDailyKpiMetric.findFirst({
      where: { accountId: ctx.accountId, dailyKpiId: id, metricKey: input.metricKey },
      select: { id: true, autoValue: true, adjustValue: true },
    });
    if (!existing) throw new NotFoundException('Ko`rsatkich bu kunda yo`q');

    await this.prisma.client.$transaction(async (tx) => {
      // Holat SHARTI da'voda: tuzatayotganda kun qabul qilinib qolgan bo'lsa
      // (parallel menejer), tuzatma muzlagan kunga tushib ketmasin.
      const claimed = await tx.employeeDailyKpi.updateMany({
        where: { id, accountId: ctx.accountId, state: from },
        data: { stateChangedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Kun holati o`zgarib ketdi — sahifani yangilang');
      }
      await tx.employeeDailyKpiMetric.update({
        where: { id: existing.id },
        data: { adjustValue: input.adjustValue, reasonCode: input.reasonCode },
      });
      await tx.employeeDailyKpiEvent.create({
        data: {
          accountId: ctx.accountId,
          dailyKpiId: id,
          fromState: from,
          toState: from, // tuzatma holatni o'zgartirmaydi
          action: DAILY_KPI_ACTION.adjust,
          actorType: ctx.actor,
          actorId: ctx.actorId,
          reasonCode: input.reasonCode,
          // Shablon MATNI (havola emas) — MK20.
          comment,
          detail: {
            metricKey: input.metricKey,
            was: existing.adjustValue?.toString() ?? null,
            now: input.adjustValue?.toString() ?? null,
            autoValue: existing.autoValue?.toString() ?? null,
          },
        },
      });
    });

    return { id, metricKey: input.metricKey };
  }

  /**
   * Bonus/jarima qoidalari (QAROR-B1 kanali). Faqat FAOL va o'chirilmagan
   * qoidalar; qaysi biri shu kanalga tegishli ekanini sof modul hal qiladi
   * (`condition.type`), servis filtr yozmaydi.
   */
  private async accrualRules(accountId: string): Promise<AccrualRuleInput[]> {
    const rows = await this.prisma.client.hrBonusFineRule.findMany({
      where: { accountId, isActive: true, deletedAt: null },
      select: { id: true, name: true, kind: true, amountMinor: true, condition: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      amountMinor: r.amountMinor,
      condition: r.condition as unknown,
    }));
  }

  /**
   * Pul YOZILMAGANDA sababini logga chiqaradi.
   *
   * `invalid_rules` va `ambiguous_bands` — egasining sozlash xatosi: jimgina
   * o'tkazib yuborilsa, bonus hech qachon to'lanmaydi va buni hech kim
   * sezmaydi. Qolgan ikki sabab («qoida yo'q», «oraliqqa tushmadi») —
   * normal holat, log shovqini qilmaydi.
   */
  private logAccrualSkip(id: string, decision: AccrualDecision): void {
    if (decision.accrue) return;
    if (decision.skipReason === 'invalid_rules') {
      this.logger.warn(
        `Bonus/jarima qoidalari BUZUQ (kun ${id}): ${decision.ruleIds?.join(', ')} — pul yozilmadi`,
      );
    }
    if (decision.skipReason === 'ambiguous_bands') {
      this.logger.warn(
        `Bonus/jarima oraliqlari USTMA-UST (kun ${id}): ${decision.ruleIds?.join(', ')} — pul yozilmadi`,
      );
    }
  }

  private async load(ctx: ActorContext, id: string) {
    const day = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id, accountId: ctx.accountId },
      // `date` va `acceptedFactMinor` — tuzatuvchi qator uchun (§3.4):
      // birinchisi «qaysi kun uchun», ikkinchisi «avval nima to'langan».
      // `employee.name` — pul yozuvidagi nom snapshot'i (§13.17).
      select: {
        id: true,
        state: true,
        employeeId: true,
        date: true,
        acceptedFactMinor: true,
        employee: { select: { name: true } },
      },
    });
    if (!day) throw new NotFoundException('Kun topilmadi');
    // Xodim FAQAT o'z kuniga tegishli amal qila oladi (tushuntirish berish).
    // Bu tekshiruvsiz har kim istalgan odamning kuniga javob yozardi.
    //
    // 403 EMAS, 404: «huquqingiz yo'q» javobi begona kunning MAVJUDLIGINI
    // tasdiqlaydi — id terayotgan xodim kim qaysi kuni rad etilganini bilib
    // olardi. Repoda bu naqsh allaqachon bor (`customer-order.service.ts`
    // mavjudlik-sizishi izohi).
    if (ctx.actor === ACTOR.employee && day.employeeId !== ctx.actorId) {
      throw new NotFoundException('Kun topilmadi');
    }
    return day;
  }

  // ── Tizim amallari (cron) ─────────────────────────────────────────────────

  /**
   * Tugagan kunlarni ko'rikka qo'yadi: `computed` → `pending`.
   *
   * Nega alohida qadam: `computeDay` HECH QACHON `state` ga tegmaydi (4M.1 da
   * qulflangan shartnoma) — aks holda tungi qayta hisoblash qabul qilingan
   * kunni «hisoblandi» ga qaytarardi. Ko'rikka qo'yish — boshqa qaror, shu
   * sababli boshqa funksiya.
   */
  async openForReview(accountId: string, now = new Date()): Promise<{ opened: number }> {
    const today = localDateOnly(now);
    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: { accountId, state: DAILY_KPI_STATE.computed, date: { lt: today } },
      select: { id: true },
    });
    let opened = 0;
    for (const r of rows) {
      const done = await this.systemTransition(
        accountId,
        r.id,
        DAILY_KPI_STATE.computed,
        DAILY_KPI_ACTION.openForReview,
        null,
      );
      if (done) opened++;
    }
    return { opened };
  }

  /**
   * N kundan beri javobsiz turgan kunlarni egaga chiqaradi (§1.2).
   *
   * Busiz bloklash (M-Q8) boshi berk ko'chaga aylanadi: menejer kasal bo'lsa
   * xodimlar oyliksiz qolardi va buni hech kim ko'rmasdi.
   */
  async escalateOverdue(accountId: string, now = new Date()): Promise<{ escalated: number }> {
    const cutoff = new Date(now.getTime() - ESCALATE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: {
        accountId,
        state: { in: [DAILY_KPI_STATE.pending, DAILY_KPI_STATE.rejected] },
        stateChangedAt: { lt: cutoff },
      },
      select: { id: true, state: true },
    });
    let escalated = 0;
    for (const r of rows) {
      const done = await this.systemTransition(
        accountId,
        r.id,
        r.state as DailyKpiState,
        DAILY_KPI_ACTION.escalate,
        'no_response',
      );
      if (done) escalated++;
    }
    return { escalated };
  }

  /**
   * Manba hujjat o'zgarganda qabul qilingan kunni eskirgan deb belgilaydi
   * (§3.4). Qaytadi: nechta kun eskirdi.
   */
  async markStale(accountId: string, employeeId: string, date: Date): Promise<{ marked: number }> {
    const dateOnly = localDateOnly(date);
    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: {
        accountId,
        employeeId,
        date: dateOnly,
        state: { in: [DAILY_KPI_STATE.accepted, DAILY_KPI_STATE.forceAccepted] },
      },
      select: { id: true, state: true },
    });
    let marked = 0;
    for (const r of rows) {
      const done = await this.systemTransition(
        accountId,
        r.id,
        r.state as DailyKpiState,
        DAILY_KPI_ACTION.markStale,
        null,
      );
      if (done) marked++;
    }
    return { marked };
  }

  /**
   * Tizim o'tishi — da'vo tegmasa JIM o'tadi (409 tashlamaydi).
   *
   * Cron ko'p qatorni aylanadi va ular orasida menejer qo'lda qaror qabul
   * qilishi mumkin. Bunda cron'ni yiqitish noto'g'ri: menejerning qarori
   * ustun, cron shunchaki o'sha qatorni o'tkazib yuboradi.
   */
  private async systemTransition(
    accountId: string,
    id: string,
    from: DailyKpiState,
    action: DailyKpiAction,
    reasonCode: string | null,
  ): Promise<boolean> {
    const verdict = evaluate({ from, action, actor: ACTOR.system, reasonCode });
    if (!verdict.ok) {
      this.logger.warn(`FSM rad etdi (${action}, ${from}): ${verdict.failure.code}`);
      return false;
    }
    const now = new Date();
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const claimed = await tx.employeeDailyKpi.updateMany({
          where: { id, accountId, state: from },
          data: {
            state: verdict.to,
            stateChangedAt: now,
            ...(verdict.to === DAILY_KPI_STATE.stale ? { staleAt: now } : {}),
          },
        });
        if (claimed.count === 0) return false;
        const event = await tx.employeeDailyKpiEvent.create({
          data: {
            accountId,
            dailyKpiId: id,
            fromState: from,
            toState: verdict.to,
            action,
            actorType: ACTOR.system,
            actorId: null,
            reasonCode,
          },
        });
        // Tizim ham kunni oylikdan CHIQARISHI mumkin (`mark_stale`): u holda
        // bonus/jarima qoldig'i nolga keltiriladi. Busiz eskirgan kun puli
        // joyida qolib, qayta qabulda IKKI KARRA bo'lardi.
        if (countsTowardPayroll(from) && !countsTowardPayroll(verdict.to)) {
          await writeReversal(tx, {
            accountId,
            dailyKpiId: id,
            eventId: event.id,
            actorId: null,
            action,
          });
        }
        return true;
      });
    } catch (e) {
      this.logger.error(`Tizim o'tishi yiqildi (${id}, ${action}): ${msg(e)}`);
      return false;
    }
  }
}

// ── Yordamchilar ────────────────────────────────────────────────────────────

/** Pul yozuvidagi «nega» — jurnalda raqamsiz qator qolmasin. */
function accrualReason(ruleName: string, scorePercent: number | null): string {
  return scorePercent == null ? ruleName : `${ruleName} (ball ${scorePercent}%)`;
}

/**
 * Kun oylikdan CHIQQANDA bonus/jarima qoldig'ini nolga keltiradi (QAROR-B1).
 *
 * O'CHIRISH YO'Q — teskari qator yoziladi: `HrBonusFineLog` audit izi va uni
 * o'chirish «pul qayerga ketdi» savolini javobsiz qoldirardi (`remove()` ham
 * faqat `manual` yozuvlarga ruxsat beradi).
 *
 * Xodim qoldiq qatorlarining O'ZIDAN olinadi — kim to'lov olgan bo'lsa,
 * qaytarish ham o'shanikidan bo'ladi (kun qatoridagi `employeeId` keyin
 * o'zgargan bo'lishi mumkin).
 */
async function writeReversal(
  tx: Prisma.TransactionClient,
  ctx: {
    accountId: string;
    dailyKpiId: string;
    eventId: string;
    actorId: string | null;
    action: string;
  },
): Promise<void> {
  const rows = await tx.hrBonusFineLog.findMany({
    where: { accountId: ctx.accountId, dailyKpiId: ctx.dailyKpiId },
    select: { kind: true, amountMinor: true, employeeId: true, employeeName: true },
  });
  const owner = rows.at(0);
  if (owner == null) return; // kunda pul yozuvi umuman yo'q

  const reversals = planReversalRows(rows);
  if (reversals.length === 0) return; // qoldiq allaqachon 0 — idempotent

  for (const r of reversals) {
    await tx.hrBonusFineLog.create({
      data: {
        accountId: ctx.accountId,
        employeeId: owner.employeeId,
        employeeName: owner.employeeName,
        kind: r.kind,
        source: KPI_ACCRUAL_REVERSAL_SOURCE,
        amountMinor: r.amountMinor,
        reason: `Kun qabuli bekor qilindi (${ctx.action})`,
        dailyKpiId: ctx.dailyKpiId,
        kpiEventId: ctx.eventId,
        createdById: ctx.actorId,
      },
    });
  }
}

export interface ActorContext {
  readonly accountId: string;
  readonly actor: Actor;
  /** Employee id (`AuthenticatedUser.sub`). Tizim uchun null. */
  readonly actorId: string | null;
}

/**
 * Lavozim ikki joyda: `Employee.position` — eski String ustun, `position2` —
 * `HrPosition` munosabati (yangi manba). FK ustun, eski matn zaxira; ikkalasi
 * ham bo'sh bo'lsa `null` (taxminiy lavozim yozilmaydi).
 */
const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  position: true,
  position2: { select: { name: true } },
} as const;

function employeePosition(e: {
  position: string | null;
  position2: { name: string } | null;
}): string | null {
  return e.position2?.name ?? e.position ?? null;
}

/**
 * Profil versiyasidagi og'irlik va maqsad — kompozit ball uchun yagona manba.
 * `detail()` bunga `version` ni ham qo'shadi.
 */
const PROFILE_METRIC_SELECT = {
  metrics: { select: { weight: true, target: true, metricDef: { select: { key: true } } } },
} as const;

/**
 * Kun qatoridan ball uchun o'qiladigan maydonlar — MUHRLANGAN maqsad bilan
 * (KPI-03). `detail()` butun qatorni oladi, list/`computeScore` shu selektni.
 */
const SCORABLE_METRIC_SELECT = {
  metricKey: true,
  autoValue: true,
  adjustValue: true,
  complete: true,
  targetValue: true,
  targetSource: true,
  weightApplied: true,
  weightSource: true,
} as const;

interface ScorableRow {
  metrics: ReadonlyArray<{
    metricKey: string;
    autoValue: bigint | null;
    adjustValue: bigint | null;
    complete: boolean;
    /** O'sha kunga muhrlangan maqsad (KPI-03). */
    targetValue?: bigint | null;
    /** NULL = MUHR YO'Q → profil maqsadiga tushiladi. */
    targetSource?: string | null;
    /** O'sha kunga muhrlangan og'irlik (KPI-05). NULL = og'irlik qo'yilmagan. */
    weightApplied?: Prisma.Decimal | number | null;
    /** NULL = MUHR YO'Q → profil og'irligiga tushiladi. */
    weightSource?: string | null;
  }>;
  profileVersion: {
    metrics: ReadonlyArray<{
      weight: Prisma.Decimal;
      target: bigint | null;
      metricDef: { key: string };
    }>;
  } | null;
}

/**
 * Shu kun uchun amaldagi maqsad — MUHR ustun, profil esa zaxira.
 *
 * 🔴 `targetSource != null` = kun hisoblanganda maqsad muhrlangan; undan
 * keyingi tahrir bu kunga tegmaydi (§2.3 snapshot). `targetSource == null` =
 * KPI-03 migratsiyasidan OLDIN hisoblangan qator — u hech qachon muhrlanmagan,
 * shuning uchun avvalgidek profil versiyasidan o'qiladi. Ikkalasini
 * `targetValue == null` bilan farqlab bo'lmaydi: muhrlangan «maqsad yo'q» ham
 * NULL beradi (NULL ≠ 0 intizomining shu fazadagi ko'rinishi).
 */
function effectiveTarget(
  metric: ScorableRow['metrics'][number],
  profileTarget: bigint | null | undefined,
): bigint | null {
  if (metric.targetSource != null) return metric.targetValue ?? null;
  return profileTarget ?? null;
}

/**
 * Shu kun uchun amaldagi og'irlik — MUHR ustun, profil esa zaxira (KPI-05).
 *
 * Qoida maqsadnikiga AYNAN mos: `weightSource != null` = kun hisoblanganda
 * og'irlik muhrlangan, undan keyingi tahrir bu kunga tegmaydi. Muhrlangan
 * `null` = «o'sha kuni og'irlik qo'yilmagan edi» — profilga QAYTILMAYDI, aks
 * holda menejer ataylab ballsiz qoldirgan ko'rsatkich jimgina ballanardi.
 *
 * Muhrsiz (migratsiyadan oldingi) qator avvalgidek profil og'irligiga tushadi,
 * ya'ni eski kunlarning balli o'zgarmaydi.
 */
function effectiveWeight(
  metric: ScorableRow['metrics'][number],
  profileWeight: number | undefined,
): number | null {
  if (metric.weightSource != null) {
    return metric.weightApplied == null ? null : Number(metric.weightApplied);
  }
  return profileWeight ?? null;
}

/**
 * DB qatorini sof ball hisoblagichiga o'tkazadi (`kpi-score.ts`).
 * Formula bu yerda TAKRORLANMAYDI — 1.4 dagi «yetti joyda uch xil foiz»
 * hodisasi aynan shunday boshlangan edi.
 */
function scoreRow(row: ScorableRow, catalog: MetricCatalog = BUILT_IN_CATALOG): DayScore {
  const cfg = new Map(
    (row.profileVersion?.metrics ?? []).map((pm) => [
      pm.metricDef.key,
      { weight: Number(pm.weight), target: pm.target },
    ]),
  );
  const inputs: ScoreMetricInput[] = row.metrics.map((m) => ({
    metricKey: m.metricKey,
    autoValue: m.autoValue,
    adjustValue: m.adjustValue,
    target: effectiveTarget(m, cfg.get(m.metricKey)?.target),
    weight: effectiveWeight(m, cfg.get(m.metricKey)?.weight),
    complete: m.complete,
  }));
  return scoreDay(inputs, catalog);
}

/** Baseline oynasi — «o'z odatiy kuni» shuncha kundan olinadi. */
const BASELINE_DAYS = 30;

/** Navbat kartochkasida ko'rinadigan ko'rsatkichlar (hammasi emas — 1 qator). */
const SUMMARY_KEYS = [
  'cash_revenue',
  'cash_gross_profit',
  'discount_given',
  'till_variance_abs',
  'late_minutes',
] as const;

/**
 * E'tibor signallari — navbat tartibi shundan. Har biri KO'RINADIGAN sabab,
 * yashirin ball emas: menejer nega bu kun yuqorida turganini biladi.
 */
const ALERT_METRICS = [
  'till_variance_abs',
  'below_cost_count',
  'cancel_count',
  'refund_count',
  'late_minutes',
] as const;

function attentionSignals(row: {
  state: string;
  dataComplete: boolean;
  metrics: Array<{ metricKey: string; autoValue: bigint | null }>;
}): string[] {
  const out: string[] = [];
  if (row.state === DAILY_KPI_STATE.stale) out.push('stale');
  if (row.state === DAILY_KPI_STATE.escalated) out.push('escalated');
  if (row.state === DAILY_KPI_STATE.rejected) out.push('rejected');
  if (!row.dataComplete) out.push('data_incomplete');
  for (const key of ALERT_METRICS) {
    const v = metricValue(row.metrics, key);
    if (v != null && v > 0n) out.push(key);
  }
  return out;
}

function metricValue(
  metrics: Array<{ metricKey: string; autoValue: bigint | null }>,
  key: string,
): bigint | null {
  return metrics.find((m) => m.metricKey === key)?.autoValue ?? null;
}

/**
 * FSM xatosini HTTP javobiga aylantiradi. Xabarlar menejerga o'qiladi,
 * shuning uchun kod emas — jumla.
 */
function fsmError(f: FsmFailure): Error {
  switch (f.code) {
    case 'illegal_transition':
      return new ConflictException(
        `Bu amal «${f.from}» holatida mumkin emas (mumkin: ${f.allowed.join(', ')})`,
      );
    case 'actor_not_allowed':
      return new ForbiddenException('Bu amalga sizda huquq yo`q');
    case 'reason_required':
      return new ConflictException('Sabab kodi ko`rsatilishi shart');
    case 'unknown_reason':
      return new ConflictException(`Noma'lum sabab kodi: ${f.reasonCode}`);
    case 'comment_required':
      return new ConflictException('«Boshqa» sababi uchun izoh yozilishi shart');
    default:
      return new ConflictException('Amal bajarilmadi');
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** `startOfLocalDay` bu yerda ham kerak — drill-down chegaralari bilan bir xil. */
export { startOfLocalDay };
