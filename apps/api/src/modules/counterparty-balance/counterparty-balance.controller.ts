import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';

/**
 * Read-only endpoint surfacing the per-currency balance ledger
 * aggregate for a counterparty. moysklad parity: every document edit
 * form (PurchaseOrder, CustomerOrder, InvoiceIn/Out, ...) displays
 * «Баланс (нам должны / мы должны)» inline under the agent field.
 *
 * Tenant-scoped (CurrentUser.accountId). The service returns
 * non-trivial rows only — empty array ⇒ zero/clean.
 */
@Controller('counterparty-balances')
@UseGuards(JwtAuthGuard)
export class CounterpartyBalanceController {
  constructor(
    @Inject(CounterpartyBalanceService) private readonly svc: CounterpartyBalanceService,
  ) {}

  @Get(':counterpartyId')
  @RequirePermission({ entity: 'counterparty', action: 'view' })
  async forCounterparty(
    @CurrentUser() user: AuthenticatedUser,
    @Param('counterpartyId', new ParseUUIDPipe()) counterpartyId: string,
  ): Promise<{ items: Array<{ currency: string; balanceMinor: string; updatedAt: Date }> }> {
    const items = await this.svc.listForCounterparty(user.accountId, counterpartyId);
    return { items };
  }
}
