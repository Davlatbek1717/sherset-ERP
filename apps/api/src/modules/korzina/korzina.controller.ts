import { Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { KorzinaService } from './korzina.service.js';

@Controller('korzina')
@UseGuards(JwtAuthGuard)
export class KorzinaController {
  constructor(@Inject(KorzinaService) private readonly svc: KorzinaService) {}

  @Get()
  @RequirePermission({ entity: 'auditlog', action: 'view' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entity') entity?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.svc.list(user.accountId, { entity, search, limit, sortBy, sortDir });
  }

  @Post(':entity/:id/restore')
  @RequirePermission({ entity: 'auditlog', action: 'update' })
  async restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    return this.svc.restore(user.accountId, entity, id);
  }

  @Delete(':entity/:id')
  @RequirePermission({ entity: 'auditlog', action: 'delete' })
  async purge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    return this.svc.purge(user.accountId, entity, id);
  }

  @Post('empty')
  @RequirePermission({ entity: 'auditlog', action: 'delete' })
  async empty(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.empty(user.accountId);
  }
}
