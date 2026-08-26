import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { RestockTaskService } from './restock-task.service.js';

/**
 * RestockTask (Sherset custom) — return-to-warehouse restock tasks.
 *
 * Faza Q10 (AUTH-07): vazifa OCHISH `salesreturn.update` bilan yopildi —
 * manba hujjat aynan vozvrat, ya'ni vozvrat bilan ishlay olmaydigan xodim
 * omborchiga vazifa ham yubora olmasligi kerak (bu yo'l omborchiga bildirishnoma
 * yuboradi). Qatorlarni TASDIQLASH ataylab ochiq qoldi (Q10 DEFER) — omborchi
 * ekranining yagona sirti, mos entity-slug yo'q; sabab klass-qulf allowlist'ida.
 * Har metod `user.accountId` bilan tenant-scope qilinadi.
 */
@Controller('restock-tasks')
@UseGuards(JwtAuthGuard)
export class RestockTaskController {
  constructor(@Inject(RestockTaskService) private readonly svc: RestockTaskService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, user.sub, query);
  }

  @Get(':id')
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  /** «Omborchiga yubordim» — create a restock task from a SalesReturn. */
  @Post('from-sales-return')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
  async createFromSalesReturn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.createFromSalesReturn(user.accountId, user.sub, body);
  }

  /**
   * Read-only per-sklad picking SHEETS for the print view («Yig'ish varaqalari»).
   * source = 'customerorder' | 'retailsale'. Creates NO tasks, sends NO
   * notifications — pure print computation grouped by sklad.
   */
  @Get('picking-sheets/:source/:id')
  async getPickingSheets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('source') source: string,
    @Param('id') id: string,
  ) {
    return this.svc.getPickingSheets(user.accountId, source, id);
  }

  /** Manual per-line placement confirm. */
  @Post(':id/lines/:lineId/confirm')
  async confirmLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    return this.svc.confirmLine(user.accountId, user.sub, id, lineId, body);
  }

  /** Confirm by scanning the senik QR (matches the first unconfirmed line). */
  @Post(':id/confirm-scan')
  async confirmScan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.confirmScan(user.accountId, user.sub, id, body);
  }

  /**
   * G6 — «javonda shuncha topolmadim» (yetishmovchilik belgisi).
   *
   * Ruxsat qatorlarni TASDIQLASH bilan bir xil, ya'ni ATAYLAB ochiq (Q10
   * DEFER, yuqoridagi sinf izohi): bu ham omborchi ekranining o'z sirti va
   * u chek tarkibini O'ZGARTIRMAYDI — faqat XABAR beradi. Chekni kamaytirish
   * kontrol huquqi (`retailcontrol.update`, G2).
   */
  @Post(':id/lines/:lineId/shortage')
  async setShortage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    return this.svc.setShortage(user.accountId, user.sub, id, lineId, body);
  }

  /**
   * K4 — BO'LINADIGAN TOVAR KESIMI (kabel/sim/shlang).
   *
   * Ruxsat qatorni TASDIQLASH bilan BIR XIL, ya'ni ataylab ochiq (yuqoridagi
   * sinf izohi, Q10 DEFER): kesim omborchi ekranining o'z sirti va u
   * QOLDIQQA TEGMAYDI — `Stock`/`StockByCell` ga bir qator ham yozilmaydi
   * (K-reja 2-bo'lim: kesim STOK-NEYTRAL). O'zgaradigan yagona narsa —
   * `stock_pieces` reyestri: «250» o'rniga «180 + 70» bo'ladi.
   *
   * Reyestrni ERKIN tahrirlash (qo'shish, uzunlikni tuzatish, «tugadi»,
   * bayroq) esa `piecetracking` ruxsatida QOLADI (K2, katta omborchi) —
   * bu yerdan faqat O'Z topshirig'idagi qatorni kesish mumkin.
   */
  @Post(':id/lines/:lineId/cut')
  async cutPiece(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: unknown,
  ) {
    return this.svc.cutPiece(user.accountId, user.sub, id, lineId, body);
  }
}
