import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { BankService } from './bank.service.js';

@Controller('bank-api')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(@Inject(BankService) private readonly svc: BankService) {}

  @Get('configs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listConfigs(user.accountId);
  }

  @Get('configs/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findConfig(user.accountId, id);
  }

  @Put('configs')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async save(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveConfig(user.accountId, body);
  }

  @Delete('configs/:id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.deleteConfig(user.accountId, id);
  }
}
