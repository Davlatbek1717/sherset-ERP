import { Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
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

  /** Start a background sync (no-op if one is already running). */
  @Post('run')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.run(user.accountId);
  }

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.status(user.accountId);
  }
}
