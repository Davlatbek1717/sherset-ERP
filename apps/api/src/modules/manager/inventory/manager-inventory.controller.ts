import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { PriceChangeQuerySchema, StockSignalQuerySchema } from './manager-inventory.schema.js';
import { ManagerInventoryService } from './manager-inventory.service.js';

/**
 * Menejer — zaxira signallari va narx nazorati (4M.8) HTTP sirti.
 *
 * Ikkala endpoint ham **faqat o'qiydi**: hech qanday hujjat yaratmaydi,
 * hech qanday amalni bloklamaydi. «Narx o'zgarishi nazorati» degan nom
 * taqiqni emas, **keyingi ko'rib chiqishni** anglatadi (4-bo'lim TZ §5.1).
 *
 * Ruxsat: `product:view`. Yangi ruxsat birligi ATAYLAB kiritilmadi — ekran
 * tovar tan narxi va narxlarini ko'rsatadi, ya'ni aynan shu ma'lumot
 * darajasi. Yangi `PermissionEntity` seed matritsasini ham talab qilardi
 * (permissions.types.ts izohiga qarang), bu esa MK11 qamrovidan tashqarida.
 */
@Controller('manager/inventory')
@UseGuards(JwtAuthGuard)
export class ManagerInventoryController {
  constructor(@Inject(ManagerInventoryService) private readonly service: ManagerInventoryService) {}

  /** Uch xil zaxira signali — o'lchov PUL, dona emas. */
  @Get('stock-signals')
  @RequirePermission({ entity: 'product', action: 'view' })
  async stockSignals(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.stockSignals(user.accountId, StockSignalQuerySchema.parse(query ?? {}));
  }

  /** Narx o'zgarishi tarixi + chegaradan oshganlar (navbat nomzodlari). */
  @Get('price-changes')
  @RequirePermission({ entity: 'product', action: 'view' })
  async priceChanges(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.priceChanges(user.accountId, PriceChangeQuerySchema.parse(query ?? {}));
  }
}
