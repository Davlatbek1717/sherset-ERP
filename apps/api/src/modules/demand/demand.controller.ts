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
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { DocPdfService } from '../print-template/doc-pdf.service.js';
import type { RawDocInput } from '../print-template/print-render.util.js';
import { computeLineSumMinor } from '../print-template/print-render.util.js';
import { PrintTemplateService } from '../print-template/print-template.service.js';
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
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
  ) {}

  /**
   * Doc-scoped list of the account's printable templates for this entity —
   * gated on demand:view (NOT settings) so a cashier who can open the page
   * also sees the pinned check-print buttons; the settings-gated
   * /print-templates CRUD stays admin-only. Mirrors purchase-order.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'demand', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'demand', 'pdf');
  }

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

  /**
   * «Связанные документы» — docs linked to this shipment: the upstream Заказ
   * покупателя it was created from, plus downstream Возвраты покупателей /
   * Счета-фактуры выданные / Перемещения. Mirrors customer-order `/related`.
   */
  @Get(':id/related')
  @RequirePermission({ entity: 'demand', action: 'view' })
  async related(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.demand.findRelated(user.accountId, id);
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

  /**
   * «Статус» — set (or clear, `statusId: null`) the shipment's account-defined
   * custom status. Applied immediately (moysklad parity). Mirror of supply.
   */
  @Patch(':id/status')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { statusId } = z.object({ statusId: z.string().uuid().nullable() }).parse(body);
    return this.demand.setStatus(user.accountId, user.sub, id, statusId);
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

  // «Статус ▾» toolbar menu — bulk-set (or clear) the custom status on the
  // selected shipments. Mirror of supply.bulkSetStatus.
  @Post('bulk-set-status')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async bulkSetStatus(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, statusId } = BulkIdsSchema.extend({
      statusId: z.string().uuid().nullable(),
    }).parse(body);
    return this.demand.bulkSetStatus(user.accountId, user.sub, ids, statusId);
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'demand', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, [
      'ownerId',
      'projectId',
      'description',
      'groupId',
      'shared',
      'stateId',
    ]);
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
