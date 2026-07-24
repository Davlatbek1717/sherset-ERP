import { Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { UpsertNotifyConfigSchema } from './hr-attendance-notify.schema.js';
import { HrAttendanceNotifyService } from './hr-attendance-notify.service.js';

@Controller('hr/attendance-notify')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrAttendanceNotifyController {
  constructor(@Inject(HrAttendanceNotifyService) private readonly svc: HrAttendanceNotifyService) {}

  @Get('config')
  @RequireHrPermission('employees', 'full')
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getConfig(user.accountId);
  }

  @Put('config')
  @RequireHrPermission('employees', 'full')
  async upsertConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = UpsertNotifyConfigSchema.parse(body);
    return this.svc.upsertConfig(user.accountId, input);
  }

  @Post('test')
  @RequireHrPermission('employees', 'full')
  async sendTest(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.sendTest(user.accountId);
  }
}
