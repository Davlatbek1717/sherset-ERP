import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { LiveStatusService } from '../live/live-status.service.js';
import { type ActorContext, DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
import { DailyKpiDrilldownService } from './daily-kpi-drilldown.service.js';
import {
  ACTOR,
  type Actor,
  DAILY_KPI_ACTION,
  DAILY_KPI_STATE,
  type DailyKpiState,
  REASON_CODES,
  allowedActions,
} from './daily-kpi-fsm.js';
import { KpiMetricCatalogService } from './kpi-metric-catalog.service.js';
import {
  AdjustSchema,
  DrilldownQuerySchema,
  QueueFilterSchema,
  SaveCustomMetricSchema,
  TransitionSchema,
} from './manager-kpi.schema.js';
import { OwnerWeeklySummaryService } from './owner-weekly-summary.service.js';

/**
 * Menejer — kunlik KPI qabul qilish HTTP sirti (4M.2).
 *
 * IKKI QATLAMLI RUXSAT, ataylab:
 *   1. **Qo'pol darvoza** — `HrPermissionGuard` + `employees:read`. Bu shunchaki
 *      «HR ma'lumotini ko'rish huquqi bormi» degan savol.
 *   2. **Nozik darvoza** — FSM aktyor qoidalari (`daily-kpi-fsm.ts`). Kimning
 *      qaysi amalni qila olishi SHU YERDA emas, FSM'da hal bo'ladi: qabul
 *      qilish menejer/egaga, majburiy yopish faqat egaga, tushuntirish
 *      xodimga (va faqat O'Z kuniga).
 *
 * `explain` metodida ATAYLAB `@RequireHrPermission` YO'Q: oddiy xodimda
 * `employees:read` bo'lmaydi, lekin u o'z kuniga tushuntirish bera olishi
 * SHART — busiz rad etish → tushuntirish halqasi (§3.3) uzilib qolardi.
 * Guard metadata topmasa o'tkazib yuboradi; egalik tekshiruvi servisda.
 */
@Controller('manager/kpi')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerKpiController {
  constructor(
    @Inject(DailyKpiAcceptanceService) private readonly acceptance: DailyKpiAcceptanceService,
    @Inject(DailyKpiDrilldownService) private readonly drilldown: DailyKpiDrilldownService,
    @Inject(KpiMetricCatalogService) private readonly catalog: KpiMetricCatalogService,
    @Inject(OwnerWeeklySummaryService) private readonly weekly: OwnerWeeklySummaryService,
    @Inject(LiveStatusService) private readonly live: LiveStatusService,
  ) {}

  /**
   * Jonli holat (4M.4, M-Q10) — «hozir kim nima qilyapti».
   *
   * Diqqat talab qiladigan qatorlar TEPADA: bu ekran «hammasi joyida»
   * demaydi, u menejerni aynan aralashuv kerak joyga olib boradi.
   */
  /**
   * Javobgarlik (4M.4) — «kimda nima qolgan»: ochiq smena · topshirilmagan
   * naqd · tugallanmagan yig'ish · qabul qilinmagan KPI kunlari.
   *
   * Jihoz bu yerda YO'Q — reyestr mavjud emas (servis izohiga qarang).
   */
  @Get('accountability')
  @RequireHrPermission('employees', 'read')
  async accountability(@CurrentUser() user: AuthenticatedUser) {
    return this.live.accountability(user.accountId);
  }

  @Get('live')
  @RequireHrPermission('employees', 'read')
  async liveBoard(@CurrentUser() user: AuthenticatedUser) {
    return this.live.board(user.accountId);
  }

  /**
   * Egaga haftalik xulosa (M-Q7) — «menejerni kim nazorat qiladi».
   *
   * Sana berilmasa O'TGAN hafta: dushanba ertalab ochilgan ekran shu
   * haftaning bir yarim kunini emas, TUGAGAN haftani ko'rsatishi kerak.
   * Hech narsani bloklamaydi — faqat ko'rinadi (§7).
   */
  @Get('weekly-summary')
  @RequireHrPermission('employees', 'read')
  async weeklySummary(@CurrentUser() user: AuthenticatedUser, @Query('week') week?: string) {
    const ref = week ? new Date(week) : undefined;
    const s = await this.weekly.summary(
      user.accountId,
      ref && !Number.isNaN(ref.getTime()) ? ref : undefined,
    );
    return {
      weekStart: s.weekStart,
      weekEndExclusive: s.weekEndExclusive,
      totalAccepted: s.totalAccepted,
      totalAdjust: s.totalAdjust,
      totalAdjustedAbsMinor: s.totalAdjustedAbsMinor.toString(),
      totalForceAccepted: s.totalForceAccepted,
      pendingDays: s.pendingDays,
      staleDays: s.staleDays,
      topAdjuster: s.topAdjuster
        ? {
            managerId: s.topAdjuster.managerId,
            managerName: s.topAdjuster.managerName,
            adjustCount: s.topAdjuster.adjustCount,
            adjustedAbsMinor: s.topAdjuster.adjustedAbsMinor.toString(),
          }
        : null,
      activity: s.activity.map((a: (typeof s.activity)[number]) => ({
        managerId: a.managerId,
        managerName: a.managerName,
        acceptedCount: a.acceptedCount,
        rejectedCount: a.rejectedCount,
        adjustCount: a.adjustCount,
        adjustedAbsMinor: a.adjustedAbsMinor.toString(),
        forceAcceptedCount: a.forceAcceptedCount,
      })),
    };
  }

  // ── Ko'rsatkich katalogi (hisobning O'Z KPI'lari) ────────────────────────

  // ⚠️ `GET metrics` BU YERDA YO'Q — u `KpiConfigController` da
  // (`@Controller('manager/kpi')` ham o'sha prefiks). Ikkalasida ham
  // e'lon qilinganda Fastify `FST_ERR_DUPLICATED_ROUTE` bilan butun API'ni
  // ko'tarmaydi (2026-08-05 da prod 502 bo'ldi). Yozuv qatlami shu yerda,
  // o'qish qatlami o'sha yerda qoladi.

  /** Yangi KPI yaratish. Manba doim `manual` — faktni menejer kiritadi. */
  @Post('metrics')
  createMetric(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.catalog.create(user.accountId, SaveCustomMetricSchema.parse(body));
  }

  /** Nomi/birligi/yo'nalishini tahrirlash. KALIT o'zgarmaydi (tarix uzilmasin). */
  @Post('metrics/:key')
  updateMetric(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    return this.catalog.update(user.accountId, key, SaveCustomMetricSchema.parse(body));
  }

  /** Arxivlash — o'chirish EMAS (o'tgan kunlarning raqamlari saqlanadi). */
  @Post('metrics/:key/archive')
  archiveMetric(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.catalog.archive(user.accountId, key);
  }

  /** Menejer navbati — og'ishli kunlar birinchi. */
  @Get('days')
  @RequireHrPermission('employees', 'read')
  async queue(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = QueueFilterSchema.parse(query ?? {});
    return this.acceptance.queue(user.accountId, {
      ...filter,
      states: filter.states as DailyKpiState[] | undefined,
    });
  }

  /** Bitta xodim kuni — ko'rsatkichlar, og'ish, jurnal. */
  @Get('days/:id')
  @RequireHrPermission('employees', 'read')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const day = await this.acceptance.detail(user.accountId, id);
    const actor = resolveActor(user);
    return {
      ...day,
      /** Ekran tugmalari shundan chiziladi — FE o'z shartini yozmasin. */
      actor,
      allowedActions: allowedActions(day.state, actor),
    };
  }

  /** «Bu raqam qayerdan chiqdi» — tile ortidagi hujjatlar. */
  @Get('days/:id/drilldown')
  @RequireHrPermission('employees', 'read')
  async drill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const q = DrilldownQuerySchema.parse(query ?? {});
    return this.drilldown.forMetric(user.accountId, id, q.metric, q.limit ?? 100);
  }

  /** Qabul · rad · eskalatsiya · majburiy yopish · qayta ochish. */
  @Post('days/:id/transition')
  @RequireHrPermission('employees', 'read')
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = TransitionSchema.parse(body);
    return this.acceptance.transition(ctxOf(user), id, input.action, input);
  }

  /** Ko'rsatkich tuzatmasi — `autoValue` ga tegilmaydi. */
  @Post('days/:id/adjust')
  @RequireHrPermission('employees', 'read')
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = AdjustSchema.parse(body);
    return this.acceptance.adjust(ctxOf(user), id, {
      metricKey: input.metricKey,
      adjustValue: input.adjustValue == null ? null : BigInt(input.adjustValue),
      reasonCode: input.reasonCode,
      comment: input.comment,
    });
  }

  /**
   * Xodimning tushuntirishi — rad etilgan kunni navbatga qaytaradi.
   * HR sahifa-ruxsati TALAB QILINMAYDI (yuqoridagi izohga qara).
   */
  @Post('days/:id/explain')
  async explain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = TransitionSchema.parse({ ...(body as object), action: DAILY_KPI_ACTION.explain });
    return this.acceptance.transition(ctxOf(user), id, DAILY_KPI_ACTION.explain, input);
  }

  /**
   * Ma'lumotnoma: ko'rsatkich katalogi, holatlar va sabab kodlari.
   * FE bu ro'yxatlarni O'ZIDA takrorlamasin — ular FSM bilan bir manbadan.
   */
  @Get('reference')
  async reference(@CurrentUser() user: AuthenticatedUser) {
    return {
      metrics: (await this.catalog.list(user.accountId)).map((m) => ({
        key: m.key,
        labelUz: m.labelUz,
        labelRu: m.labelRu,
        unit: m.unit,
        direction: m.direction,
        perHour: m.perHour,
        source: m.source,
      })),
      states: Object.values(DAILY_KPI_STATE),
      reasonCodes: REASON_CODES,
    };
  }
}

/**
 * Aktyor roli — mavjud `hrRoles` konvensiyasidan (yangi rol tizimi
 * o'ylab topilmaydi): `admin` HR'da allaqachon «hammasi mumkin» degani
 * (`hr-permission.guard.ts`), shuning uchun u EGA. `manager` — menejer.
 * Qolgani oddiy xodim: faqat O'Z kuniga tushuntirish bera oladi.
 */
export function resolveActor(user: AuthenticatedUser): Actor {
  const roles = user.hrRoles ?? [];
  if (roles.includes('admin')) return ACTOR.owner;
  if (roles.includes('manager')) return ACTOR.manager;
  return ACTOR.employee;
}

function ctxOf(user: AuthenticatedUser): ActorContext {
  return { accountId: user.accountId, actor: resolveActor(user), actorId: user.sub };
}
