import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ItemsService } from './items.service.js';

@Controller('analitika/items')
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(@Inject(ItemsService) private readonly svc: ItemsService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get('stats')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async stats(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.stats(user.accountId, query);
  }

  @Get('groups')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async groups(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.groups(user.accountId);
  }
}
