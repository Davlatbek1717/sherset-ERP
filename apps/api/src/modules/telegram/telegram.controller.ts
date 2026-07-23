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
import { TelegramService } from './telegram.service.js';

@Controller('telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(@Inject(TelegramService) private readonly svc: TelegramService) {}

  // --- config ----------------------------------------------------------

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

  @Post('config/webhook')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async setWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { url?: string; secret?: string },
  ) {
    if (!body.url) throw new Error('url majburiy');
    return this.svc.setWebhook(user.accountId, body.url, body.secret);
  }

  @Delete('config/webhook')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async deleteWebhook(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.deleteWebhook(user.accountId);
  }

  // --- outbound -------------------------------------------------------

  @Post('send')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async send(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.send(user.accountId, body);
  }

  @Get('outbox')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async outbox(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listOutbox(user.accountId, query);
  }

  @Post('outbox/:id/retry')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async retryOutbox(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.retryOutbox(user.accountId, id);
  }

  // Inbound webhook lives on TelegramWebhookController (no JWT) —
  // Telegram doesn't carry our auth token.
}
