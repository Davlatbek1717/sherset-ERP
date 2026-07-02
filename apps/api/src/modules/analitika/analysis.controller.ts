import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { AnalysisService } from './analysis.service.js';

@Controller('analitika/counterparties')
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(@Inject(AnalysisService) private readonly svc: AnalysisService) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listCounterparties(user.accountId, query);
  }

  @Get(':id/analysis')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async analyze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.analyze(user.accountId, id, query);
  }
}
