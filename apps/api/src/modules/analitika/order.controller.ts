import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { OrderService } from './order.service.js';

@Controller('analitika/orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(@Inject(OrderService) private readonly svc: OrderService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.getById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'analitika', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }
}
