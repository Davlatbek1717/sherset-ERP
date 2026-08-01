import {
  Body,
  Controller,
  Delete,
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
import { BulkIdsSchema, runBulk } from '../shared/bulk.js';
import { AddAnalogSchema } from './product-analog.schema.js';
import { ProductAnalogService } from './product-analog.service.js';
import { ProductCellMoveService } from './product-cell-move.service.js';
import { ProductCutService } from './product-cut.service.js';
import {
  BulkMoveSchema,
  BulkSetPricesSchema,
  BulkUpdateSchema,
  ProductIdSchema,
  SaveLinePricesSchema,
  SetSalePriceSchema,
} from './product.schema.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(
    @Inject(ProductService) private readonly service: ProductService,
    @Inject(ProductAnalogService) private readonly analogs: ProductAnalogService,
    @Inject(ProductCutService) private readonly cutService: ProductCutService,
    @Inject(ProductCellMoveService) private readonly cellMoveService: ProductCellMoveService,
  ) {}

  @Get('cell/:code')
  @RequirePermission({ entity: 'product', action: 'view' })
  async cellContents(@CurrentUser() user: AuthenticatedUser, @Param('code') code: string) {
    return this.service.getCellContents(user.accountId, code);
  }

  // `:id` dan OLDIN e'lon qilinadi, aks holda `:id` bu yo'lni yutib yuboradi.
  @Get(':id/scan')
  @RequirePermission({ entity: 'product', action: 'view' })
  async scanInfo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getScanInfo(user.accountId, id);
  }

  @Get()
  @RequirePermission({ entity: 'product', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  // «Характеристики» filter options — MUST be declared before the `:id` route so
  // the literal path isn't captured as an id.
  @Get('characteristic-values')
  @RequirePermission({ entity: 'product', action: 'view' })
  async characteristicValues(@CurrentUser() user: AuthenticatedUser) {
    return this.service.characteristicValues(user.accountId);
  }

  // «Полка» + «Ячейка» pickers on the product card — all warehouses' zones/cells
  // (literal path, declared before `:id` so it isn't captured as an id).
  @Get('storage-options')
  @RequirePermission({ entity: 'product', action: 'view' })
  async storageOptions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.storageOptions(user.accountId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'product', action: 'view' })
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  // «Место хранения» — the product's real per-cell stock (StockByCell rows),
  // shown as a read-only table on the product card.
  @Get(':id/cell-stock')
  @RequirePermission({ entity: 'product', action: 'view' })
  async cellStock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.cellStock(user.accountId, id);
  }

  // «Переместить» — move this product between two cells of the SAME store (pure
  // per-cell redistribution; store-level stock unchanged). An address-storage
  // mutation ⇒ `store.update`, consistent with every other cell operation.
  @Post(':id/cell-move')
  @RequirePermission({ entity: 'store', action: 'update' })
  async cellMove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cellMoveService.move(user.accountId, user.sub, id, body);
  }

  // «Переместить» on a HOME-CELL binding row — re-assign the product's home cell
  // (attributes `__yacheyka`/`__polka`) to another cell. Edits the product card ⇒
  // `product.update` (a pure label move, no stock touched).
  @Post(':id/cell-rebind')
  @RequirePermission({ entity: 'product', action: 'update' })
  async cellRebind(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cellMoveService.rebind(user.accountId, user.sub, id, body);
  }

  // «Переместить» qty from the HOME-CELL remainder into a real target cell —
  // allocate the product's unallocated on-hand into an address-storage bin
  // (StockByCell only; store stock unchanged). Address-storage mutation ⇒
  // `store.update`, consistent with `cell-move`.
  @Post(':id/cell-place')
  @RequirePermission({ entity: 'store', action: 'update' })
  async cellPlace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cellMoveService.place(user.accountId, user.sub, id, body);
  }

  // «Раскрой» — cut meter-good pieces into remnant pieces: POSTED Списание +
  // Оприходование in ONE transaction (product-cut.service.ts). The decorator
  // covers loss.create; the service additionally requires enter.create +
  // product.create (a cut books an Enter and may create remnant products).
  @Post(':id/cut')
  @RequirePermission({ entity: 'loss', action: 'create' })
  async cut(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.cutService.cut(user.accountId, user.sub, id, body);
  }

  // «Отрезы» card — the product's remnant family with live stock totals.
  @Get(':id/cuts')
  @RequirePermission({ entity: 'product', action: 'view' })
  async cuts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.cutService.cuts(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'product', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  // «Код» auto-fill for the create form — consumes + returns the next sequential
  // product code so /new can show it pre-filled (moysklad parity).
  @Post('allocate-code')
  @RequirePermission({ entity: 'product', action: 'create' })
  async allocateCode(@CurrentUser() user: AuthenticatedUser) {
    return { code: await this.service.allocateCode(user.accountId) };
  }

  @Patch(':id')
  @RequirePermission({ entity: 'product', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/archive')
  @RequirePermission({ entity: 'product', action: 'create' })
  async archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, true);
  }

  @Post(':id/restore')
  @RequirePermission({ entity: 'product', action: 'create' })
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.archive(user.accountId, user.sub, id, false);
  }

  // «Копировать» — duplicate ONE product and return the new copy (so the detail
  // page can open it), moysklad parity. (bulk-clone returns only source ids.)
  @Post(':id/clone')
  @RequirePermission({ entity: 'product', action: 'create' })
  async clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.cloneOne(user.accountId, user.sub, id);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'product', action: 'delete' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.accountId, user.sub, id);
  }

  // ── «Аналоги» (product card tab) — substitute-product list for a product ──
  @Get(':id/analogs')
  @RequirePermission({ entity: 'product', action: 'view' })
  async listAnalogs(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.analogs.list(user.accountId, id);
  }

  @Post(':id/analogs')
  @RequirePermission({ entity: 'product', action: 'update' })
  async addAnalog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { analogId } = AddAnalogSchema.parse(body);
    return this.analogs.add(user.accountId, id, analogId);
  }

  @Delete(':id/analogs/:analogId')
  @RequirePermission({ entity: 'product', action: 'update' })
  async removeAnalog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('analogId') analogId: string,
  ) {
    return this.analogs.remove(user.accountId, id, analogId);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'product', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-archive')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkArchive(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, true));
  }

  @Post('bulk-restore')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkRestore(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.archive(user.accountId, user.sub, id, false));
  }

  // «Переместить» — bulk move selected assortment to a folder (null = root).
  @Post('bulk-move')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkMove(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, productFolderId } = BulkMoveSchema.parse(body);
    return this.service.bulkMove(user.accountId, ids, productFolderId);
  }

  // «Копировать» — duplicate each selected product (+ its packs).
  @Post('bulk-clone')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkClone(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.cloneOne(user.accountId, user.sub, id));
  }

  // «Изменить цены» — bulk-change ONE target price type on the selection by the
  // chosen mode (fixed / cost-based / other-price ± adjustment, rounding).
  @Post('bulk-set-prices')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkSetPrices(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, valueMinor, ...rest } = BulkSetPricesSchema.parse(body);
    const spec = { ...rest, valueMinor: valueMinor != null ? BigInt(valueMinor) : null };
    return runBulk(ids, (id) => this.service.setPricesOne(user.accountId, user.sub, id, spec));
  }

  // «Массовое редактирование» — bulk-edit common fields on the selected products.
  @Post('bulk-update')
  @RequirePermission({ entity: 'product', action: 'create' })
  async bulkUpdate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, ...patch } = BulkUpdateSchema.parse(body);
    return this.service.bulkUpdate(user.accountId, ids, patch);
  }

  // «Цена ▾ → Сохранить цены» — write a document grid's per-line prices to the
  // products' default sale price type (moysklad position-grid action).
  @Post('save-line-prices')
  @RequirePermission({ entity: 'product', action: 'create' })
  async saveLinePrices(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { items } = SaveLinePricesSchema.parse(body);
    return this.service.saveLinePrices(user.accountId, items, user.sub);
  }

  // Pick-modal «Doimiy narx» — make a negotiated price the product's permanent
  // default sale price. Deliberately JWT-only (NO product permission): owner
  // decision 2026-07-17 — ANY cashier may do this from the sales pick modal.
  @Post(':id/sale-price')
  async setDefaultSalePrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    // A garbage :id would hit Prisma's @db.Uuid column as a P2023 (500) — parse
    // it here so a malformed id is a clean 400 like every other Zod failure.
    const productId = ProductIdSchema.parse(id);
    const { priceMinor } = SetSalePriceSchema.parse(body);
    return this.service.setDefaultSalePrice(user.accountId, user.sub, productId, priceMinor);
  }
}
