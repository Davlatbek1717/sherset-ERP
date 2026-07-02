import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { CreateHrRoleSchema, UpdateHrRoleSchema } from './hr-role.schema.js';
import { HrRoleService } from './hr-role.service.js';

@Controller('hr/roles')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrRoleController {
  constructor(@Inject(HrRoleService) private readonly svc: HrRoleService) {}

  @Get()
  @RequireHrPermission('settings', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Post()
  @RequireHrPermission('settings', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, CreateHrRoleSchema.parse(body));
  }

  @Put(':id')
  @RequireHrPermission('settings', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, UpdateHrRoleSchema.parse(body));
  }

  @Delete(':id')
  @RequireHrPermission('settings', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }
}
