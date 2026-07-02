import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { CountService } from './count.service.js';
import { ReportExportService } from './report-export.service.js';
import { ReportPdfService } from './report-pdf.service.js';

@Controller('analitika/counts')
@UseGuards(JwtAuthGuard)
export class CountController {
  constructor(
    @Inject(CountService) private readonly svc: CountService,
    @Inject(ReportExportService) private readonly exporter: ReportExportService,
    @Inject(ReportPdfService) private readonly pdf: ReportPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get('products')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async products(
    @CurrentUser() user: AuthenticatedUser,
    @Query('storeId') storeId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listProductsForCounting(user.accountId, { storeId, search });
  }

  @Get('summary')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async summary(@CurrentUser() user: AuthenticatedUser, @Query('storeId') storeId?: string) {
    return this.svc.summary(user.accountId, { storeId });
  }

  @Get('report')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async report(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.report(user.accountId, query);
  }

  /** Multi-sheet XLSX export — Xulosa / Mahsulot / Sanovchi / Guruh / Sabab / Top-10. */
  @Get('report/export.xlsx')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  @Header('Cache-Control', 'no-store')
  async reportXlsx(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const buffer = await this.exporter.generateReportXlsx(user.accountId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="inventerizatsiya_${stamp}.xlsx"`);
    return new StreamableFile(buffer);
  }

  /** Print-friendly single-page A4 PDF report. */
  @Get('report/export.pdf')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  @Header('Cache-Control', 'no-store')
  async reportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const buffer = await this.pdf.generateReportPdf(user.accountId, query);
    const stamp = new Date().toISOString().slice(0, 10);
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `attachment; filename="inventerizatsiya_${stamp}.pdf"`);
    return new StreamableFile(buffer);
  }

  /** Current-state snapshot (one row per product, rejected counts excluded). */
  @Get('snapshot')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  async snapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Query('groupName') groupName?: string,
    @Query('storeId') storeId?: string,
  ) {
    const rows = await this.svc.snapshot(user.accountId, { groupName, storeId });
    return { rows, total: rows.length };
  }

  /** Snapshot XLSX — single-sheet "Sanash holati" workbook. */
  @Get('snapshot.xlsx')
  @RequirePermission({ entity: 'analitika', action: 'view' })
  @Header('Cache-Control', 'no-store')
  async snapshotXlsx(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: FastifyReply,
    @Query('groupName') groupName?: string,
    @Query('storeId') storeId?: string,
  ): Promise<StreamableFile> {
    const buffer = await this.exporter.generateSnapshotXlsx(user.accountId, {
      groupName,
      storeId,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = groupName
      ? `_${groupName
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .slice(0, 30)}`
      : '';
    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.header('Content-Disposition', `attachment; filename="sanash_holati${slug}_${stamp}.xlsx"`);
    return new StreamableFile(buffer);
  }

  @Post('reset')
  @RequirePermission({ entity: 'analitika', action: 'delete' })
  async reset(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.reset(user.accountId, body);
  }

  @Put()
  @RequirePermission({ entity: 'analitika', action: 'create' })
  async upsert(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.upsert(user.accountId, user.sub, body);
  }

  @Post('bulk-approve')
  @RequirePermission({ entity: 'analitika', action: 'approve' })
  async bulkApprove(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.bulkApprove(user.accountId, user.sub, body);
  }

  @Post(':id/approve')
  @RequirePermission({ entity: 'analitika', action: 'approve' })
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.approve(user.accountId, user.sub, id, body);
  }

  @Post(':id/reject')
  @RequirePermission({ entity: 'analitika', action: 'approve' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.reject(user.accountId, user.sub, id, body);
  }

  @Post(':id/cancel')
  @RequirePermission({ entity: 'analitika', action: 'approve' })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.cancel(user.accountId, id);
  }
}
