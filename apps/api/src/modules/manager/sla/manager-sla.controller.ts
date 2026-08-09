import { Body, Controller, Get, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../../hr/hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../../hr/hr-auth/require-hr-permission.decorator.js';
import { SlaBoardQuerySchema, SlaStageConfigBodySchema } from './manager-sla.schema.js';
import { ManagerSlaService } from './manager-sla.service.js';

/**
 * MK10 / 4M TZ §8 — «nima qotib qolgan» + SLA panelining HTTP sirti.
 *
 * Ruxsat: `employees:read` (ko'rish) va `employees:full` (chegara sozlash) —
 * `manager/queue` va `manager/kpi` bilan AYNAN bir xil darvoza. Yangi
 * `PermissionEntity` kiritilmadi: u seed matritsasini ham talab qilardi va
 * MK10 qamrovidan tashqarida (MK26–MK30 ruxsat modeli to'lqini).
 *
 * 🔴 Bu yerda hech bir endpoint hujjat holatini o'zgartirmaydi — panel
 * kuzatadi, to'xtatmaydi (§5.1).
 */
@Controller('manager/sla')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class ManagerSlaController {
  constructor(@Inject(ManagerSlaService) private readonly service: ManagerSlaService) {}

  /** Qotib qolganlar — eng ko'p oshib ketgani tepada. */
  @Get()
  @RequireHrPermission('employees', 'read')
  async board(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.board(user.accountId, SlaBoardQuerySchema.parse(query ?? {}));
  }

  /** Bosqich chegaralari — registr + akkаunt sozlamasi. */
  @Get('stages')
  @RequireHrPermission('employees', 'read')
  async stages(@CurrentUser() user: AuthenticatedUser) {
    return this.service.stages(user.accountId);
  }

  /** Chegarani o'zgartirish (DoD: «SLA chegaralari sozlamada»). */
  @Put('stages/:stage')
  @RequireHrPermission('employees', 'full')
  async updateStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stage') stage: string,
    @Body() body: unknown,
  ) {
    return this.service.updateStage(
      user.accountId,
      user.sub,
      stage,
      SlaStageConfigBodySchema.parse(body ?? {}),
    );
  }
}
