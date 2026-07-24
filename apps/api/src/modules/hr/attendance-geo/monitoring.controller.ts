import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { DailyMonitoringFilterSchema, MarksFilterSchema } from './monitoring.schema.js';
import { HrMonitoringService } from './monitoring.service.js';

/** Xodimlarni kuzatish — live board + per-employee marks (read-only). */
@Controller('hr/monitoring')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrMonitoringController {
  constructor(@Inject(HrMonitoringService) private readonly svc: HrMonitoringService) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async daily(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.daily(user.accountId, DailyMonitoringFilterSchema.parse(query));
  }

  @Get(':employeeId/marks')
  @RequireHrPermission('employees', 'read')
  async marks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Query() query: unknown,
  ) {
    return this.svc.marks(user.accountId, employeeId, MarksFilterSchema.parse(query));
  }
}
