import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { DecisionJournalService } from './decision-journal.service.js';
import { DecisionJournalQuerySchema } from './manager-journal.schema.js';

/**
 * MK21 — «Qaror jurnali» HTTP sirti (4M TZ §8.1/8).
 *
 * Ruxsat: `employees:read` — `manager/queue`, `manager/kpi` va `manager/sla`
 * bilan AYNAN bir xil darvoza. Yangi `PermissionEntity` kiritilmadi: u seed
 * matritsasini ham talab qilardi va MK21 qamrovidan tashqarida (MK26–MK30
 * ruxsat modeli to'lqini) — MK10/MK16 dagi bir xil qaror.
 *
 * 🔴 Faqat O'QISH. Yozuvchi endpoint bu yerda hech qachon paydo bo'lmasligi
 * kerak: jurnalning yagona haqiqat manbai — hodisani YARATGAN modul
 * (`decision-journal-read-only.test.ts` mexanik qulflaydi).
 */
@Controller('manager/decisions')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerJournalController {
  constructor(@Inject(DecisionJournalService) private readonly service: DecisionJournalService) {}

  /** Qarorlar oqimi — eng yangisi tepada, bekor qilinganlari BELGI bilan. */
  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.list(user.accountId, DecisionJournalQuerySchema.parse(query ?? {}));
  }
}
