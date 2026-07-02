import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AppInstallService } from './app-install.service.js';

@Controller('app-installs')
@UseGuards(JwtAuthGuard)
export class AppInstallController {
  constructor(@Inject(AppInstallService) private readonly svc: AppInstallService) {}

  /**
   * GET /app-installs/available
   * Returns static catalog merged with this account's install state.
   * Must be declared before :appKey to avoid conflict.
   */
  @Get('available')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listAvailable(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listAvailable(user.accountId);
  }

  @Get(':appKey')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findByKey(@CurrentUser() user: AuthenticatedUser, @Param('appKey') appKey: string) {
    return this.svc.findByKey(user.accountId, appKey);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  async install(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.install(user.accountId, body);
  }

  @Delete(':appKey')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async uninstall(@CurrentUser() user: AuthenticatedUser, @Param('appKey') appKey: string) {
    return this.svc.uninstall(user.accountId, appKey);
  }

  @Patch(':appKey/config')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appKey') appKey: string,
    @Body() body: unknown,
  ) {
    return this.svc.saveConfig(user.accountId, appKey, body);
  }
}
