import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import {
  GenerateFactureOutFromDemandsSchema,
  GenerateFactureOutFromPaymentInSchema,
  GenerateFactureOutFromPurchaseReturnSchema,
  GenerateFactureOutSchema,
} from './facture-out.schema.js';
import { FactureOutService } from './facture-out.service.js';

@Controller('factures-out')
@UseGuards(JwtAuthGuard)
export class FactureOutController {
  constructor(@Inject(FactureOutService) private readonly service: FactureOutService) {}

  @Get()
  @RequirePermission({ entity: 'factureout', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  // moysklad list footer «Итого» — totals across the whole filtered set.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'factureout', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.aggregateTotals(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'factureout', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  /**
   * POST /factures-out/generate { demandId } — create (or return the
   * existing, idempotent) Счёт-фактура from a posted Demand.
   */
  @Post('generate')
  @RequirePermission({ entity: 'factureout', action: 'create' })
  async generate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { demandId } = GenerateFactureOutSchema.parse(body);
    return this.service.generateFromDemand(user.accountId, user.sub, demandId);
  }

  /** §66 — Счёт-фактура from 1+ Отгрузки (moysklad `demands` array). */
  @Post('generate/from-demands')
  @RequirePermission({ entity: 'factureout', action: 'create' })
  async generateFromDemands(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { demandIds } = GenerateFactureOutFromDemandsSchema.parse(body);
    return this.service.generateFromDemands(user.accountId, user.sub, demandIds);
  }

  /** §66 — Счёт-фактура на основе возврата поставщику. */
  @Post('generate/from-purchase-return')
  @RequirePermission({ entity: 'factureout', action: 'create' })
  async generateFromPurchaseReturn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { purchaseReturnId } = GenerateFactureOutFromPurchaseReturnSchema.parse(body);
    return this.service.generateFromPurchaseReturn(user.accountId, user.sub, purchaseReturnId);
  }

  /** §66 — авансовая Счёт-фактура на основе входящего платежа. */
  @Post('generate/from-payment-in')
  @RequirePermission({ entity: 'factureout', action: 'create' })
  async generateFromPaymentIn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { paymentInId, advanceVatRate } = GenerateFactureOutFromPaymentInSchema.parse(body);
    return this.service.generateFromPaymentIn(
      user.accountId,
      user.sub,
      paymentInId,
      advanceVatRate,
    );
  }
}
