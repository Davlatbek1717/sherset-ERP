import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { SerialNumberService } from './serial-number.service.js';

/**
 * Серийные номера — read-only list under the «Товары» section. Guarded by the
 * product `view` permission (it is a product-assortment view, not a separate
 * permissioned entity). See SerialNumberService for why it is currently empty.
 */
@Controller('serial-numbers')
@UseGuards(JwtAuthGuard)
export class SerialNumberController {
  constructor(@Inject(SerialNumberService) private readonly svc: SerialNumberService) {}

  @Get()
  @RequirePermission({ entity: 'product', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }
}
