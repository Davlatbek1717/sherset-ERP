import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HrTelegramBridgeModule } from '../hr/hr-telegram-bridge/hr-telegram-bridge.module.js';
import { TelegramBroadcastController } from './telegram-broadcast.controller.js';
import { TelegramBroadcastService } from './telegram-broadcast.service.js';

/**
 * Telegram video-tarqatma moduli (2026-07-20).
 * - AuthModule — JwtAuthGuard (controller himoyasi).
 * - HrTelegramBridgeModule — MTPROTO_ADAPTER'ni beradi (video yuklash/yuborish
 *   userbot orqali; u yerdan re-export qilingan).
 */
@Module({
  imports: [AuthModule, HrTelegramBridgeModule],
  controllers: [TelegramBroadcastController],
  providers: [TelegramBroadcastService],
})
export class TelegramBroadcastModule {}
