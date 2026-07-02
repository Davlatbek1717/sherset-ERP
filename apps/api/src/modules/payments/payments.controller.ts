import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { PaymentsService } from './payments.service.js';

/**
 * Unified «Платежи» list (Деньги → Платежи). Read-only union of the four
 * payment document types — see PaymentsService. Guarded by paymentin:view
 * (every account with «Деньги» access holds it); the per-type editors keep
 * their own create/edit permissions.
 */
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermission({ entity: 'paymentin', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.payments.list(user.accountId, query);
  }
}
