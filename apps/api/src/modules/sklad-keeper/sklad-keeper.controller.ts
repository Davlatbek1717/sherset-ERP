import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SkladKeeperService } from './sklad-keeper.service.js';

/**
 * SkladKeeper (Sherset custom) — sklad(zone)→omborchi assignment, configured in
 * Settings (`/settings/sklad-keepers`).
 *
 * Faza Q10 (AUTH-07): mutatsiyalar `settings` entity'si bilan yopildi — ilgari
 * `JwtAuthGuard` yolg'iz turardi, ya'ni HAR xodim kompaniya bo'yicha omborchi
 * biriktirmasini va chek printerini almashtira olardi. GET ATAYLAB ochiq:
 * omborchi ekrani (`/omborchi`) o'z zonasini shundan aniqlaydi.
 */
@Controller('sklad-keepers')
@UseGuards(JwtAuthGuard)
export class SkladKeeperController {
  constructor(@Inject(SkladKeeperService) private readonly svc: SkladKeeperService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.list(user.accountId);
  }

  /** Upsert one sklad→keeper mapping (employeeId null clears it). */
  @Put()
  @RequirePermission({ entity: 'settings', action: 'update' })
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upsert(user.accountId, body);
  }

  /** Set (or clear) the account-wide customer-receipt printer. */
  @Put('receipt-printer')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async setReceiptPrinter(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.setReceiptPrinter(user.accountId, body);
  }

  @Delete(':skladNo')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('skladNo') skladNo: string) {
    return this.svc.remove(user.accountId, Number(skladNo));
  }
}
