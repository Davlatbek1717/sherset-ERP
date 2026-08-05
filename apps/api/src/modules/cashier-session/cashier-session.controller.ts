import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CashierSessionService } from './cashier-session.service.js';

@Controller('cashier-sessions')
@UseGuards(JwtAuthGuard)
export class CashierSessionController {
  constructor(@Inject(CashierSessionService) private readonly sessions: CashierSessionService) {}

  @Get()
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.sessions.list(user.accountId, query);
  }

  /**
   * Returns the currently open session for the authenticated cashier, or null.
   * Must be declared BEFORE :id to avoid route conflict.
   */
  @Get('current')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async current(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.findCurrentForCashier(user.accountId, user.sub);
  }

  @Get(':id')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.findById(user.accountId, id);
  }

  @Post('open')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async open(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.sessions.open(user.accountId, user.sub, body);
  }

  @Post(':id/close')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.close(user.accountId, user.sub, id, body);
  }

  /** Внесение наличных in the drawer during an open shift. */
  @Post(':id/drawer-in')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async drawerIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.drawerCashIn(user.accountId, user.sub, id, body);
  }

  /** Изъятие наличных from the drawer during an open shift. */
  @Post(':id/drawer-out')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async drawerOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.drawerCashOut(user.accountId, user.sub, id, body);
  }

  /**
   * Xarajat (RKO) yoki inkassatsiya — kassa TZ §8.2 / §8.3.
   *
   * Tasdiq talab qilinmaydi (Q10): kassir erkin yozadi, muvozanat —
   * §9 audit jurnali. Shu sababli ruxsat `drawer-out` bilan bir xil.
   */
  @Post(':id/cash-out')
  @RequirePermission({ entity: 'cashiersession', action: 'create' })
  async cashOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sessions.posCashOut(user.accountId, user.sub, id, body);
  }

  /** Smenadagi pul chiqishi — turlar va moddalar kesimida (Z-hisobot §8.5). */
  @Get(':id/cash-out-summary')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async cashOutSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.cashOutSummary(user.accountId, id);
  }

  /** Posted drawer Внесение/Изъятие for a shift. */
  @Get(':id/drawer')
  @RequirePermission({ entity: 'cashiersession', action: 'view' })
  async drawerOps(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sessions.listDrawerOps(user.accountId, id);
  }
}
