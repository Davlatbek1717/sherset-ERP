import type { Prisma } from '@moysklad/db';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { localDateOnly } from '../../hr/hr-shared/tz.util.js';
import {
  type DailyKpiAction,
  type DailyKpiActor,
  type DailyKpiState,
  ESCALATE_AFTER_DAYS,
  QUEUE_STATES,
  applyTransition,
  assertWritable,
  isReasonCode,
} from './daily-kpi.fsm.js';
import { deviationPercent, metricDef, perHourValue } from './kpi-metrics.js';
import { type DayScore, type ScoreMetricInput, scoreDay } from './kpi-score.js';

/**
 * Kunlik KPI qabul qilish (TZ 4M.2 — egasining 1-ustuvorligi).
 *
 * Bu servis YUPQA: qaror qoidalari `daily-kpi.fsm.ts` da, formula
 * `kpi-score.ts` da. Bu yerda faqat Prisma-I/O va tranzaksiya chegaralari.
 *
 * UCHTA SHARTNOMA (buzilsa pul noto'g'ri to'lanadi):
 *   1. **Har o'tish hodisa jurnaliga yoziladi** — bir tranzaksiyada, holat
 *      bilan birga. Jurnalsiz o'tish bo'lishi mumkin emas (M-Q7 egaga xulosa
 *      shundan quriladi).
 *   2. **Qabul lahzasida ball MUZLATILADI** (`scorePercent`) — keyin og'irlik
 *      o'zgarsa ham to'langan oylik ortidagi raqam o'zgarmaydi.
 *   3. **`autoValue` hech qachon o'zgartirilmaydi** — menejer tuzatmasi
 *      `adjustValue` ga yoziladi va sabab kodi majburiy (§3.2).
 */
@Injectable()
export class DailyKpiAcceptanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── O'qish ────────────────────────────────────────────────────────────────

  /**
   * Menejer navbati (TZ §5.1). Tartib — **og'ishli kunlar birinchi** (§1.2):
   * eskalatsiya → eskirgan → rad etilgan → kutayotgan, har guruh ichida eng
   * past balldan boshlab. Sabab: 20+ xodim × har kun qo'lda ko'riladi, shuning
   * uchun e'tibor talab qiladigani yuqorida turishi kerak — aks holda menejer
   * ro'yxat oxiriga yetguncha ko'r-ko'rona bosa boshlaydi.
   */
  async queue(
    accountId: string,
    filter: { from?: string; to?: string; employeeId?: string; states?: string[]; limit?: number },
  ) {
    const states = (filter.states?.length ? filter.states : [...QUEUE_STATES]).filter((s) =>
      (QUEUE_STATES as readonly string[]).concat('computed', 'accepted').includes(s),
    );
    const where: Prisma.EmployeeDailyKpiWhereInput = {
      accountId,
      state: { in: states },
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.from || filter.to
        ? {
            date: {
              ...(filter.from ? { gte: localDateOnly(new Date(filter.from)) } : {}),
              ...(filter.to ? { lte: localDateOnly(new Date(filter.to)) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      take: Math.min(filter.limit ?? 200, 500),
      select: {
        id: true,
        date: true,
        state: true,
        dataComplete: true,
        workedMinutes: true,
        queuedAt: true,
        scorePercent: true,
        scoreCoverage: true,
        employee: { select: { id: true, name: true } },
        metrics: {
          select: { metricKey: true, autoValue: true, adjustValue: true, complete: true },
        },
        profileVersion: {
          select: {
            id: true,
            version: true,
            metrics: {
              select: { weight: true, target: true, metricDef: { select: { key: true } } },
            },
          },
        },
      },
    });

    const items = rows.map((row) => {
      // Qabul qilingan kun uchun MUZLATILGAN ball ko'rsatiladi, qayta
      // hisoblangani emas — aks holda ro'yxat va oylik bir-biriga zid bo'lardi.
      const live = scoreRow(row);
      const frozen = row.scorePercent == null ? null : Number(row.scorePercent);
      return {
        id: row.id,
        date: row.date,
        state: row.state as DailyKpiState,
        employee: row.employee,
        dataComplete: row.dataComplete,
        workedMinutes: row.workedMinutes,
        queuedAt: row.queuedAt,
        score: row.state === 'accepted' && frozen != null ? frozen : live.score,
        scoreFrozen: frozen,
        coverage:
          row.state === 'accepted' && row.scoreCoverage != null
            ? Number(row.scoreCoverage)
            : live.coverage,
        hasProfile: row.profileVersion != null,
        adjustedCount: live.metrics.filter((mm) => mm.adjusted).length,
        staleForDays: row.queuedAt ? daysBetween(row.queuedAt, new Date()) : null,
      };
    });

    items.sort((a, b) => {
      const p = statePriority(a.state) - statePriority(b.state);
      if (p !== 0) return p;
      // Ballsiz kun (profil yo'q / o'lchanmagan) — pastda emas, YUQORIDA:
      // «hech narsa o'lchanmagan» ham menejer ko'rishi kerak bo'lgan holat.
      if (a.score == null && b.score != null) return -1;
      if (a.score != null && b.score == null) return 1;
      if (a.score != null && b.score != null && a.score !== b.score) return a.score - b.score;
      return b.date.getTime() - a.date.getTime();
    });

    return { items, total: items.length };
  }

  /**
   * Bitta kun — menejer ekrani uchun to'liq manzara (§3.5): ko'rsatkichlar
   * (auto · tuzatma · maqsad · bajarish % · **30-kunlik o'rtachadan og'ish**),
   * kompozit ball, hodisa jurnali va ish yuki konteksti (soatiga).
   */
  async getDay(accountId: string, dailyKpiId: string) {
    const row = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id: dailyKpiId, accountId },
      select: {
        id: true,
        date: true,
        state: true,
        dataComplete: true,
        workedMinutes: true,
        queuedAt: true,
        acceptedAt: true,
        acceptedById: true,
        staleAt: true,
        scorePercent: true,
        scoreCoverage: true,
        computedAt: true,
        employee: { select: { id: true, name: true } },
        metrics: {
          select: {
            metricKey: true,
            autoValue: true,
            adjustValue: true,
            reasonCode: true,
            complete: true,
          },
        },
        profileVersion: {
          select: {
            id: true,
            version: true,
            effectiveFrom: true,
            metrics: {
              select: { weight: true, target: true, metricDef: { select: { key: true } } },
            },
          },
        },
        events: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            action: true,
            fromState: true,
            toState: true,
            actorType: true,
            actorId: true,
            reasonCode: true,
            note: true,
            payload: true,
            createdAt: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Kun topilmadi');

    const [score, averages] = await Promise.all([
      Promise.resolve(scoreRow(row)),
      this.metricAverages(accountId, row.employee.id, row.date),
    ]);
    const reasonByKey = new Map(row.metrics.map((m) => [m.metricKey, m.reasonCode]));

    return {
      id: row.id,
      date: row.date,
      state: row.state as DailyKpiState,
      employee: row.employee,
      dataComplete: row.dataComplete,
      workedMinutes: row.workedMinutes,
      queuedAt: row.queuedAt,
      acceptedAt: row.acceptedAt,
      acceptedById: row.acceptedById,
      staleAt: row.staleAt,
      computedAt: row.computedAt,
      profileVersion: row.profileVersion
        ? {
            id: row.profileVersion.id,
            version: row.profileVersion.version,
            effectiveFrom: row.profileVersion.effectiveFrom,
          }
        : null,
      score: score.score,
      scoreFrozen: row.scorePercent == null ? null : Number(row.scorePercent),
      coverage: score.coverage,
      weightScored: score.weightScored,
      weightTotal: score.weightTotal,
      metrics: score.metrics.map((m) => {
        const def = metricDef(m.metricKey);
        const avg = averages.get(m.metricKey) ?? null;
        return {
          metricKey: m.metricKey,
          labelUz: def?.labelUz ?? m.metricKey,
          labelRu: def?.labelRu ?? m.metricKey,
          unit: def?.unit ?? 'count',
          direction: m.direction,
          source: def?.source ?? null,
          autoValue: asText(m.autoValue),
          adjustValue: asText(m.adjustValue),
          adjusted: m.adjusted,
          reasonCode: reasonByKey.get(m.metricKey) ?? null,
          target: asText(m.target),
          weight: m.weight,
          achievementPercent: m.achievementPercent,
          contributionPercent: m.contributionPercent,
          scored: m.scored,
          skipReason: m.skipReason,
          complete: m.complete,
          /** Ish yuki konteksti (§3.5): soatiga — kassirlar oqimi teng emas. */
          perHour: def?.perHour ? asText(perHourValue(m.fact, row.workedMinutes)) : null,
          /** O'z 30-kunlik o'rtachasidan og'ish, foizda. */
          deviationPercent: deviationPercent(m.fact, avg),
          average30d: asText(avg),
        };
      }),
      events: row.events,
    };
  }

  /**
   * Ko'rsatkichning shu xodim bo'yicha oxirgi 30 kunlik o'rtachasi.
   *
   * NULL (o'lchanmagan) kunlar o'rtachaga KIRMAYDI — aks holda dam olish
   * kunlari o'rtachani pastga tortib, ishlagan kunni «rekord» qilib ko'rsatardi.
   */
  private async metricAverages(
    accountId: string,
    employeeId: string,
    day: Date,
  ): Promise<Map<string, bigint>> {
    const from = new Date(day.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.client.employeeDailyKpiMetric.findMany({
      where: {
        accountId,
        dailyKpi: { employeeId, date: { gte: localDateOnly(from), lt: day } },
        autoValue: { not: null },
      },
      select: { metricKey: true, autoValue: true, adjustValue: true },
    });

    const acc = new Map<string, { sum: bigint; n: bigint }>();
    for (const r of rows) {
      const v = r.adjustValue ?? r.autoValue;
      if (v == null) continue;
      const b = acc.get(r.metricKey) ?? { sum: 0n, n: 0n };
      b.sum += v;
      b.n += 1n;
      acc.set(r.metricKey, b);
    }
    const out = new Map<string, bigint>();
    for (const [key, b] of acc) if (b.n > 0n) out.set(key, b.sum / b.n);
    return out;
  }

  // ── Yozish ────────────────────────────────────────────────────────────────

  /**
   * FSM o'tishi + hodisa jurnali — BIR tranzaksiyada.
   *
   * Idempotentlik: allaqachon maqsad holatida bo'lgan kun uchun holat qayta
   * yozilmaydi va jurnalga yangi qator TUSHMAYDI. Menejerning ikkinchi bosishi
   * bonusni ikki marta yozmasligi shu yerdan boshlanadi (TZ §10.2).
   */
  async transition(
    accountId: string,
    dailyKpiId: string,
    action: DailyKpiAction,
    ctx: {
      actor: DailyKpiActor;
      actorId: string | null;
      reasonCode?: string | null;
      note?: string | null;
      /**
       * Kun aynan shu xodimniki bo'lishi shart (xodim o'z kuniga tushuntirish
       * yozadi). Mos kelmasa **404** — 403 emas: begona kunning MAVJUDLIGI ham
       * sizib chiqmasligi kerak (asl TZ §4.3 naqshi).
       */
      expectEmployeeId?: string;
    },
  ) {
    if (ctx.reasonCode && !isReasonCode(ctx.reasonCode)) {
      throw new BadRequestException(`Noma'lum sabab kodi: ${ctx.reasonCode}`);
    }

    const current = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id: dailyKpiId, accountId },
      select: { id: true, state: true, employeeId: true },
    });
    if (!current) throw new NotFoundException('Kun topilmadi');
    if (ctx.expectEmployeeId && current.employeeId !== ctx.expectEmployeeId) {
      throw new NotFoundException('Kun topilmadi');
    }

    const from = current.state as DailyKpiState;
    const result = applyTransition(action, from, {
      actor: ctx.actor,
      reasonCode: ctx.reasonCode,
    });
    if (result.noop) return { id: current.id, state: from, changed: false };

    // Qabul qilinayotgan bo'lsa ballni MUZLATAMIZ — shu lahzadagi profil
    // versiyasi va qiymatlar bilan hisoblab, ustunga yozamiz.
    const freeze = result.to === 'accepted' ? await this.freezeScore(accountId, dailyKpiId) : null;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.employeeDailyKpi.update({
        where: { id: dailyKpiId },
        data: {
          state: result.to,
          // Navbatga tushgan lahza — eskalatsiya soati shundan sanaladi.
          ...(isQueueState(result.to) ? { queuedAt: new Date() } : {}),
          ...(result.to === 'accepted'
            ? {
                acceptedById: ctx.actorId,
                acceptedAt: new Date(),
                scorePercent: freeze?.score ?? null,
                scoreCoverage: freeze?.coverage ?? null,
                // Qabul qilingan kun endi eskirgan emas.
                staleAt: null,
              }
            : {}),
          ...(result.to === 'stale' ? { staleAt: new Date() } : {}),
        },
      });
      await tx.employeeDailyKpiEvent.create({
        data: {
          accountId,
          dailyKpiId,
          action,
          fromState: from,
          toState: result.to,
          actorType: ctx.actor,
          actorId: ctx.actorId,
          reasonCode: ctx.reasonCode ?? null,
          note: ctx.note ?? null,
        },
      });
    });

    return { id: dailyKpiId, state: result.to, changed: true, score: freeze?.score ?? null };
  }

  /**
   * Ko'rsatkich tuzatmasi (§3.2). `autoValue` TEGILMAYDI — tuzatma yonma-yon
   * yoziladi va sabab kodi MAJBURIY. Qabul qilingan kunga yozilmaydi
   * (muzlatish qo'riqchisi) — avval `reopen` kerak.
   */
  async adjustMetric(
    accountId: string,
    dailyKpiId: string,
    metricKey: string,
    input: {
      value: string | null;
      reasonCode: string;
      note?: string | null;
      actor: DailyKpiActor;
      actorId: string | null;
    },
  ) {
    if (!metricDef(metricKey)) {
      throw new BadRequestException(`Noma'lum ko'rsatkich: ${metricKey}`);
    }
    if (!isReasonCode(input.reasonCode)) {
      throw new BadRequestException(`Noma'lum sabab kodi: ${input.reasonCode}`);
    }
    if (input.actor !== 'manager' && input.actor !== 'owner') {
      // Tuzatish — menejerning vakolati; FSM bilan bir xil qoida.
      throw new BadRequestException('Tuzatishni faqat menejer yoki egasi kiritadi');
    }

    const day = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id: dailyKpiId, accountId },
      select: { id: true, state: true },
    });
    if (!day) throw new NotFoundException('Kun topilmadi');
    assertWritable(day.state as DailyKpiState);

    const existing = await this.prisma.client.employeeDailyKpiMetric.findFirst({
      where: { dailyKpiId, metricKey },
      select: { id: true, adjustValue: true },
    });
    if (!existing) throw new NotFoundException(`Ko'rsatkich kunda yo'q: ${metricKey}`);

    const next = input.value == null ? null : parseMinor(input.value);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.employeeDailyKpiMetric.update({
        where: { id: existing.id },
        data: { adjustValue: next, reasonCode: next == null ? null : input.reasonCode },
      });
      await tx.employeeDailyKpiEvent.create({
        data: {
          accountId,
          dailyKpiId,
          action: 'adjust',
          // Tuzatma holatni o'zgartirmaydi — jurnal shakli bir xil qolishi
          // uchun ikkala ustun ham joriy holat bilan to'ldiriladi.
          fromState: day.state,
          toState: day.state,
          actorType: input.actor,
          actorId: input.actorId,
          reasonCode: input.reasonCode,
          note: input.note ?? null,
          payload: {
            metricKey,
            from: existing.adjustValue == null ? null : existing.adjustValue.toString(),
            to: next == null ? null : next.toString(),
          },
        },
      });
    });

    return { metricKey, adjustValue: next == null ? null : next.toString() };
  }

  /** Qabul lahzasidagi ballni hisoblaydi (muzlatish uchun). */
  private async freezeScore(
    accountId: string,
    dailyKpiId: string,
  ): Promise<{ score: number | null; coverage: number | null }> {
    const row = await this.prisma.client.employeeDailyKpi.findFirst({
      where: { id: dailyKpiId, accountId },
      select: {
        metrics: {
          select: { metricKey: true, autoValue: true, adjustValue: true, complete: true },
        },
        profileVersion: {
          select: {
            metrics: {
              select: { weight: true, target: true, metricDef: { select: { key: true } } },
            },
          },
        },
      },
    });
    if (!row) return { score: null, coverage: null };
    const s = scoreRow(row);
    return { score: s.score, coverage: s.coverage };
  }

  // ── Tizim o'tishlari (cron) ───────────────────────────────────────────────

  /**
   * Yopilgan kunlarni navbatga qo'yadi (`computed` → `pending`).
   *
   * FAQAT o'tgan kunlar: bugungi kun hali o'zgaryapti, uni qabul qilish
   * ma'nosiz bo'lardi (analitika TZ §5.2 «kechagacha rollup, bugun jonli»).
   */
  async submitClosedDays(accountId: string, today = new Date()): Promise<{ submitted: number }> {
    const boundary = localDateOnly(today);
    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: { accountId, state: 'computed', date: { lt: boundary } },
      select: { id: true },
    });
    for (const r of rows) {
      await this.transition(accountId, r.id, 'submit', { actor: 'system', actorId: null });
    }
    return { submitted: rows.length };
  }

  /**
   * N kun javobsiz qolgan kunlarni egasining navbatiga ko'taradi (§1.2).
   * Bu — «menejer kasal/ta'tilda» boshi berk ko'chasining klapani.
   */
  async escalateOverdue(
    accountId: string,
    now = new Date(),
    afterDays = ESCALATE_AFTER_DAYS,
  ): Promise<{ escalated: number }> {
    const cutoff = new Date(now.getTime() - afterDays * 86_400_000);
    const rows = await this.prisma.client.employeeDailyKpi.findMany({
      where: {
        accountId,
        state: { in: ['pending', 'rejected'] },
        queuedAt: { not: null, lte: cutoff },
      },
      select: { id: true },
    });
    for (const r of rows) {
      await this.transition(accountId, r.id, 'escalate', { actor: 'system', actorId: null });
    }
    return { escalated: rows.length };
  }
}

// ── Yordamchilar ────────────────────────────────────────────────────────────

interface ScorableRow {
  metrics: ReadonlyArray<{
    metricKey: string;
    autoValue: bigint | null;
    adjustValue: bigint | null;
    complete: boolean;
  }>;
  profileVersion: {
    metrics: ReadonlyArray<{
      weight: Prisma.Decimal;
      target: bigint | null;
      metricDef: { key: string };
    }>;
  } | null;
}

/** DB qatorini sof ball hisoblagichiga o'tkazadi. */
function scoreRow(row: ScorableRow): DayScore {
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
    target: cfg.get(m.metricKey)?.target ?? null,
    weight: cfg.get(m.metricKey)?.weight ?? 0,
    complete: m.complete,
  }));
  return scoreDay(inputs);
}

/** Navbat tartibi: e'tibor talab qiladigani yuqorida (§1.2). */
function statePriority(state: DailyKpiState): number {
  switch (state) {
    case 'escalated':
      return 0;
    case 'stale':
      return 1;
    case 'rejected':
      return 2;
    case 'pending':
      return 3;
    case 'computed':
      return 4;
    default:
      return 5;
  }
}

function isQueueState(state: DailyKpiState): boolean {
  return (QUEUE_STATES as readonly string[]).includes(state);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function asText(v: bigint | null): string | null {
  return v == null ? null : v.toString();
}

/**
 * Tuzatma qiymati — MATNDAN BigInt'ga. `Number` orqali o'tkazish taqiqlanadi:
 * 9 007 199 254 740 993 tiyindan katta summa jimgina yaxlitlanardi.
 */
function parseMinor(v: string): bigint {
  const s = v.trim();
  if (!/^-?\d+$/.test(s)) throw new BadRequestException(`Butun son kutilgan: ${v}`);
  return BigInt(s);
}
