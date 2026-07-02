import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';

/**
 * Public Telegram webhook receiver. No JWT — Telegram doesn't carry
 * our auth, it pushes raw POSTs to whatever URL the operator
 * configured via setWebhook. Tenant routing is via the URL path
 * `/telegram-webhook/<accountId>`.
 *
 * V2: validate the X-Telegram-Bot-Api-Secret-Token header against the
 * stored TelegramConfig.webhookSecret.
 */
@Controller('telegram-webhook')
export class TelegramWebhookController {
  constructor(@Inject(TelegramService) private readonly svc: TelegramService) {}

  @Post(':accountId')
  async webhook(
    @Param('accountId') accountId: string,
    @Headers('x-telegram-bot-api-secret-token') _secretHeader: string | undefined,
    @Body() update: unknown,
  ) {
    return this.svc.handleInbound(accountId, update);
  }
}
