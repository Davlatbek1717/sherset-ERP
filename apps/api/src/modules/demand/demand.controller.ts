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
import { computeLineSumMinor } from '../print-template/print-render.util.js';
import { BulkIdsSchema, BulkPrintSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { BulkMarkPrintedSchema } from '../shared/mass-print.js';
import { DemandService } from './demand.service.js';

@Controller('demands')
@UseGuards(JwtAuthGuard)
export class DemandController {
  constructor(
    @Inject(DemandService) private readonly demand: DemandService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'demand', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.demand.list(user.accountId, user.sub, query);
  }

  // moysklad list footer «Итого» — totals across the whole filtered set.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'demand', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.demand.aggregateTotals(user.accountId, user.sub, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'demand', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.demand.findByIdScoped(user.accountId, user.sub, id);
  }

  @Post()
  @RequirePermission({ entity: 'demand', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.demand.create(user.accountId, user.sub, body);
  }

  @Post('from-customer-order/:customerOrderId')
  @RequirePermission({ entity: 'demand', action: 'create' })
  async createFromCustomerOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerOrderId') customerOrderId: string,
    @Body() body: unknown,
  ) {
    return this.demand.createFromCustomerOrder(user.accountId, user.sub, customerOrderId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.demand.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'demand', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.demand.transition(user.accountId, user.sub, id, target);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'demand', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.demand.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'demand', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.demand.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'demand', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.demand.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'demand', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.demand.transition(user.accountId, user.sub, id, target));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.demand.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.demand.markPrinted(user.accountId, user.sub, id, printed));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'demand', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.demand.findByIdScoped(user.accountId, user.sub, id);
      docs.push({
        title: 'Otgruzka',
        number: doc.name,
        date: doc.moment,
        sumMinor: doc.sumMinor?.toString() ?? null,
        currency: doc.currency ?? 'UZS',
        description: doc.description ?? null,
        counterpartyName: doc.agent?.name ?? null,
        organizationName: doc.organization?.name ?? null,
        positions: doc.positions.map((p) => ({
          name: p.product?.name ?? '—',
          unit: p.product?.uom ?? '',
          qty: String(p.quantity),
          priceMinor: p.priceMinor,
          sumMinor: computeLineSumMinor(p.priceMinor, String(p.quantity), String(p.discount)),
        })),
      });
      await this.demand.markPrinted(user.accountId, user.sub, id, true);
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'demand', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="demands-${ids.length}.pdf"`)
      .send(merged);
  }
}
