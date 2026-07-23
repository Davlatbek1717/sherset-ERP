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
import { BulkIdsSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventories')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly svc: InventoryService) {}

  @Get()
  @RequirePermission({ entity: 'inventory', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }
  // Grid enrichment for the editor (band 3): catalog fields + store balance +
  // per-unit cost + StockByCell rows. POST body — id lists exceed URL limits.
  @Post('position-meta')
  @RequirePermission({ entity: 'inventory', action: 'view' })
  async positionMeta(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.positionMeta(user.accountId, body);
  }
  // «Дополнить из остатков» / «Дополнить из номенклатуры» candidate ids.
  // Declared BEFORE @Get(':id') — Nest matches routes in declaration order.
  @Get('fill-candidates')
  @RequirePermission({ entity: 'inventory', action: 'view' })
  async fillCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.fillCandidates(user.accountId, query);
  }
  @Get(':id')
  @RequirePermission({ entity: 'inventory', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }
  @Post()
  @RequirePermission({ entity: 'inventory', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }
  @Patch(':id')
  @RequirePermission({ entity: 'inventory', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }
  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'inventory', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, target);
  }
  @Delete(':id')
  @RequirePermission({ entity: 'inventory', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'inventory', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'inventory', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'inventory', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.svc.transition(user.accountId, user.sub, id, target));
  }
}
