import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { ReportPeriodSchema } from './hr-reports.schema.js';
import { HrReportsService } from './hr-reports.service.js';

@Controller('hr/reports')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrReportsController {
  constructor(@Inject(HrReportsService) private readonly svc: HrReportsService) {}

  @Get()
  @RequireHrPermission('reports', 'read')
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const input = ReportPeriodSchema.parse(query);
    return this.svc.report(user.accountId, input);
  }
}
