import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PickListSyncService } from './pick-list-sync.service.js';
import { PickListService } from './pick-list.service.js';

/** «Yig'ish ro'yxatlari» — pick lists mirrored from the real MoySklad. */
@Controller('pick-lists')
@UseGuards(JwtAuthGuard)
export class PickListController {
  constructor(
    @Inject(PickListService) private readonly svc: PickListService,
    @Inject(PickListSyncService) private readonly sync: PickListSyncService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /** Manual pull (the cron does this every 30s anyway). Declared before :id. */
  @Post('sync')
  async syncNow() {
    return this.sync.runOnce();
  }

  /** Home cells for OUR products (comma-separated ids) — used by the
   *  «Печать → Лист сборки» action on document forms. Declared before :id. */
  @Get('cells-by-products')
  async cellsByProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('productIds') productIds: unknown,
  ) {
    return this.svc.cellsByProductIds(user.accountId, productIds);
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post(':id/printed')
  async markPrinted(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.markPrinted(user.accountId, id);
  }
}
