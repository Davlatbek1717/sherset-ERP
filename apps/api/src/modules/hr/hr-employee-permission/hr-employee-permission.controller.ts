import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { PutPermissionsSchema } from './hr-employee-permission.schema.js';
import { HrEmployeePermissionService } from './hr-employee-permission.service.js';

@Controller('hr/employees/:employeeId/permissions')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrEmployeePermissionController {
  constructor(
    @Inject(HrEmployeePermissionService)
    private readonly svc: HrEmployeePermissionService,
  ) {}

  @Get()
  @RequireHrPermission('employees', 'read')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('employeeId') employeeId: string) {
    return this.svc.list(user.accountId, employeeId);
  }

  @Put()
  @RequireHrPermission('employees', 'full')
  async replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() body: unknown,
  ) {
    const input = PutPermissionsSchema.parse(body);
    // user.sub — HR-10 self-eskalatsiya tekshiruvi uchun aktor.
    return this.svc.replace(user.accountId, employeeId, input, user.sub);
  }
}
