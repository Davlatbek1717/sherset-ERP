import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UserSettingsService } from './user-settings.service.js';

/**
 * «Настройки пользователя» — the current user's own settings (moysklad
 * `#account`). No RequirePermission: every authenticated user manages their
 * OWN settings, scoped by the auth subject (`user.sub` = employee id).
 */
@Controller('user-settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(@Inject(UserSettingsService) private readonly svc: UserSettingsService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getForEmployee(user.sub, user.accountId);
  }

  @Put()
  async update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.update(user.sub, body);
  }
}
