import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { TelegramBroadcastService } from './telegram-broadcast.service.js';

/**
 * Telegram video-tarqatma. `test` — bitta raqamga preview. `start` — barcha
 * telefonli mijozlarga OMMAVIY yuborish (limit bilan, kichik guruhdan boshlash
 * mumkin). Sozlamalar-ruxsati talab qilinadi (admin oqimi).
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

  /**
   * OMMAVIY yuborishni boshlaydi/davom ettiradi — shu run'да ko'pi bilan
   * `limit` ta real yuborish, keyin to'xtaydi. Fon'да ishlaydi (`status` bilan
   * kuzat). Kichik guruh: avval {limit:15} → tekshir → {limit:2000} (qolgani).
   */
  @Post('start')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { limit?: number; force?: boolean },
  ) {
    const limit = Math.max(1, Math.min(5000, Number(body?.limit) || 15));
    return this.svc.startRun(user.accountId, limit, body?.force === true);
  }

  /** Jonli progress: total/sent/failed/skipped/status. */
  @Get('status')
  @RequirePermission({ entity: 'settings', action: 'view' })
  status() {
    return this.svc.getStatus();
  }

  /** Ishlayotgan tarqatmani to'xtatadi (keyin davom etsa bo'ladi). */
  @Post('stop')
  @RequirePermission({ entity: 'settings', action: 'create' })
  stop() {
    return this.svc.stop();
  }
}
