import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service.js';

/**
 * Public Telegram webhook receiver. No JWT — Telegram doesn't carry
 * our auth, it pushes raw POSTs to whatever URL the operator
 * configured via setWebhook. Tenant routing is via the URL path
 * `/telegram-webhook/<accountId>`.
 *
 * Faza 21 (`INT-01`/`AUTH-01`): JWT o'rnini `X-Telegram-Bot-Api-Secret-Token`
 * egallaydi — u `TelegramConfig.webhookSecret` bilan constant-time
 * solishtiriladi (`assertWebhookSecret`, fail-closed). Bungacha sarlavha
 * O'QILARDI-yu tekshirilmasdi ⇒ accountId'ni bilgan har kim supply-approval
 * callback'ini («qabulni tasdiqlash») soxtalashtira olardi.
 */
@Controller('telegram-webhook')
export class TelegramWebhookController {
  constructor(@Inject(TelegramService) private readonly svc: TelegramService) {}

  @Post(':accountId')
  async webhook(
    @Param('accountId') accountId: string,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
    @Body() update: unknown,
  ) {
    await this.svc.assertWebhookSecret(accountId, secretHeader);
    return this.svc.handleInbound(accountId, update);
  }
}
