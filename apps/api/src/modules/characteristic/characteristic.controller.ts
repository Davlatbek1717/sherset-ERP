import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CharacteristicService } from './characteristic.service.js';

/**
 * Characteristics dictionary — used by the «Создание модификаций» modal to
 * suggest existing characteristic names. moysklad gates these behind product
 * edit rights; we reuse the `variant` permission entity (characteristics are
 * variant metadata).
 */
@Controller('characteristics')
@UseGuards(JwtAuthGuard)
export class CharacteristicController {
  constructor(@Inject(CharacteristicService) private readonly svc: CharacteristicService) {}

  @Get()
  @RequirePermission({ entity: 'variant', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Post()
  @RequirePermission({ entity: 'variant', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }
}
