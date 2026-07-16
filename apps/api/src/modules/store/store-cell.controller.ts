import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { StoreCellService } from './store-cell.service.js';

/**
 * Adresli saqlash — ombor yacheykalari registri (moysklad «Адресное хранение
 * товаров» analogi). Per-ombor CRUD `admin/stores/:id/cells` ostida;
 * akkaunt-bo'ylab qidiruv `admin/store-cells` alohida prefiksda (StoreController
 * `admin/stores/:id` route'i bilan to'qnashmasin).
 */
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class StoreCellController {
  constructor(@Inject(StoreCellService) private readonly svc: StoreCellService) {}

  @Get('stores/:id/cells')
  @RequirePermission({ entity: 'store', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.list(user.accountId, id);
  }

  // «Polka qo'shish» — prefix + miqdor → ketma-ket yacheykalar generatsiyasi.
  @Post('stores/:id/cells/generate')
  @RequirePermission({ entity: 'store', action: 'update' })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.generate(user.accountId, id, body);
  }

  // «+ Yacheyka» — bitta yacheykani qo'lda qo'shish.
  @Post('stores/:id/cells')
  @RequirePermission({ entity: 'store', action: 'update' })
  async createOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.createOne(user.accountId, id, body);
  }

  @Delete('stores/:id/cells/:cellId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
  ) {
    return this.svc.delete(user.accountId, id, cellId);
  }

  // Yacheykaga tovar biriktirish — tovarning asosiy loc* manzilini yozadi,
  // shuning uchun product:update huquqi talab qilinadi.
  @Post('stores/:id/cells/:cellId/assign')
  @RequirePermission({ entity: 'product', action: 'update' })
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Body() body: unknown,
  ) {
    return this.svc.assign(user.accountId, id, cellId, body);
  }

  // Tovar kartochkasidagi qidiruvli dropdown — barcha yacheykalar.
  @Get('store-cells')
  @RequirePermission({ entity: 'store', action: 'view' })
  async searchAll(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.searchAll(user.accountId, query);
  }
}
