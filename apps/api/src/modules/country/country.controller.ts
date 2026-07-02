import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CountryService } from './country.service.js';

/**
 * Country read-only API — search + lookup for the «Страна» position
 * picker on import-inbound docs (Приёмка §41, Возврат покупателя §45).
 */
@Controller('countries')
@UseGuards(JwtAuthGuard)
export class CountryController {
  constructor(@Inject(CountryService) private readonly svc: CountryService) {}

  @Get()
  @RequirePermission({ entity: 'country', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'country', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }
}
