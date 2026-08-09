import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { OnboardingService } from './onboarding.service.js';

/**
 * Faza Q10 TOPILMASI (Faza 23 toifalashini TUZATADI): onboarding progressi
 * xodimniki EMAS — `onboardingProgress.update({ where: { accountId } })`, ya'ni
 * AKKAUNT bo'yicha bitta qator. Faza 23 uni «o'z qadamlari» deb ataylab-ochiq
 * toifasiga qo'ygan edi; o'lchov (`onboarding.service.ts:61/72/89`) buni rad etadi.
 * Shuning uchun holatni BUZUVCHI uchtasi (`skip`/`restart`/`override` — butun
 * tenant sozlash sehrgarini nolga qaytaradi) `settings.update` bilan yopildi;
 * `complete-step` additiv bo'lgani uchun ochiq qoldi (sehrgar oqimi buzilmasin).
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly svc: OnboardingService) {}

  /** GET /onboarding/progress — auto-creates row on first hit. */
  @Get('progress')
  async progress(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getProgress(user.accountId, user.sub);
  }

  /** POST /onboarding/complete-step  body={step}. */
  @Post('complete-step')
  async completeStep(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.completeStep(user.accountId, user.sub, body);
  }

  /** POST /onboarding/skip — drop the wizard (account-wide). */
  @Post('skip')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async skip(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.skip(user.accountId, user.sub);
  }

  /** POST /onboarding/restart — re-walk from step 1. Admin convenience. */
  @Post('restart')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async restart(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.restart(user.accountId, user.sub);
  }

  /** POST /onboarding/override — manual override (admin). */
  @Post('override')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async override(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.overrideProgress(user.accountId, user.sub, body);
  }
}
