import { Body, Controller, Get, Inject, Param, Patch, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { HrEmployeeScheduleService } from './employee-schedule.service.js';

/** Employee work-schedule + attendance-config, nested under /hr/employees/:id. */
@Controller('hr/employees')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeeScheduleController {
  constructor(@Inject(HrEmployeeScheduleService) private readonly svc: HrEmployeeScheduleService) {}

  @Get(':id/schedule')
  @RequireHrPermission('employees', 'read')
  async getSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getWeek(user.accountId, id);
  }

  @Put(':id/schedule')
  @RequireHrPermission('employees', 'full')
  async replaceSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.replaceWeek(user.accountId, id, body);
  }

  @Patch(':id/attendance-config')
  @RequireHrPermission('employees', 'full')
  async setConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.setConfig(user.accountId, id, body);
  }
}
