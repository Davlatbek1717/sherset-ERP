import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BulkIdsSchema, runBulk } from '../shared/bulk.js';
import { StoreAddressService } from './store-address.service.js';
import { StoreService } from './store.service.js';

@Controller('admin/stores')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(
    @Inject(StoreService) private readonly svc: StoreService,
    @Inject(StoreAddressService) private readonly addr: StoreAddressService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'store', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  /** Scan flow (owner 2026-07-19): resolve a CELL barcode account-wide →
   *  the cell (+store/zone) with its bound products and per-cell stock, so a
   *  phone scanning just the shelf label sees what lives there. Declared
   *  BEFORE the :id routes so the literal segment never binds as :id. */
  @Get('cells/by-barcode')
  async cellByBarcode(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.addr.lookupCellByBarcode(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'store', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'store', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    // moysklad parity: «Владелец-сотрудник» defaults to the creator.
    return this.svc.create(user.accountId, body, user.sub);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'store', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'store', action: 'create' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.archive(user.accountId, id);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'store', action: 'create' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.restore(user.accountId, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'store', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'store', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'store', action: 'create' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.archive(user.accountId, id));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'store', action: 'create' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.restore(user.accountId, id));
  }

  /** «Копировать» (list Изменить ▾ + card Изменить ▾) — clone card + zones/cells. */
  @Post(':id/copy')
  @RequirePermission({ entity: 'store', action: 'create' })
  async copy(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, id);
  }

  @Post('bulk-copy')
  @RequirePermission({ entity: 'store', action: 'create' })
  async bulkCopy(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.clone(user.accountId, id));
  }

  /** «Переместить» — bulk re-parent into another warehouse (or root). */
  @Post('bulk-move')
  @RequirePermission({ entity: 'store', action: 'update' })
  async bulkMove(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.bulkMove(user.accountId, body);
  }

  /** «Массовое редактирование» — opt-in field patch over the selection. */
  @Post('bulk-update')
  @RequirePermission({ entity: 'store', action: 'update' })
  async bulkUpdate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.bulkUpdate(user.accountId, body);
  }

  // -------------------------------------------------------------------
  // Address storage (Адресное хранение) — Zones (Зоны) + Cells (Ячейки).
  // Sub-resources of one warehouse; mutations require the 'update' permission
  // (they edit the store's address config).
  // -------------------------------------------------------------------

  @Get(':id/address-storage')
  @RequirePermission({ entity: 'store', action: 'view' })
  async addressStorage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: { assortmentKind?: string; assortmentId?: string },
  ) {
    return this.addr.getAddressStorage(user.accountId, id, {
      assortmentKind: query.assortmentKind,
      assortmentId: query.assortmentId,
    });
  }

  /** «🖨 Этикетка» — one cell's stock with label identities (name/code/barcode). */
  @Get(':id/cells/:cellId/stock')
  @RequirePermission({ entity: 'store', action: 'view' })
  async cellStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
  ) {
    return this.addr.getCellStock(user.accountId, id, cellId);
  }

  /** «Sanash» (owner 2026-07-21) — record a physical count for one product in
   *  this cell (absolute value; 0 clears the row). */
  @Put(':id/cells/:cellId/stock')
  @RequirePermission({ entity: 'store', action: 'update' })
  async setCellStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Body() body: unknown,
  ) {
    // user.sub → «Umumiy sanash» true-up posts the auto Enter/Loss as this user.
    return this.addr.setCellStock(user.accountId, id, cellId, body, user.sub);
  }

  /** «Товары в ячейке» — products whose home cell (__yacheyka) is this cell. */
  @Get(':id/cells/:cellId/products')
  @RequirePermission({ entity: 'store', action: 'view' })
  async cellProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
  ) {
    return this.addr.getCellProducts(user.accountId, id, cellId);
  }

  /** «Добавить товар в ячейку» — assign the picked products' home cell to this cell. */
  @Post(':id/cells/:cellId/products')
  @RequirePermission({ entity: 'store', action: 'update' })
  async assignCellProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Body() body: unknown,
  ) {
    return this.addr.assignProducts(user.accountId, id, cellId, body);
  }

  /** Bind a cell-less product's home cell to this cell (NEVER overwrites) — used
   *  by document editors when a «Ячейка» is picked for a product with no cell. */
  @Post(':id/cells/:cellId/products/:productId/bind-if-empty')
  @RequirePermission({ entity: 'store', action: 'update' })
  async bindCellProductIfEmpty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Param('productId') productId: string,
  ) {
    return this.addr.bindProductIfEmpty(user.accountId, id, cellId, productId);
  }

  /** Remove one product from this cell (clears its home-cell binding). */
  @Delete(':id/cells/:cellId/products/:productId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async unassignCellProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Param('productId') productId: string,
  ) {
    return this.addr.unassignProduct(user.accountId, id, cellId, productId);
  }

  @Post(':id/zones')
  @RequirePermission({ entity: 'store', action: 'update' })
  async createZone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.addr.createZone(user.accountId, id, body);
  }

  @Patch(':id/zones/:zoneId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async updateZone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('zoneId') zoneId: string,
    @Body() body: unknown,
  ) {
    return this.addr.updateZone(user.accountId, id, zoneId, body);
  }

  @Delete(':id/zones/:zoneId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async deleteZone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('zoneId') zoneId: string,
  ) {
    return this.addr.deleteZone(user.accountId, id, zoneId);
  }

  @Post(':id/cells')
  @RequirePermission({ entity: 'store', action: 'update' })
  async createCell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.addr.createCell(user.accountId, id, body);
  }

  /** «Diapazon bo'yicha yaratish» — dryRun:true faqat sanoq qaytaradi.
   *  Marshrut `:id/cells/:cellId` DAN OLDIN turadi — aks holda «bulk»
   *  cellId deb o'qilishi mumkin edi. */
  @Post(':id/cells/bulk')
  @RequirePermission({ entity: 'store', action: 'update' })
  async bulkCreateCells(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.addr.bulkCreateCells(user.accountId, id, body);
  }

  @Patch(':id/cells/:cellId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async updateCell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
    @Body() body: unknown,
  ) {
    return this.addr.updateCell(user.accountId, id, cellId, body);
  }

  @Delete(':id/cells/:cellId')
  @RequirePermission({ entity: 'store', action: 'update' })
  async deleteCell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('cellId') cellId: string,
  ) {
    return this.addr.deleteCell(user.accountId, id, cellId);
  }
}
