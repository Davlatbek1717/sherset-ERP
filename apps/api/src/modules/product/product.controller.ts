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
import { AddAnalogSchema } from './product-analog.schema.js';
import { ProductAnalogService } from './product-analog.service.js';
import {
  BulkMoveSchema,
  BulkSetPricesSchema,
  BulkUpdateSchema,
  SetProductLocationsSchema,
} from './product.schema.js';
import { ProductService } from './product.service.js';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(
    @Inject(ProductService) private readonly service: ProductService,
    @Inject(ProductAnalogService) private readonly analogs: ProductAnalogService,
  ) {}

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

  // Scan page — product detail + per-store stock balances. Declared before `:id`
  // so the literal segment 'scan' is not captured as an id parameter.
  @Get(':id/scan')
  @RequirePermission({ entity: 'product', action: 'view' })
  async scanInfo(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getScanInfo(user.accountId, id);
  }

  @Get(':id')
  @RequirePermission({ entity: 'product', action: 'view' })
  async getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
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

  // ── Multi-bin: additional shelf locations (beyond the primary loc* home) ──
  @Get(':id/locations')
  @RequirePermission({ entity: 'product', action: 'view' })
  async listLocations(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.listLocations(user.accountId, id);
  }

  @Put(':id/locations')
  @RequirePermission({ entity: 'product', action: 'update' })
  async setLocations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { locations } = SetProductLocationsSchema.parse(body);
    return this.service.setLocations(user.accountId, id, locations);
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
}
