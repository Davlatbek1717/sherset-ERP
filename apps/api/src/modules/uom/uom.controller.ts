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
import { UomService } from './uom.service.js';

@Controller('uoms')
@UseGuards(JwtAuthGuard)
export class UomController {
  constructor(@Inject(UomService) private readonly svc: UomService) {}

  @Get()
  @RequirePermission({ entity: 'uom', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    await this.svc.seedDefaultsIfEmpty(user.accountId);
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'uom', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'uom', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'uom', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'uom', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  // ---- bulk «Изменить» surface --------------------------------------
  // moysklad's Единицы измерения «Изменить» menu has exactly two items:
  // Удалить + Массовое редактирование (captured 2026-05-30,
  // docs/moysklad-reference/uoms). Only «Удалить» is backed — moysklad
  // itself errors on mass-editing system uoms ("выставите фильтр по
  // конкретному типу справочника"), so the web «Массовое редактирование»
  // is a disabled label-parity placeholder with no endpoint. No archive
  // (uoms have no archived state — 2-item menu, not the 4-item catalog one).
  @Post('bulk-delete')
  @RequirePermission({ entity: 'uom', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, id));
  }
}
