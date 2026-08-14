import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ShiftAcceptanceQuerySchema, ShiftTransitionSchema } from './cashier-session.schema.js';
import { CashierSessionService } from './cashier-session.service.js';
import { SHIFT_ACTOR, type ShiftActor } from './shift-acceptance.js';
import { ShiftAcceptanceService, type ShiftActorContext } from './shift-acceptance.service.js';

@Controller('cashier-sessions')
@UseGuards(JwtAuthGuard)
export class CashierSessionController {
  constructor(
    @Inject(CashierSessionService) private readonly sessions: CashierSessionService,
    @Inject(ShiftAcceptanceService) private readonly acceptance: ShiftAcceptanceService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.sessions.list(user.accountId, query);
  }

  /**
   * Returns the currently open session for the authenticated cashier, or null.
   * Must be declared BEFORE :id to avoid route conflict.
   */
  @Get('current')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.findCurrentForCashier(user.accountId, user.sub);
  }

  /**
   * Inkassatsiya qabul qiluvchilari (id + name).
   *
   * `current` kabi — `:id` dan OLDIN. Fastify statik segmentni parametrik
   * segmentdan ustun qo'yadi, lekin bu yozilmagan kafolatga tayanmaymiz:
   * fayldagi konventsiya «statik yo'l avval turadi».
   */
  @Get('cash-out-recipients')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async cashOutRecipients(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.cashOutRecipients(user.accountId, user.sub);
  }

  /** Bitta pul-chiqishi hujjati — RKO cheki uchun (§8.2). */
  @Get('cash-out/:docId')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async cashOutDoc(@CurrentUser() user: AuthenticatedUser, @Param('docId') docId: string) {
    return this.sessions.cashOutDoc(user.accountId, docId);
  }

  /**
   * Farq aktlari (kassa TZ §8.4) — default FAQAT ko'rilmaganlar.
   *
   * `:id` dan OLDIN: statik yo'l birinchi (fayldagi konventsiya).
   */
  @Get('variances')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async listVariances(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.sessions.listVariances(user.accountId, query);
  }

  // ── MK08 · smena yakunini qabul qilish (4M TZ §6) ───────────────────────
  //
  // ⚠️ Yo'llar `:id` dan OLDIN: `acceptance` statik segmenti aks holda
  // `:id` ga tushib qolardi (fayldagi konvensiya — `current`, `variances`).

  /** Menejer navbati: qabul kutayotgan smenalar (eng eskisi birinchi). */
  @Get('acceptance/queue')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async acceptanceQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = ShiftAcceptanceQuerySchema.parse(query);
    return this.acceptance.queue(user.accountId, parsed);
  }

  /** Qabul ekrani: Z-hisobot + farq akti + jurnal + mumkin tugmalar. */
  @Get('acceptance/:id')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async acceptanceDetail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.acceptance.detail(shiftCtxOf(user), id);
  }

  /**
   * Qabul / rad etish / tushuntirish / eskalatsiya / qayta ochish.
   *
   * 🔴 Bu yo'l SUMMALARGA TEGMAYDI — servis darajasida qulflangan. Ruxsat
   * `update` (`create` emas): qabul yangi hujjat yaratmaydi.
   */
  @Post('acceptance/:id/transition')
  @RequirePermission({ entity: 'cashiersession', action: 'update' })
  async acceptanceTransition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = ShiftTransitionSchema.parse(body);
    return this.acceptance.transition(shiftCtxOf(user), id, parsed.action, {
      reasonCode: parsed.reasonCode ?? null,
      comment: parsed.comment ?? null,
    });
  }

  /** Aktni tan olish — summalar o'zgarmaydi, faqat «ko'rildi» + izoh. */
  @Post('variances/:varianceId/acknowledge')
  @RequirePermission({ entity: 'cashiersession', action: 'update' })
  async acknowledgeVariance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('varianceId') varianceId: string,
    @Body() body: unknown,
  ) {
    return this.sessions.acknowledgeVariance(user.accountId, user.sub, varianceId, body);
  }

  @Get(':id')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.findById(user.accountId, id);
  }

  @Post('open')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async open(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.sessions.open(user.accountId, user.sub, body);
  }

  @Post(':id/close')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.close(user.accountId, user.sub, id, body);
  }

  /** Внесение наличных in the drawer during an open shift. */
  @Post(':id/drawer-in')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async drawerIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.drawerCashIn(user.accountId, user.sub, id, body);
  }

  /** Изъятие наличных from the drawer during an open shift. */
  @Post(':id/drawer-out')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async drawerOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.drawerCashOut(user.accountId, user.sub, id, body);
  }

  /**
   * Xarajat (RKO) yoki inkassatsiya — kassa TZ §8.2 / §8.3.
   *
   * Tasdiq talab qilinmaydi (Q10): kassir erkin yozadi, muvozanat —
   * §9 audit jurnali. Shu sababli ruxsat `drawer-out` bilan bir xil.
   */
  @Post(':id/cash-out')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async cashOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.posCashOut(user.accountId, user.sub, id, body);
  }

  /**
   * F5 — smenani yopishga to'sqinlik qiluvchi cheklar (draft|picking|ready)
   * STRUKTURA sifatida. Mezon `close()` bilan yagona yordamchida; endpoint
   * faqat o'qiydi — yopish qoidalari o'zgarmagan.
   */
  @Get(':id/unresolved')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async unresolved(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.unresolvedSales(user.accountId, id);
  }

  /**
   * Z-hisobot (kassa TZ §8.5) — smenaning to'liq moliyaviy manzarasi.
   *
   * Ochiq smenada ham ishlaydi (kassir kun o'rtasida holatni ko'radi):
   * bu holda sanoq va farq `null` — hali sanalmagan, nol EMAS.
   */
  @Get(':id/z-report')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async zReport(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.zReport(user.accountId, id);
  }

  /** Smenadagi pul chiqishi — turlar va moddalar kesimida (Z-hisobot §8.5). */
  @Get(':id/cash-out-summary')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async cashOutSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.cashOutSummary(user.accountId, id);
  }

  /** Posted drawer Внесение/Изъятие for a shift. */
  @Get(':id/drawer')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async drawerOps(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.listDrawerOps(user.accountId, id);
  }
}

/**
 * Aktyor roli — mavjud `hrRoles` konvensiyasidan (yangi rol tizimi o'ylab
 * topilmaydi; `manager-kpi.controller.resolveActor` bilan bir xil qoida):
 * `admin` = EGA, `manager` = menejer, qolgani = KASSIR (faqat o'z smenasiga
 * tushuntirish bera oladi).
 */
export function resolveShiftActor(user: AuthenticatedUser): ShiftActor {
  const roles = user.hrRoles ?? [];
  if (roles.includes('admin')) return SHIFT_ACTOR.owner;
  if (roles.includes('manager')) return SHIFT_ACTOR.manager;
  return SHIFT_ACTOR.cashier;
}

function shiftCtxOf(user: AuthenticatedUser): ShiftActorContext {
  return { accountId: user.accountId, actor: resolveShiftActor(user), actorId: user.sub };
}
