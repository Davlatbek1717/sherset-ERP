import { Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MoyskladSyncService } from './moysklad-sync.service.js';

/**
 * MoySklad sync (Sherset custom) — start/inspect the one-way pull from the
 * live MoySklad account. Guarded by auth + tenant scoping (no fine-grained
 * permission entity yet — mirrors SkladKeeperController).
 */
@Controller('moysklad-sync')
@UseGuards(JwtAuthGuard)
export class MoyskladSyncController {
  constructor(@Inject(MoyskladSyncService) private readonly svc: MoyskladSyncService) {}

  /**
   * Start a background sync (no-op if one is already running).
   * `?mode=balances` = one-time counterparty balance migration import
   * (add `&dry=1` to preview sign totals without writing).
   */
  @Post('run')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Query('mode') mode?: string,
    @Query('dry') dry?: string,
  ) {
    return this.svc.run(user.accountId, {
      mode: mode === 'balances' ? 'balances' : 'full',
      dryRun: dry === '1' || dry === 'true',
    });
  }

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.status(user.accountId);
  }
}
