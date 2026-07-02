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
import { BulkIdsSchema, BulkPrintSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { PrepaymentTransitionSchema } from './prepayment.schema.js';
import { PrepaymentService } from './prepayment.service.js';

@Controller('prepayments')
@UseGuards(JwtAuthGuard)
export class PrepaymentController {
  constructor(
    @Inject(PrepaymentService)
    private readonly service: PrepaymentService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'prepayment', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'prepayment', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'prepayment', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'prepayment', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'prepayment', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.softDelete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'prepayment', action: 'create' })
  async clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'prepayment', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.softDelete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'prepayment', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    const validTarget = PrepaymentTransitionSchema.parse(target);
    return runBulk(ids, (id) => this.service.transition(user.accountId, user.sub, id, validTarget));
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'prepayment', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    const validTarget = PrepaymentTransitionSchema.parse(target);
    return this.service.transition(user.accountId, user.sub, id, validTarget);
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'prepayment', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.service.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'prepayment', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.service.findById(user.accountId, id);
      docs.push({
        title: 'Avans (Prepayment)',
        number: doc.name,
        date: doc.moment,
        sumMinor: doc.sumMinor?.toString() ?? null,
        currency: doc.currency ?? 'UZS',
        description: doc.description ?? null,
        counterpartyName: doc.agent?.name ?? null,
        organizationName: doc.organization?.name ?? null,
      });
      await this.service.markPrinted(user.accountId, id, true);
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'prepayment', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="prepayments-${ids.length}.pdf"`)
      .send(merged);
  }
}
