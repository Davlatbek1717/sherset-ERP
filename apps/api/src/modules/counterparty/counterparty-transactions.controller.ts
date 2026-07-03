import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CounterpartyTransactionsService } from './counterparty-transactions.service.js';

@Controller('counterparty-transactions')
@UseGuards(JwtAuthGuard)
export class CounterpartyTransactionsController {
  constructor(
    @Inject(CounterpartyTransactionsService)
    private readonly svc: CounterpartyTransactionsService,
  ) {}

  /** Merged sale/supply/payment feed. Optional ?counterpartyId= narrows to one agent. */
  @Get()
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('counterpartyId') counterpartyId?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.svc.list(user.accountId, {
      counterpartyId: counterpartyId || undefined,
      limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
      page: Math.max(Number(page) || 1, 1),
    });
  }
}
