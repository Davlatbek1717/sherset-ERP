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
import { StockPieceAvailabilityService } from './stock-piece-availability.service.js';
import { StockPieceDecisionService } from './stock-piece-decision.service.js';
import { StockPieceReconcileService } from './stock-piece-reconcile.service.js';
import { StockPieceRegistryService } from './stock-piece-registry.service.js';

/**
 * Bo'lak reyestri sirti — K-reja K1 (sverka) + K2 (boshqaruv) + K3 (kassir
 * ko'rinishi) + K6 (bayroq siyosati: «hal qilinmagan» ro'yxati va qaror muhri).
 *
 * Ruxsat ikki xil ATAYLAB:
 *
 *  - **Sverka hisoboti — `report.view`** (K1). U mavjud hisobotlar bilan bir
 *    sirtda turadi (`/reports`) va faqat O'QIYDI.
 *  - **Kassir ko'rinishi — `product.view`** (K3, `availability`). U tovar
 *    kartochkasining KO'RINISHI (bo'lak tarkibi), reyestr boshqaruvi EMAS —
 *    shuning uchun kassirning mavjud ruxsati yetadi va yangi entity kerak
 *    bo'lmadi. Kiosk tomonida marshrut `KIOSK_ALLOWED` da AYNAN shu yo'l
 *    bilan ochilgan (ikki qulf birga — `kiosk-policy.ts` naqshi).
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
    @Inject(StockPieceAvailabilityService)
    private readonly availabilityService: StockPieceAvailabilityService,
    @Inject(StockPieceDecisionService) private readonly decisions: StockPieceDecisionService,
  ) {}

  @Get('reconciliation')
  @RequirePermission({ entity: 'report', action: 'view' })
  async reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.recon.reconcile(user.accountId, query);
  }

  /**
   * K3 — kassir/tovar kartochkasi uchun bo'lak TARKIBI (faqat o'qish):
   * `3 × 250 · 200 · 150 · 70 · 50`, «eng uzun uzluksiz» va so'ralgan miqdor
   * uchun taklif. Bayrog'i o'chiq tovarda bo'sh javob qaytadi.
   */
  @Get('availability')
  @RequirePermission({ entity: 'product', action: 'view' })
  async availability(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.availabilityService.availability(user.accountId, query);
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

  /**
   * K6/3 — «Hal qilinmagan» ro'yxati: birligi «m» (yoki reyestrda bo'lagi
   * bor), lekin bayroq bo'yicha QAROR QILINMAGAN tovarlar. FAQAT O'QIYDI.
   */
  @Get('pending-decisions')
  @RequirePermission({ entity: 'piecetracking', action: 'view' })
  async pendingDecisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.decisions.pending(user.accountId, query);
  }

  /**
   * «Bo'lak hisobi yuritilsin» bayrog'i (K-Q9).
   *
   * K6 dan boshlab bu yo'l QARORNI ham muhrlaydi (kim va qachon) — «ha» ham,
   * «yo'q» ham tovarni «Hal qilinmagan» ro'yxatidan CHIQARADI.
   */
  @Post('flag')
  @RequirePermission({ entity: 'piecetracking', action: 'update' })
  async setFlag(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.registry.setFlag(user.accountId, body, user.sub);
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
