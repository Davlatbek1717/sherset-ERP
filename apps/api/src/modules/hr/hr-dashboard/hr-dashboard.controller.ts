import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { HrDashboardService } from './hr-dashboard.service.js';

@Controller('hr/dashboard')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrDashboardController {
  constructor(@Inject(HrDashboardService) private readonly svc: HrDashboardService) {}

  @Get('summary')
  @RequireHrPermission('dashboard', 'read')
  async summary(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.summary(user.accountId);
  }
}
