import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PickListSyncService } from './pick-list-sync.service.js';
import { PickListService } from './pick-list.service.js';

/**
 * «Yig'ish ro'yxatlari» — omborchi ekrani.
 *
 * Ikki manba: MoySklad'dan sync qilingan «Заказ покупателя»/«Возврат»
 * (asosiy — egasi 2026-08-05 da shuni so'radi) va ilovaning o'z
 * «Счёт покупателю» hujjatlari (3404 ta mavjud, yo'qolmasligi kerak).
 * Manba `?source=moysklad|own` bilan tanlanadi; berilmasa sync ma'lumoti
 * bo'lsa MoySklad, aks holda o'z hujjatlari.
 */
@Controller('pick-lists')
@UseGuards(JwtAuthGuard)
export class PickListController {
  constructor(
    @Inject(PickListService) private readonly svc: PickListService,
    @Inject(PickListSyncService) private readonly sync: PickListSyncService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listPick(user.accountId, query);
  }

  /** Manual pull (cron ham har 30s da qiladi). `:id` dan OLDIN e'lon qilinadi. */
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

  /**
   * Bitta buyurtma + yacheykalar.
   *
   * `source=own` bo'lsa o'z hisob-fakturasi o'qiladi. Aks holda MoySklad
   * buyurtmasi — u yerda yacheyka kod/shtrix-kod bo'yicha yechiladi va
   * `coverage` (nechta pozitsiyaning javoni ma'lum) ham qaytadi.
   */
  @Get(':id')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('source') source?: string,
  ) {
    return source === 'own'
      ? this.svc.findById(user.accountId, id)
      : this.svc.findMoyskladById(user.accountId, id);
  }

  /**
   * Yig'ish holati: `new` → `picking` → `picked` (orqaga ham mumkin).
   *
   * `:id/printed` dan alohida: chop etish «berildi» degani emas — chek
   * chiqarilib, keyin buyurtma bekor qilinishi mumkin.
   */
  @Post(':id/pick-state')
  async setPickState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.setPickState(user.accountId, user.sub, id, body);
  }

  @Post(':id/printed')
  async markPrinted(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('source') source?: string,
  ) {
    return source === 'own'
      ? this.svc.markPrinted(user.accountId, id)
      : this.svc.markMoyskladPrinted(user.accountId, id);
  }
}
