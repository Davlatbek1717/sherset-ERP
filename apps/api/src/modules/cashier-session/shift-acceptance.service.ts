import type { Prisma } from '@moysklad/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CashierSessionService } from './cashier-session.service.js';
import {
  SHIFT_ACCEPTANCE_ACTION,
  SHIFT_ACCEPTANCE_STATE,
  SHIFT_ACTOR,
  SHIFT_ESCALATE_AFTER_DAYS,
  SHIFT_QUEUE_STATES,
  type ShiftAcceptanceAction,
  type ShiftAcceptanceState,
  type ShiftActor,
  type ShiftFsmFailure,
  allowedShiftActions,
  awaitsCashier,
  evaluateShiftAcceptance,
  shiftReasonCodesFor,
} from './shift-acceptance.js';

/**
 * SMENA YAKUNINI QABUL QILISH — servis (MK08 / 4M TZ §6).
 *
 * Qoida `shift-acceptance.ts` da; bu yerda faqat I/O: optimistik da'vo +
 * append-only jurnal, bitta tranzaksiyada.
 *
 * 🔴 **SUMMALARGA TEGMAYDI.** Bu sinf `closingCashMinor`, `expectedCashMinor`,
 * `discrepancyMinor` va Z-hisobot maydonlariga HECH QACHON yozmaydi — hatto
 * menejer «shu yerda xato bor» desa ham. Qabul = dalilni ko'rdim degani.
 * Raqamni tuzatish yo'li boshqa: rad etish → tushuntirish → alohida hujjat.
 * Aks holda farq akti dalil bo'lishdan to'xtardi (kamomad «tuzatilib»
 * yopilardi va keyin hech kim nima bo'lganini tiklay olmasdi).
 */
@Injectable()
export class ShiftAcceptanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CashierSessionService) private readonly sessions: CashierSessionService,
  ) {}

  // ── Navbat ────────────────────────────────────────────────────────────────

  /**
   * Menejer navbati: qabul kutayotgan smenalar, **eng eskisi birinchi**.
   *
   * Sana filtri bor va u ATAYLAB ixtiyoriy: migratsiya tarixiy yopilgan
   * smenalarni `pending` qilib qo'ydi (ularni hech kim ko'rmagani ROST), shu
   * sababli navbat birinchi kuni uzun bo'ladi. Menejer yaqin kunlardan
   * boshlaydi — lekin eskisi ro'yxatdan YO'QOLMAYDI.
   */
  async queue(
    accountId: string,
    params: {
      states?: readonly ShiftAcceptanceState[];
      cashierId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    } = {},
  ) {
    const states = params.states?.length ? [...params.states] : [...SHIFT_QUEUE_STATES];
    const rows = await this.prisma.client.cashierSession.findMany({
      where: {
        accountId,
        acceptanceState: { in: states },
        ...(params.cashierId ? { cashierId: params.cashierId } : {}),
        ...(params.from || params.to
          ? {
              closedAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ acceptanceChangedAt: 'asc' }, { closedAt: 'asc' }],
      take: params.limit ?? 200,
      select: {
        id: true,
        name: true,
        acceptanceState: true,
        acceptanceChangedAt: true,
        openedAt: true,
        closedAt: true,
        expectedCashMinor: true,
        closingCashMinor: true,
        discrepancyMinor: true,
        salesCount: true,
        salesSumMinor: true,
        cashier: { select: { id: true, name: true } },
        cashDesk: { select: { id: true, name: true, currency: true } },
        store: { select: { id: true, name: true } },
      },
    });

    return {
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        acceptanceState: r.acceptanceState as ShiftAcceptanceState,
        acceptanceChangedAt: r.acceptanceChangedAt,
        openedAt: r.openedAt,
        closedAt: r.closedAt,
        // Summalar FAQAT O'QISH uchun — navbat ekranida menejer nimani qabul
        // qilayotganini ko'rishi kerak.
        expectedCashMinor: r.expectedCashMinor?.toString() ?? null,
        closingCashMinor: r.closingCashMinor?.toString() ?? null,
        discrepancyMinor: r.discrepancyMinor?.toString() ?? null,
        salesCount: r.salesCount,
        salesSumMinor: r.salesSumMinor.toString(),
        cashier: r.cashier,
        cashDesk: r.cashDesk,
        store: r.store,
        // Kassir javobini kutayotgan smena menejer stolida EMAS — ekran shuni
        // ajratib ko'rsatadi, aks holda menejer o'zi kutayotgan narsani
        // qayta-qayta ochardi.
        awaitsCashier: awaitsCashier(r.acceptanceState as ShiftAcceptanceState),
      })),
    };
  }

  // ── Qabul ekrani ──────────────────────────────────────────────────────────

  /**
   * Qabul ekrani: Z-hisobot + farq akti + qabul jurnali + mumkin tugmalar.
   *
   * Z-hisobot QAYTA HISOBLANMAYDI — `CashierSessionService.zReport()` chaqiriladi
   * (farq aktlari ham o'sha yerda). Ikkinchi nusxa yozilsa ikki ekran bir
   * smena uchun ikki xil raqam ko'rsatib qo'yardi.
   */
  async detail(ctx: ShiftActorContext, sessionId: string) {
    const shift = await this.load(ctx, sessionId);
    const [zReport, events] = await Promise.all([
      this.sessions.zReport(ctx.accountId, sessionId),
      this.prisma.client.cashierSessionAcceptanceEvent.findMany({
        where: { accountId: ctx.accountId, sessionId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          fromState: true,
          toState: true,
          action: true,
          actorType: true,
          actorId: true,
          reasonCode: true,
          comment: true,
          createdAt: true,
        },
      }),
    ]);

    const state = shift.acceptanceState as ShiftAcceptanceState;
    const actions = allowedShiftActions(state, ctx.actor);
    return {
      id: shift.id,
      acceptanceState: state,
      acceptedById: shift.acceptedById,
      acceptedAt: shift.acceptedAt,
      acceptanceChangedAt: shift.acceptanceChangedAt,
      awaitsCashier: awaitsCashier(state),
      /** Ekrandagi tugmalar — ro'yxat FSM'dan, komponentdan EMAS. */
      allowedActions: actions,
      /** Har tugma uchun yopiq sabab ro'yxati (bo'sh = sabab so'ralmaydi). */
      reasonCodes: Object.fromEntries(actions.map((a) => [a, shiftReasonCodesFor(a)])),
      zReport,
      events,
    };
  }

  // ── O'tish ────────────────────────────────────────────────────────────────

  /**
   * Holat o'zgarishi. FSM ruxsat bersa — optimistik da'vo + jurnal, bitta
   * tranzaksiyada.
   */
  async transition(
    ctx: ShiftActorContext,
    sessionId: string,
    action: ShiftAcceptanceAction,
    input: { reasonCode?: string | null; comment?: string | null } = {},
  ) {
    const shift = await this.load(ctx, sessionId);
    const from = shift.acceptanceState as ShiftAcceptanceState;

    const verdict = evaluateShiftAcceptance({
      from,
      action,
      actor: ctx.actor,
      reasonCode: input.reasonCode,
      comment: input.comment,
    });
    if (!verdict.ok) throw shiftFsmError(verdict.failure);

    // IDEMPOTENTLIK: smena allaqachon maqsad holatida edi — na yozuv, na
    // jurnal qatori. Menejer navbatni klaviatura bilan yopganda `A` ni ikki
    // marta bosishi normal hodisa.
    if (verdict.noop) return { id: sessionId, from, to: verdict.to, changed: false };

    const now = new Date();
    // 🔴 SHU OBYEKT — qabul yozuvining BUTUN tarkibi. Bu yerda summa maydoni
    // yo'q va bo'lmaydi ham (`shift-acceptance.service.test.ts` qulflagan).
    const data: Prisma.CashierSessionUpdateManyMutationInput = {
      acceptanceState: verdict.to,
      acceptanceChangedAt: now,
    };
    if (
      verdict.to === SHIFT_ACCEPTANCE_STATE.accepted ||
      verdict.to === SHIFT_ACCEPTANCE_STATE.forceAccepted
    ) {
      data.acceptedById = ctx.actorId;
      data.acceptedAt = now;
    }
    // Navbatga qaytgan smena endi qabul qilingan emas — eski qabul izini
    // qoldirish «kim qabul qilgan» savoliga eski javob berardi.
    if (
      verdict.to === SHIFT_ACCEPTANCE_STATE.pending ||
      verdict.to === SHIFT_ACCEPTANCE_STATE.rejected
    ) {
      data.acceptedById = null;
      data.acceptedAt = null;
    }

    await this.prisma.client.$transaction(async (tx) => {
      // Optimistik da'vo: `acceptanceState` biz o'qigan qiymatda bo'lsagina
      // tegadi. Ikki menejer bir vaqtda bosganda faqat bittasi o'tadi.
      const claimed = await tx.cashierSession.updateMany({
        where: { id: sessionId, accountId: ctx.accountId, acceptanceState: from },
        data,
      });
      if (claimed.count === 0) {
        throw new ConflictException('Smena holati o`zgarib ketdi — sahifani yangilang');
      }
      await tx.cashierSessionAcceptanceEvent.create({
        data: {
          accountId: ctx.accountId,
          sessionId,
          fromState: from,
          toState: verdict.to,
          action,
          actorType: ctx.actor,
          actorId: ctx.actorId,
          reasonCode: input.reasonCode ?? null,
          comment: input.comment ?? null,
        },
      });
    });

    return { id: sessionId, from, to: verdict.to, changed: true };
  }

  // ── Tizim amallari ────────────────────────────────────────────────────────

  /**
   * Menejer N kundan beri javobsiz qoldirgan smenalar egaga chiqadi (§1.2).
   *
   * `acceptanceChangedAt` bo'yicha sanaydi — `updatedAt` YARAMAYDI: u har
   * qanday tahrirda yangilanadi va javobsiz smena hech qachon eskirmasdi.
   */
  async escalateOverdue(accountId: string, now = new Date()): Promise<{ escalated: number }> {
    const cutoff = new Date(now.getTime() - SHIFT_ESCALATE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.client.cashierSession.findMany({
      where: {
        accountId,
        acceptanceState: {
          in: [SHIFT_ACCEPTANCE_STATE.pending, SHIFT_ACCEPTANCE_STATE.rejected],
        },
        acceptanceChangedAt: { lt: cutoff },
      },
      select: { id: true },
    });

    let escalated = 0;
    for (const r of rows) {
      // Har biri ALOHIDA: bittasining poygada yutqazishi qolganini to'xtatmaydi.
      const out = await this.transition(
        { accountId, actor: SHIFT_ACTOR.system, actorId: null },
        r.id,
        SHIFT_ACCEPTANCE_ACTION.escalate,
        { reasonCode: 'no_response' },
      ).catch(() => null);
      if (out?.changed) escalated += 1;
    }
    return { escalated };
  }

  /**
   * Qabul qilingan smenaning hujjati keyin o'zgardi — qayta ko'rik kerak
   * (TZ §3.4 ning smena ko'rinishi). Chaqiruvchi: chek tahriri/qaytarish.
   *
   * Qabul qilinmagan smenaga TEGMAYDI: FSM `mark_stale` ni faqat muzlagan
   * holatdan qabul qiladi va bu yerda `catch` bilan jim yutiladi — «eskirdi»
   * signali navbatda turgan smenaga yolg'on bo'lardi.
   */
  async markStale(accountId: string, sessionId: string): Promise<{ marked: boolean }> {
    const out = await this.transition(
      { accountId, actor: SHIFT_ACTOR.system, actorId: null },
      sessionId,
      SHIFT_ACCEPTANCE_ACTION.markStale,
    ).catch(() => null);
    return { marked: out?.changed === true };
  }

  // ── Yordamchi ─────────────────────────────────────────────────────────────

  private async load(ctx: ShiftActorContext, sessionId: string) {
    const shift = await this.prisma.client.cashierSession.findFirst({
      where: { id: sessionId, accountId: ctx.accountId },
      select: {
        id: true,
        acceptanceState: true,
        cashierId: true,
        acceptedById: true,
        acceptedAt: true,
        acceptanceChangedAt: true,
      },
    });
    if (!shift) throw new NotFoundException('Smena topilmadi');
    // Kassir FAQAT o'z smenasiga tegishli amal qila oladi (tushuntirish).
    //
    // 403 EMAS, 404: «huquqingiz yo'q» javobi begona smenaning MAVJUDLIGINI
    // tasdiqlaydi — id terayotgan kassir kim qaysi smenada rad etilganini
    // bilib olardi (repodagi mavjud naqsh: `daily-kpi-acceptance.service`).
    if (ctx.actor === SHIFT_ACTOR.cashier && shift.cashierId !== ctx.actorId) {
      throw new NotFoundException('Smena topilmadi');
    }
    return shift;
  }
}

export interface ShiftActorContext {
  readonly accountId: string;
  readonly actor: ShiftActor;
  /** Employee id (`AuthenticatedUser.sub`). Tizim uchun null. */
  readonly actorId: string | null;
}

/**
 * FSM rad javobini HTTP xatosiga o'giradi. Xabar o'zbekcha va ANIQ: «bo'lmadi»
 * degan javob menejerni ekranga qaytarib yuborardi.
 */
function shiftFsmError(failure: ShiftFsmFailure): Error {
  switch (failure.code) {
    case 'unknown_action':
      return new BadRequestException(`Noma'lum amal: ${failure.action}`);
    case 'illegal_transition':
      return new ConflictException(
        `«${failure.from}» holatidagi smenaga «${failure.action}» amalini qo'llab bo'lmaydi`,
      );
    case 'actor_not_allowed':
      return new BadRequestException(`Bu amalni «${failure.actor}» bajara olmaydi`);
    case 'reason_required':
      return new BadRequestException('Sabab kodi majburiy');
    case 'unknown_reason':
      return new BadRequestException(`Noma'lum sabab kodi: ${failure.reasonCode}`);
    case 'comment_required':
      return new BadRequestException('«other» sababida izoh majburiy');
  }
}
