import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { TsdService } from './tsd.service.js';

/**
 * TSD (omborchi qo'l terminali) sirti — G-reja G5.
 *
 * Hozircha bitta yo'l: NARXSIZ skan-qidiruv. Ish ekranlari (yig'ish,
 * joylashtirish, sanash) mavjud endpointlar ustida quriladi — G6.
 *
 * Ruxsat `product.view`: terminal tovar ma'lumotini o'qiydi. Ikkinchi qatlam —
 * `tsd-policy.ts` allowlist'i (marshrut TSD sessiyasiga ochiq). Brauzerdan ham
 * chaqirsa bo'ladi va bu zararsiz: javob narxsiz.
 */
@Controller('tsd')
@UseGuards(JwtAuthGuard)
export class TsdController {
  constructor(@Inject(TsdService) private readonly svc: TsdService) {}

  @Get('scan')
  @RequirePermission({ entity: 'product', action: 'view' })
  async scan(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.scan(user.accountId, query);
  }
}
