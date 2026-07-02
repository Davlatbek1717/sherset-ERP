import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { SkladKeeperService } from './sklad-keeper.service.js';

/**
 * SkladKeeper (Sherset custom) — sklad(zone)→omborchi assignment, configured in
 * Settings. Guarded by auth + tenant scoping (no fine-grained permission entity
 * yet — mirrors RestockTaskController).
 */
@Controller('sklad-keepers')
@UseGuards(JwtAuthGuard)
export class SkladKeeperController {
  constructor(@Inject(SkladKeeperService) private readonly svc: SkladKeeperService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  /** Upsert one sklad→keeper mapping (employeeId null clears it). */
  @Put()
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upsert(user.accountId, body);
  }

  @Delete(':skladNo')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('skladNo') skladNo: string) {
    return this.svc.remove(user.accountId, Number(skladNo));
  }
}
