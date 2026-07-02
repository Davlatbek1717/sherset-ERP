import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { KpiDailyFilterSchema, SnapshotTriggerSchema } from './hr-kpi.schema.js';
import { HrKpiService } from './hr-kpi.service.js';

@Controller('hr/kpi')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrKpiController {
  constructor(@Inject(HrKpiService) private readonly svc: HrKpiService) {}

  @Get('daily')
  @RequireHrPermission('oylik', 'read')
  async listDaily(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = KpiDailyFilterSchema.parse(query);
    return this.svc.listDaily(user.accountId, filter);
  }

  /** Admin manual re-run for a specific day (default today). */
  @Post('snapshot')
  @RequireHrPermission('oylik', 'full')
  async snapshot(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = SnapshotTriggerSchema.parse(body);
    return this.svc.snapshotDay(user.accountId, input.date ?? new Date());
  }
}
