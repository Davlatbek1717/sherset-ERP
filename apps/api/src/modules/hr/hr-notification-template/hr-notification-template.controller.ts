import { Body, Controller, Delete, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import {
  CreateHrNotificationTemplateSchema,
  UpdateHrNotificationTemplateSchema,
} from './hr-notification-template.schema.js';
import { HrNotificationTemplateService } from './hr-notification-template.service.js';

@Controller('hr/notification-templates')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrNotificationTemplateController {
  constructor(
    @Inject(HrNotificationTemplateService)
    private readonly svc: HrNotificationTemplateService,
  ) {}

  @Get()
  @RequireHrPermission('settings', 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  @Get(':id')
  @RequireHrPermission('settings', 'read')
  async findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOne(user.accountId, id);
  }

  @Post()
  @RequireHrPermission('settings', 'full')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = CreateHrNotificationTemplateSchema.parse(body);
    return this.svc.create(user.accountId, input);
  }

  @Put(':id')
  @RequireHrPermission('settings', 'full')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = UpdateHrNotificationTemplateSchema.parse(body);
    return this.svc.update(user.accountId, id, input);
  }

  @Delete(':id')
  @RequireHrPermission('settings', 'full')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.remove(user.accountId, id);
  }

  /** One-shot seed of the 5 defaults for the workspace. Idempotent. */
  @Post('seed-defaults')
  @RequireHrPermission('settings', 'full')
  async seedDefaults(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.seedDefaults(user.accountId);
  }
}
