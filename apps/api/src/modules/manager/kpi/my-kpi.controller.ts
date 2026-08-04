import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { KpiDecisionSchema, KpiQueueQuerySchema } from './daily-kpi-acceptance.schema.js';
import { DailyKpiAcceptanceService } from './daily-kpi-acceptance.service.js';

/**
 * Xodimning O'Z KPI kunlari (TZ §1.2, §3.3).
 *
 * Nega alohida controller: bu yerda `ManagerGuard` YO'Q — har xodim kiradi,
 * lekin faqat o'z kuniga. Ikki narsani ta'minlaydi:
 *   1. «Kuningiz hali qabul qilinmagan» — xodim buni ko'rib turadi, oylik
 *      kuni kutilmagan hodisa bo'lmaydi;
 *   2. **tushuntirish halqasi** — rad etilgan kunga xodim javob yozadi va kun
 *      navbatga qaytadi. Nizoda yozma iz qoladi (ham xodimni, ham menejerni
 *      himoya qiladi).
 *
 * Begona kunga murojaatda **404** qaytadi (403 emas) — boshqa xodim kunining
 * mavjudligi ham sizib chiqmasligi kerak.
 */
@Controller('manager/kpi/my')
@UseGuards(JwtAuthGuard)
export class MyKpiController {
  constructor(@Inject(DailyKpiAcceptanceService) private readonly svc: DailyKpiAcceptanceService) {}

  /** O'z kunlarim — holati bilan. */
  @Get('days')
  days(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const q = KpiQueueQuerySchema.parse(query ?? {});
    return this.svc.queue(user.accountId, {
      ...q,
      // Filtrdagi `employeeId` E'TIBORGA OLINMAYDI — doim so'rovchi o'zi.
      employeeId: user.sub,
      states: q.states?.length
        ? q.states
        : ['pending', 'rejected', 'stale', 'escalated', 'accepted'],
    });
  }

  /** Rad etilgan kunga tushuntirish — kun navbatga qaytadi. */
  @Post('day/:id/explain')
  explain(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const input = KpiDecisionSchema.parse(body ?? {});
    return this.svc.transition(user.accountId, id, 'explain', {
      actor: 'employee',
      actorId: user.sub,
      reasonCode: input.reasonCode,
      note: input.note,
      expectEmployeeId: user.sub,
    });
  }
}
