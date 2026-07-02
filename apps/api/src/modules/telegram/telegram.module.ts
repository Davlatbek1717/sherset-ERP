import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TelegramWebhookController } from './telegram-webhook.controller.js';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TelegramController, TelegramWebhookController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
