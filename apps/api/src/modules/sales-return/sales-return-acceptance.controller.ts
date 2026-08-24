import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SalesReturnAcceptanceService } from './sales-return-acceptance.service.js';

/**
 * G3 — vozvrat qabul oqimi (`/omborchi/vozvrat` ekrani).
 *
 * Marshrutlar ATAYLAB `sales-returns/acceptance/...` ostida: `SalesReturnController`
 * dagi `@Get(':id')` faqat BITTA segmentni ushlaydi, shuning uchun to'qnashuv yo'q
 * (G2 da `control-queue` ni `:id` dan oldin e'lon qilish kerak bo'lgan holatning
 * teskarisi — bu yerda segment soni farqli).
 *
 * Ruxsat — YANGI entity `returnacceptance` (`salesreturn` EMAS): qabul oqimi
 * hujjat yaratib o'tkazadi, ya'ni umumiy `salesreturn.create`+`approve` kerak
 * bo'lardi va bu katta omborchiga butun `/sales-returns` modulini (mass-edit,
 * delete, ixtiyoriy narx bilan hujjat) ochib yuborardi. G2 `retailcontrol`
 * naqshi: tor oqim — tor entity. Oddiy omborchi (`storekeeper`) ATAYLAB olmaydi.
 */
@Controller('sales-returns/acceptance')
@UseGuards(JwtAuthGuard)
export class SalesReturnAcceptanceController {
  constructor(
    @Inject(SalesReturnAcceptanceService) private readonly svc: SalesReturnAcceptanceService,
  ) {}

  /** Qabul mo'ljallari: omborlar, BRAK ombori, standart (kaskad boshi). */
  @Get('targets')
  @RequirePermission({ entity: 'returnacceptance', action: 'view' })
  targets(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listTargets(user.accountId);
  }

  /** Manba chek qidiruvi (raqam yoki mijoz nomi). */
  @Get('receipts')
  @RequirePermission({ entity: 'returnacceptance', action: 'view' })
  receipts(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listReceipts(user.accountId, query);
  }

  /** Chek + qaytarilishi mumkin bo'lgan qatorlar (cap hisoblangan). */
  @Get('source/:retailSaleId')
  @RequirePermission({ entity: 'returnacceptance', action: 'view' })
  source(@CurrentUser() user: AuthenticatedUser, @Param('retailSaleId') retailSaleId: string) {
    return this.svc.getSource(user.accountId, retailSaleId);
  }

  /** Qabul: ВП hujjat(lar)i yaratiladi/o'tkaziladi, javobda yorliq ma'lumoti. */
  @Post('from-retail-sale/:retailSaleId')
  @RequirePermission({ entity: 'returnacceptance', action: 'create' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('retailSaleId') retailSaleId: string,
    @Body() body: unknown,
  ) {
    return this.svc.accept(user.accountId, user.sub, retailSaleId, body);
  }
}
