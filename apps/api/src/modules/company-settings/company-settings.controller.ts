import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { UpdateCompanySettingsSchema } from './company-settings.schema.js';
import { CompanySettingsService } from './company-settings.service.js';

/** moysklad Настройки → Настройки компании (singleton per account). */
@Controller('company-settings')
@UseGuards(JwtAuthGuard)
export class CompanySettingsController {
  constructor(@Inject(CompanySettingsService) private readonly svc: CompanySettingsService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.get(user.accountId);
  }

  @Put()
  @RequirePermission({ entity: 'settings', action: 'update' })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const input = UpdateCompanySettingsSchema.parse(body);
    return this.svc.update(user.accountId, input, user.sub);
  }
}
