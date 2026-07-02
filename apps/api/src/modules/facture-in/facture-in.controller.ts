import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import {
  GenerateFactureInFromPaymentOutSchema,
  GenerateFactureInFromSuppliesSchema,
  GenerateFactureInSchema,
} from './facture-in.schema.js';
import { FactureInService } from './facture-in.service.js';

@Controller('factures-in')
@UseGuards(JwtAuthGuard)
export class FactureInController {
  constructor(@Inject(FactureInService) private readonly service: FactureInService) {}

  @Get()
  @RequirePermission({ entity: 'facturein', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'facturein', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  /**
   * POST /factures-in/generate { supplyId } — create (or return the
   * existing, idempotent) Счёт-фактура полученный from a Supply.
   */
  @Post('generate')
  @RequirePermission({ entity: 'facturein', action: 'create' })
  async generate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { supplyId } = GenerateFactureInSchema.parse(body);
    return this.service.generateFromSupply(user.accountId, user.sub, supplyId);
  }

  /** §66 — Счёт-фактура from 1+ Приёмки (moysklad `supplies` array). */
  @Post('generate/from-supplies')
  @RequirePermission({ entity: 'facturein', action: 'create' })
  async generateFromSupplies(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { supplyIds } = GenerateFactureInFromSuppliesSchema.parse(body);
    return this.service.generateFromSupplies(user.accountId, user.sub, supplyIds);
  }

  /** §66 — Счёт-фактура на основе исходящего платежа. */
  @Post('generate/from-payment-out')
  @RequirePermission({ entity: 'facturein', action: 'create' })
  async generateFromPaymentOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { paymentOutId } = GenerateFactureInFromPaymentOutSchema.parse(body);
    return this.service.generateFromPaymentOut(user.accountId, user.sub, paymentOutId);
  }
}
