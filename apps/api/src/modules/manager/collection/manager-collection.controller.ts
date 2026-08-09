import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import type { ActorRole } from '../../debt/debt.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { DebtCollectionService } from './debt-collection.service.js';
import { CollectionQuerySchema, CollectionRemindSchema } from './manager-collection.schema.js';

/**
 * MK16 — «Qarz undirish ish ro'yxati» HTTP sirti (4M TZ §8.1/2).
 *
 * ⚠️ **BLOKLAMAYDI.** Ro'yxat hech qanday sotuvni yoki qarz berishni
 * to'xtatmaydi — u menejerga «bugun kimni undirish kerak» deb ko'rsatadi.
 *
 * Ruxsat: `debt:view` (ro'yxat) va `debt:update` (eslatma yuborish). Yangi
 * `PermissionEntity` ATAYLAB kiritilmadi — ekran aynan qarz daftari
 * ma'lumotini ko'rsatadi va aynan mavjud qarz-eslatmasini yuboradi, ya'ni
 * `debt` matritsasidagi huquq darajasi to'g'ri keladi (MK11/MK18 dagi bir xil
 * qaror). Yangi entity seed matritsasini ham talab qilardi.
 */
@Controller('manager/collection')
@UseGuards(JwtAuthGuard)
export class ManagerCollectionController {
  constructor(
    @Inject(DebtCollectionService) private readonly service: DebtCollectionService,
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
  ) {}

  /** Undirish ish ro'yxati — determinist tartibda, valyutalar qo'shilmasdan. */
  @Get()
  @RequirePermission({ entity: 'debt', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.service.list(user.accountId, CollectionQuerySchema.parse(query ?? {}));
  }

  /**
   * Tanlanganlarga eslatma (SMS/Telegram). Mavjud jo'natgichga delegatsiya;
   * bugun eslatma ketgan qarz qayta yuborilmaydi (idempotent) va jurnal FAQAT
   * haqiqatan ketganiga yoziladi.
   */
  @Post('remind')
  @RequirePermission({ entity: 'debt', action: 'update' })
  async remind(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const role = await this.actorRole(user.sub);
    return this.service.remind(
      user.accountId,
      user.sub,
      role,
      CollectionRemindSchema.parse(body ?? {}),
    );
  }

  /**
   * Jurnal yozuvidagi rol (§3.4 — yozuvda rol ko'rinadi). `DebtController`
   * dagi bir xil chiqarish: ikkala to'lov huquqi ham bo'lsa — rahbar/admin.
   */
  private async actorRole(userId: string): Promise<ActorRole> {
    const [cash, card] = await Promise.all([
      this.permissions.resolveScope(userId, 'debtpayment', 'create'),
      this.permissions.resolveScope(userId, 'debtcardpayment', 'create'),
    ]);
    const isCashier = cash !== 'NO';
    const isOperator = card !== 'NO';
    if (isCashier && isOperator) return 'admin';
    if (isCashier) return 'cashier';
    if (isOperator) return 'operator';
    return 'admin';
  }
}
