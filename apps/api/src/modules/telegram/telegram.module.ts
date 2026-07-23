import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HrTelegramAccountModule } from '../hr/hr-telegram-account/hr-telegram-account.module.js';
import { HrTelegramClientModule } from '../hr/hr-telegram-bridge/hr-telegram-client.module.js';
import { TelegramLookupService } from './telegram-lookup.service.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';

@Module({
  // AttachmentModule — mijoz yuborgan CHEK RASMINI saqlash uchun (Telegram
  // file_id muddatli, nusxa o'zimizda turishi shart).
  // HrTelegramClientModule + HrTelegramAccountModule — kontragent Telegram
  // profilini AVTOMATIK topish (TelegramLookupService, MTProto getEntity).
  imports: [AuthModule, AttachmentModule, HrTelegramClientModule, HrTelegramAccountModule],
  controllers: [TelegramController, TelegramWebhookController],
  providers: [TelegramService, TelegramLookupService],
  exports: [TelegramService],
})
export class TelegramModule {}
