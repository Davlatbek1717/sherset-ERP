import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';
import { StockPieceRegistryService } from './stock-piece-registry.service.js';

/**
 * Bo'lak reyestri sirti — K-reja K1 (sverka) + K2 (boshqaruv).
 *
 * Ruxsat ikki xil ATAYLAB:
 *
 *  - **Sverka hisoboti — `report.view`** (K1). U mavjud hisobotlar bilan bir
 *    sirtda turadi (`/reports`) va faqat O'QIYDI.
 *  - **Reyestr boshqaruvi — `piecetracking`** (K2). Bu yo'llar YOZADI, ya'ni
 *    ombordagi jismoniy holatni ta'riflaydi ⇒ o'z entity'si bo'lishi shart
 *    (G2/G3 dagi `retailcontrol`/`returnacceptance` naqshi). K-Q9: huquq
 *    KATTA omborchida (+ egasi/menejer); oddiy omborchi bo'lak reyestrini
 *    o'zgartira olmaydi.
 *
 * Yo'l tartibi: `reconciliation`/`lookup`/`flag` — statik segmentlar, `:id` li
 * yo'llardan OLDIN turadi (Nest birinchi mos kelganini oladi).
 */
@Controller('stock-pieces')
@UseGuards(JwtAuthGuard)
export class StockPieceController {
  constructor(
    @Inject(StockPieceReconcileService) private readonly recon: StockPieceReconcileService,
    @Inject(StockPieceRegistryService) private readonly registry: StockPieceRegistryService,
  ) {}

  @Get('reconciliation')
  @RequirePermission({ entity: 'report', action: 'view' })
  async reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.recon.reconcile(user.accountId, query);
  }

  /** Yorliqni skanerlash — AYNAN bitta bo'lak (K-reja 7.3). */
  @Get('lookup')
  @RequirePermission({ entity: 'piecetracking', action: 'view' })
  async lookup(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.registry.lookup(user.accountId, query);
  }

  /** (Ombor × tovar) kesimidagi reyestr + sverka. */
  @Get()
  @RequirePermission({ entity: 'piecetracking', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.registry.list(user.accountId, query);
  }

  /** Bo'lak yoki butun rulon(lar) qo'shish. */
  @Post()
  @RequirePermission({ entity: 'piecetracking', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.registry.create(user.accountId, body);
  }

  /** «Bo'lak hisobi yuritilsin» bayrog'i (K-Q9; to'liq siyosat — K6). */
  @Post('flag')
  @RequirePermission({ entity: 'piecetracking', action: 'update' })
  async setFlag(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.registry.setFlag(user.accountId, body);
  }

  /** Uzunlikni tuzatish / boshqa yacheykaga ko'chirish. */
  @Patch(':id')
  @RequirePermission({ entity: 'piecetracking', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.registry.update(user.accountId, id, body);
  }

  /** «Tugadi» — bo'lak reyestrdan chiqadi (qoldiqqa TEGILMAYDI). */
  @Post(':id/close')
  @RequirePermission({ entity: 'piecetracking', action: 'update' })
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.registry.close(user.accountId, id);
  }
}
