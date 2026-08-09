import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { MoneyMapService } from './money-map.service.js';

/**
 * MK15 — «Korxona puli qayerda» HTTP sirti (4M TZ §8.1/1).
 *
 * So'rov parametri ATAYLAB yo'q: panel «hozir qayerda qancha pul turibdi»
 * degan bitta savolga javob beradi. Davr/filtr qo'shish uni hisobotga
 * aylantirardi — bunda esa hisobot bo'limi allaqachon bor va bu ekran aynan
 * o'sha hisobotlardan o'qiydi.
 *
 * Ruxsat: `report:view`. Yangi `PermissionEntity` kiritilmadi (MK16 dagi bir
 * xil qaror) — ekran mavjud hisobot ma'lumotini ko'rsatadi, ya'ni hisobot
 * ko'rish huquqi to'g'ri daraja; yangi entity seed matritsasini ham talab
 * qilardi.
 */
@Controller('manager/money-map')
@UseGuards(JwtAuthGuard)
export class MoneyMapController {
  constructor(@Inject(MoneyMapService) private readonly service: MoneyMapService) {}

  /** Oltita blok + yakun. O'lchanmagan blok `amountMinor: null` bilan qaytadi. */
  @Get()
  @RequirePermission({ entity: 'report', action: 'view' })
  async snapshot(@CurrentUser() user: AuthenticatedUser) {
    return this.service.snapshot(user.accountId);
  }
}
