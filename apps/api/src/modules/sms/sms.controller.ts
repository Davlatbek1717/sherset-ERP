import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SmsService } from './sms.service.js';

@Controller('sms')
@UseGuards(JwtAuthGuard)
export class SmsController {
  constructor(@Inject(SmsService) private readonly svc: SmsService) {}

  @Get('config')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getConfig(user.accountId);
  }

  @Put('config')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveConfig(user.accountId, body);
  }

  @Delete('config')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.deleteConfig(user.accountId);
  }

  @Post('config/test')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async testConnection(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.testConnection(user.accountId);
  }

  @Post('send')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.send(user.accountId, user.sub, body);
  }

  @Get('contacts')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async getContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getRawContacts(user.accountId);
  }

  @Put('contacts')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveContacts(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveContacts(user.accountId, body);
  }

  @Get('logs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async logs(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listLogs(user.accountId, query);
  }

  @Post('logs/:id/retry')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async retryLog(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.retryLog(user.accountId, id);
  }
}
