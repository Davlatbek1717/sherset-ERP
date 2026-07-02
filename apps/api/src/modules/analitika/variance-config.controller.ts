import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { VarianceConfigService } from './variance-config.service.js';

@Controller('analitika/settings/variance')
@UseGuards(JwtAuthGuard)
export class VarianceConfigController {
  constructor(@Inject(VarianceConfigService) private readonly svc: VarianceConfigService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.get(user.accountId);
  }

  @Put()
  @RequirePermission({ entity: 'analitika', action: 'update' })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.update(user.accountId, body);
  }
}
