import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { TelegramBroadcastService } from './telegram-broadcast.service.js';

/**
 * Telegram video-tarqatma — FAZA 1a (test-yuborish).
 * Sozlamalar-ruxsati talab qilinadi (admin oqimi). Barchaga-yuborish keyingi
 * fazada qo'shiladi (job/worker/throttle).
 */
@Controller('telegram-broadcast')
@UseGuards(JwtAuthGuard)
export class TelegramBroadcastController {
  constructor(@Inject(TelegramBroadcastService) private readonly svc: TelegramBroadcastService) {}

  /** Videoni bitta raqamga (preview) yuboradi — barchaga EMAS. */
  @Post('test')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async test(@CurrentUser() user: AuthenticatedUser, @Body() body: { phone?: string }) {
    if (!body?.phone) throw new Error('phone majburiy');
    return this.svc.sendTest(user.accountId, body.phone);
  }
}
