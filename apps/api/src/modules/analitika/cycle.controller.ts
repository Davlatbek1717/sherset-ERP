import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CycleService } from './cycle.service.js';

@Controller('analitika/cycle')
@UseGuards(JwtAuthGuard)
export class CycleController {
  constructor(@Inject(CycleService) private readonly svc: CycleService) {}

  @Get('today')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async today(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? Math.min(500, Math.max(1, Number(limit))) : 200;
    const safeLimit = Number.isFinite(parsed) ? parsed : 200;
    return this.svc.getTodaySchedule(user.accountId, { limit: safeLimit });
  }
}
