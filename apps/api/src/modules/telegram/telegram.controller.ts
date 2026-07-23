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

  // --- Telegram Business (owner-account) chats -------------------------

  @Get('business-status')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async businessStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.businessStatus(user.accountId);
  }

  @Get('chats')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async chats(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listChats(user.accountId, query);
  }

  @Get('chats/:id/messages')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async chatMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.listChatMessages(user.accountId, id, query);
  }

  @Put('chats/:id/bind')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async bindChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { counterpartyId?: string | null },
  ) {
    return this.svc.bindChat(user.accountId, id, body?.counterpartyId ?? null);
  }

  @Post('chats/:id/send')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async sendChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.sendBusinessMessage(user.accountId, id, body);
  }

  // --- Umumiy chat (buyurtma/kontragent kartochkasi paneli, 2026-07-17) ----
  // Kontragent-ruxsati bilan (sotuvchida HR-ruxsat bo'lmaydi). Yuborish MTProto
  // userbot (shaxsiy raqam) orqali; o'qish MTProto ∪ Business birlashmasi.

  @Get('counterparty/:id/thread')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async counterpartyThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.counterpartyThread(user.accountId, id, query);
  }

  @Post('counterparty/:id/send')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async sendToCounterparty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { text?: unknown },
  ) {
    return this.svc.sendChatToCounterparty(user.accountId, id, body?.text);
  }

  /** Kontragentga tayyor SHABLON bilan Telegram xabar (2026-07-21). */
  @Post('counterparty/:id/send-template')
  @RequirePermission({ entity: 'counterparty', action: 'update' })
  async sendTemplateToCounterparty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { templateId?: unknown },
  ) {
    return this.svc.sendTemplateToCounterparty(user.accountId, id, body?.templateId);
  }

  /** Kontragent Telegram profilini avtomatik topish (panel sarlavhasi). */
  @Get('counterparty/:id/telegram-profile')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async counterpartyTelegramProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.svc.counterpartyTelegramProfile(user.accountId, id);
  }

  /** Panel birinchi ochilganda to'liq tarix backfill'ini boshlaydi (2026-07-20). */
  @Post('counterparty/:id/sync')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async syncCounterparty(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.requestCounterpartySync(user.accountId, id);
  }

  // Inbound webhook lives on TelegramWebhookController (no JWT) —
  // Telegram doesn't carry our auth token.
}
