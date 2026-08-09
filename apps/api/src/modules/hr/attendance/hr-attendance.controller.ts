import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  CheckInSchema,
  EditAttendanceSchema,
  ManualCheckOutSchema,
  ReportFilterSchema,
  TodayFilterSchema,
} from './hr-attendance.schema.js';
import { HrAttendanceService } from './hr-attendance.service.js';

@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrAttendanceController {
  constructor(@Inject(HrAttendanceService) private readonly svc: HrAttendanceService) {}

  @Get('today')
  @RequireHrPermission('employees', 'read')
  async today(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = TodayFilterSchema.parse(query);
    return this.svc.listToday(user.accountId, filter.date);
  }

  @Get('report')
  @RequireHrPermission('employees', 'read')
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const filter = ReportFilterSchema.parse(query);
    return this.svc.report(user.accountId, filter);
  }

  @Post('check-in')
  @RequireHrPermission('employees', 'full')
  async checkIn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CheckInSchema.parse(body);
    return this.svc.checkIn(user.accountId, input);
  }

  @Post('check-out')
  @RequireHrPermission('employees', 'full')
  async checkOutByEmployee(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.checkOutByEmployee(user.accountId, ManualCheckOutSchema.parse(body));
  }

  @Post(':id/check-out')
  @RequireHrPermission('employees', 'full')
  async checkOut(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.checkOut(user.accountId, id);
  }

  @Patch(':id')
  @RequireHrPermission('employees', 'full')
  async edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = EditAttendanceSchema.parse(body);
    return this.svc.edit(user.accountId, id, user.sub, input);
  }

  @Delete(':id')
  @RequireHrPermission('employees', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // HR-13 — soft-delete audit izi «kim o'chirdi»ni yozadi.
    return this.svc.delete(user.accountId, id, user.sub);
  }
}
