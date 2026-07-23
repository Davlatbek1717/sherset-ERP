import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { SubmitLoginCodeSchema } from './hr-telegram-account.schema.js';
import { HrTelegramLoginService } from './hr-telegram-login.service.js';

@Controller('hr/telegram-accounts')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrTelegramLoginController {
  constructor(@Inject(HrTelegramLoginService) private readonly svc: HrTelegramLoginService) {}

  /** Step 1: server contacts Telegram, OTP arrives in admin's Telegram app. */
  @Post(':id/login/start')
  @RequireHrPermission('settings', 'full')
  async start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.start(user.accountId, id);
  }

  /** Step 2: submit OTP (+ optional 2FA password if a previous call signaled awaitingPassword). */
  @Post('login/code')
  @RequireHrPermission('settings', 'full')
  async submitCode(@CurrentUser() _user: AuthenticatedUser, @Body() body: unknown) {
    const input = SubmitLoginCodeSchema.parse(body);
    return this.svc.submitCode(input);
  }

  /** «Kod kelmadi» — kodni qayta yuborish (Telegram keyingi kanal, odatда SMS). */
  @Post('login/resend')
  @RequireHrPermission('settings', 'full')
  async resend(@Body() body: unknown) {
    const { loginSessionId } = SubmitLoginCodeSchema.partial().parse(body) as {
      loginSessionId?: string;
    };
    if (!loginSessionId) {
      return { ok: false, codeSent: false };
    }
    return this.svc.resend(loginSessionId);
  }

  /** Admin cancels (e.g. closed modal). Disconnects the underlying client. */
  @Post('login/cancel')
  @RequireHrPermission('settings', 'full')
  async cancel(@Body() body: unknown) {
    const { loginSessionId } = SubmitLoginCodeSchema.partial().parse(body) as {
      loginSessionId?: string;
    };
    if (!loginSessionId) {
      return { ok: true };
    }
    return this.svc.cancel(loginSessionId);
  }
}
