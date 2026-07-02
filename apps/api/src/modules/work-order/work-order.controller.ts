import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { DocPdfService } from '../print-template/doc-pdf.service.js';
import type { RawDocInput } from '../print-template/print-render.util.js';
import { BulkPrintSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { WorkOrderService } from './work-order.service.js';

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrderController {
  constructor(
    @Inject(WorkOrderService) private readonly svc: WorkOrderService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'workorder', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'workorder', action: 'view' })
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'workorder', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'workorder', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transition')
  @RequirePermission({ entity: 'workorder', action: 'approve' })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'workorder', action: 'delete' })
  delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'workorder', action: 'delete' })
  bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.bulkDelete(user.accountId, user.sub, body);
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'workorder', action: 'approve' })
  bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.bulkTransition(user.accountId, user.sub, body);
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'workorder', action: 'update' })
  massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, ...patch } = MassEditBaseSchema.parse(body);
    // WorkOrder lacks projectId — restrict to ownerId + description.
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'description']);
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, id, patch));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'workorder', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.svc.findById(user.accountId, id);
      docs.push({
        title: 'Texnik topshiriq (TZ)',
        number: doc.name,
        // WorkOrder uses plannedStartAt instead of moment; null is fine.
        date: doc.plannedStartAt ?? doc.createdAt ?? null,
        sumMinor: null,
        currency: null,
        description: doc.description ?? null,
      });
      // WorkOrder schema has no `printed` column — skip mark-printed.
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'workorder', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="work-orders-${ids.length}.pdf"`)
      .send(merged);
  }
}
