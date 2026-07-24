import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { HrPermissionGuard } from '../hr-auth/hr-permission.guard.js';
import { RequireHrPermission } from '../hr-auth/require-hr-permission.decorator.js';
import { DashboardQuerySchema, MonthlyReportFilterSchema } from './attendance-geo.schema.js';
import { HrDavomatExportService } from './davomat-export.service.js';
import { HrDavomatReportService } from './davomat-report.service.js';

/** HR-facing davomat board + monthly report + XLSX export. */
@Controller('hr/attendance')
@UseGuards(JwtAuthGuard, HrPermissionGuard)
export class HrDavomatAdminController {
  constructor(
    @Inject(HrDavomatReportService) private readonly report: HrDavomatReportService,
    @Inject(HrDavomatExportService) private readonly exporter: HrDavomatExportService,
  ) {}

  @Get('live')
  @RequireHrPermission('employees', 'read')
  async live(@CurrentUser() user: AuthenticatedUser) {
    return this.report.live(user.accountId);
  }

  @Get('dashboard')
  @RequireHrPermission('employees', 'read')
  async dashboard(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    const { date } = DashboardQuerySchema.parse(query);
    return this.report.dashboard(user.accountId, date);
  }

  @Get('report/monthly')
  @RequireHrPermission('employees', 'read')
  async monthly(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.report.monthly(user.accountId, MonthlyReportFilterSchema.parse(query));
  }

  @Get('report/monthly.xlsx')
  @RequireHrPermission('employees', 'read')
  @Header('Cache-Control', 'no-store')
  async monthlyXlsx(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const filter = MonthlyReportFilterSchema.parse(query);
    const buffer = await this.exporter.monthlyXlsx(user.accountId, filter);
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="davomat-${filter.yearMonth}.xlsx"`);
    return new StreamableFile(buffer);
  }
}
