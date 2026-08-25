import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';

/**
 * Bo'lak reyestri sirti — K-reja K1.
 *
 * Hozircha BITTA yo'l bor va u FAQAT O'QIYDI: sverka hisoboti. Bo'lak
 * kiritish/tuzatish/yorliq bosish — K2, kesim oqimi — K4.
 *
 * Ruxsat `report.view`: bu hisobot va u mavjud hisobotlar bilan bir sirtda
 * turadi (`/reports` sahifasidan ochiladi). YANGI permission-entity ATAYLAB
 * qo'shilmadi — yangi entity `topup-role-permissions.ts` ni majburiy deploy
 * qadamiga aylantirardi (G2/G3 dagi `retailcontrol`/`returnacceptance` naqshi),
 * K1 esa jonli holatga imkon qadar kam tegishi kerak. K2 boshqaruv ekrani
 * yozadigan/o'chiradigan bo'lgani uchun O'Z entity'sini oladi (`piecetracking`).
 */
@Controller('stock-pieces')
@UseGuards(JwtAuthGuard)
export class StockPieceController {
  constructor(
    @Inject(StockPieceReconcileService) private readonly recon: StockPieceReconcileService,
  ) {}

  @Get('reconciliation')
  @RequirePermission({ entity: 'report', action: 'view' })
  async reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.recon.reconcile(user.accountId, query);
  }
}
