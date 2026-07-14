import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';

@Module({
  // AttachmentModule — mijoz yuborgan CHEK RASMINI saqlash uchun (Telegram
  // file_id muddatli, nusxa o'zimizda turishi shart).
  imports: [AuthModule, AttachmentModule],
  controllers: [TelegramController, TelegramWebhookController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
