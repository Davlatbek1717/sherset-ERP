import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { OnboardingService } from './onboarding.service.js';

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

  /** POST /onboarding/skip — drop the wizard. */
  @Post('skip')
  async skip(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.skip(user.accountId, user.sub);
  }

  /** POST /onboarding/restart — re-walk from step 1. Admin convenience. */
  @Post('restart')
  async restart(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.restart(user.accountId, user.sub);
  }

  /** POST /onboarding/override — manual override (admin). */
  @Post('override')
  async override(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.overrideProgress(user.accountId, user.sub, body);
  }
}
