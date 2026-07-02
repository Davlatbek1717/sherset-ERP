import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CommissionReportService } from './commission-report.service.js';

/**
 * Commission report API. Two top-level routes — /commission-reports
 * for the Out-side (we sold for someone, primary moysklad nav entry)
 * and /commission-reports-in for the In-side (someone sold for us,
 * lives in a sub-page since it's rare in standard UZ retail).
 *
 * Both share a single service to keep the filter schema in lockstep,
 * and both check the `commissionreport` permission entity — the In/Out
 * split is a domain concept, not an authorization boundary.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CommissionReportController {
  constructor(@Inject(CommissionReportService) private readonly service: CommissionReportService) {}

  @Get('commission-reports')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async listOut(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.listOut(user.accountId, query);
  }

  // moysklad list footer «Итого» — totals across the whole filtered set.
  // Declared before the `:id` route so it never shadows.
  @Get('commission-reports/aggregate/totals')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  aggregateTotalsOut(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.aggregateTotalsOut(user.accountId, query);
  }

  @Get('commission-reports/:id')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async findByIdOut(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findByIdOut(user.accountId, id);
  }

  @Get('commission-reports-in')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async listIn(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.listIn(user.accountId, query);
  }

  @Get('commission-reports-in/:id')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async findByIdIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findByIdIn(user.accountId, id);
  }
}
