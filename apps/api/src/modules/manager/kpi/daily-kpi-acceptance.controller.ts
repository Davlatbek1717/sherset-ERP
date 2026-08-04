import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { ManagerGuard, resolveKpiActor } from '../manager.guard.js';
import {
  KpiAdjustSchema,
  KpiDecisionSchema,
  KpiQueueQuerySchema,
  KpiReasonedDecisionSchema,
} from './daily-kpi-acceptance.schema.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';
import { KPI_REASON_CODES } from './daily-kpi.fsm.js';

/**
 * Menejer — kunlik KPI qabul qilish (TZ 4M.2, egasining 1-ustuvorligi).
 *
 * `ManagerGuard` — yengil rol-gate (`hrRoles`), 4-B3 da ERP ruxsat matritsasiga
 * ko'chadi. Vakolat farqi (menejer / egasi) FSM ichida tekshiriladi:
 * `resolveKpiActor` foydalanuvchini aktyorga o'giradi, `applyTransition` esa
 * amalni shu aktyor bajara olishini hal qiladi — UI'da yashirish yetarli emas.
 */
@Controller('manager/kpi')
@UseGuards(JwtAuthGuard, ManagerGuard)
export class DailyKpiAcceptanceController {
  constructor(@Inject(DailyKpiAcceptanceService) private readonly svc: DailyKpiAcceptanceService) {}

  /** Sabab kodlari katalogi — FE tanlagichi uchun (yopiq ro'yxat, §5.3). */
  @Get('reason-codes')
  reasonCodes() {
    return KPI_REASON_CODES.map((code) => ({ code }));
  }

  /** Menejer navbati — og'ishli kunlar birinchi. */
  @Get('queue')
  queue(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.queue(user.accountId, KpiQueueQuerySchema.parse(query ?? {}));
  }

  /** Bitta kun — to'liq manzara (ko'rsatkichlar · ball · og'ish · jurnal). */
  @Get('day/:id')
  day(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getDay(user.accountId, id);
  }

  /** Kunni qabul qilish. Takror bosish — no-op (bonus ikki marta yozilmaydi). */
  @Post('day/:id/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const input = KpiDecisionSchema.parse(body ?? {});
    return this.svc.transition(user.accountId, id, 'accept', {
      actor: resolveKpiActor(user),
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }

  /** Rad etish — xodimdan tushuntirish so'raladi. Sabab MAJBURIY. */
  @Post('day/:id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const input = KpiReasonedDecisionSchema.parse(body);
    return this.svc.transition(user.accountId, id, 'reject', {
      actor: resolveKpiActor(user),
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }

  /** Qabul qilingan kunni qayta ochish — sabab MAJBURIY (§10.2). */
  @Post('day/:id/reopen')
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const input = KpiReasonedDecisionSchema.parse(body);
    return this.svc.transition(user.accountId, id, 'reopen', {
      actor: resolveKpiActor(user),
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }

  /** Egaga eskalatsiya — menejer o'zi hal qila olmaydigan holat. */
  @Post('day/:id/escalate')
  escalate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const input = KpiDecisionSchema.parse(body ?? {});
    return this.svc.transition(user.accountId, id, 'escalate', {
      actor: resolveKpiActor(user),
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }

  /**
   * Egasi majburiy yopadi (§1.2 boshi berk ko'cha klapani). Sabab MAJBURIY.
   * Vakolatni FSM tekshiradi: menejer bu amalni bajara olmaydi (403).
   */
  @Post('day/:id/force-accept')
  forceAccept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = KpiReasonedDecisionSchema.parse(body);
    return this.svc.transition(user.accountId, id, 'force_accept', {
      actor: resolveKpiActor(user),
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
    });
  }

  /**
   * Ko'rsatkich tuzatmasi — `autoValue` TEGILMAYDI, tuzatma yonma-yon yoziladi.
   * Qabul qilingan kunga yozilmaydi (muzlatish): avval qayta oching.
   */
  @Put('day/:id/metric/:metricKey')
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('metricKey') metricKey: string,
    @Body() body: unknown,
  ) {
    const input = KpiAdjustSchema.parse(body);
    return this.svc.adjustMetric(user.accountId, id, metricKey, {
      value: input.value,
      reasonCode: input.reasonCode,
      note: input.note,
      actor: resolveKpiActor(user),
      actorId: user.sub,
    });
  }
}
