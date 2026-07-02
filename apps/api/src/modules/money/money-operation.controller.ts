import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { MoneyOperationService } from './money-operation.service.js';

/**
 * Unified money-operation feed — drives /money page (moysklad parity).
 * Surfaces every cash flow (CashIn/Out + PaymentIn/Out) from the
 * shared MoneyOperation ledger as a single timeline. Read-only; the
 * 4 source documents own their own CRUD.
 */
@Controller('money-operations')
@UseGuards(JwtAuthGuard)
export class MoneyOperationController {
  constructor(@Inject(MoneyOperationService) private readonly svc: MoneyOperationService) {}

  @Get()
  @RequirePermission({ entity: 'paymentin', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }
}
