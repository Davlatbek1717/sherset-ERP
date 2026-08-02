import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { DispatcherGuard } from './dispatcher.guard.js';
import { DriverCashService } from './driver-cash.service.js';

/**
 * Haydovchi naqd topshirig'i (HR TZ §7.2).
 *
 * ROL AJRATILGAN:
 *  - SELF (haydovchi, `user.sub`): faqat O'ZI olgan naqdni e'lon qiladi va
 *    o'z ro'yxatini ko'radi. Boshqa haydovchi nomidan yoza olmaydi —
 *    `driverId` tanadan EMAS, token'dan olinadi.
 *  - DISPECHER/KASSIR (`DispatcherGuard`): qabul qiladi, bekor qiladi,
 *    hammaning ro'yxatini va «kimda qancha turibdi» yig'masini ko'radi.
 */
@Controller('driver-cash')
@UseGuards(JwtAuthGuard)
export class DriverCashController {
  constructor(@Inject(DriverCashService) private readonly cash: DriverCashService) {}

  // ── SELF ──
  @Post('collect')
  async collect(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.cash.collect(user.accountId, user.sub, body);
  }

  @Get('mine')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.cash.listMine(user.accountId, user.sub);
  }

  // ── DISPECHER / KASSIR ──
  @Get('outstanding')
  @UseGuards(DispatcherGuard)
  async outstanding(@CurrentUser() user: AuthenticatedUser) {
    return this.cash.outstanding(user.accountId);
  }

  @Get()
  @UseGuards(DispatcherGuard)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.cash.list(user.accountId, query);
  }

  /** Pulni sanab qabul qilish → ПКО yaratiladi va post qilinadi. */
  @Post(':id/hand-over')
  @UseGuards(DispatcherGuard)
  async handOver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cash.handOver(user.accountId, user.sub, id, body);
  }

  @Post(':id/cancel')
  @UseGuards(DispatcherGuard)
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cash.cancel(user.accountId, id);
  }
}
