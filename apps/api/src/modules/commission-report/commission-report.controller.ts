import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BulkIdsSchema } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { CommissionReportService } from './commission-report.service.js';

/**
 * Commission report API. The primary list endpoint `/commission-reports` is a
 * UNION of both report types («Выданный» + «Полученный») — moysklad shows them
 * in one list with a «Тип документа» column. Totals ride inside the list
 * response (no separate aggregate call). The per-type `/:id` routes back the
 * №-link to the matching detail (out vs in). All check the `commissionreport`
 * permission entity — the in/out split is a domain concept, not an authz boundary.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class CommissionReportController {
  constructor(@Inject(CommissionReportService) private readonly service: CommissionReportService) {}

  @Get('commission-reports')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  // moysklad «Изменить» → «Удалить»: soft-delete selected reports. The union spans
  // two tables; ids are unique UUIDs so the delete hits whichever table owns each
  // row. Declared before `:id` (POST never shadows the GET, but keep it grouped).
  @Post('commission-reports/bulk-delete')
  @RequirePermission({ entity: 'commissionreport', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return this.service.bulkSoftDelete(user.accountId, ids);
  }

  // moysklad «Изменить» → «Массовое редактирование»: apply ownerId / description to
  // many reports at once. The read-only model has no projectId, so the patch is
  // limited to those two scalars (the FE MassEditModal hides the project row).
  @Post('commission-reports/mass-edit')
  @RequirePermission({ entity: 'commissionreport', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'description']);
    return this.service.massEdit(user.accountId, ids, patch);
  }

  // moysklad «+ Отчёт комиссионера → Выданный отчёт комиссионера» — create the
  // outgoing report. The server computes the totals from the posted positions and
  // stores a draft (header-only model; position rows + «Полученный»/in editor join
  // the next focused session). Same `commissionreport` entity permission.
  @Post('commission-reports')
  @RequirePermission({ entity: 'commissionreport', action: 'create' })
  async createOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.createOut(user.accountId, user.sub, body);
  }

  // «Полученный отчёт комиссионера» create — the «+ Отчёт комиссионера → Полученный»
  // editor. Header-only draft (server-computed totals from «Реализовано комиссионером»
  // positions) + «Входящий номер» / «Прочие услуги». Same entity permission.
  @Post('commission-reports-in')
  @RequirePermission({ entity: 'commissionreport', action: 'create' })
  async createIn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.createIn(user.accountId, user.sub, body);
  }

  @Get('commission-reports/:id')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async findByIdOut(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findByIdOut(user.accountId, id);
  }

  @Get('commission-reports-in/:id')
  @RequirePermission({ entity: 'commissionreport', action: 'view' })
  async findByIdIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findByIdIn(user.accountId, id);
  }
}
