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
import { SupplyService } from './supply.service.js';

@Controller('supplies')
@UseGuards(JwtAuthGuard)
export class SupplyController {
  constructor(
    @Inject(SupplyService) private readonly supply: SupplyService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'supply', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.supply.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'supply', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supply.findById(user.accountId, id);
  }

  /**
   * moysklad «Связанные документы» — documents linked to this receipt (source
   * Заказ поставщику + Возвраты поставщику). Drives the detail page's related-docs
   * diagram. Declared right after `:id` so the param route doesn't shadow it
   * (mirror purchase-orders).
   */
  @Get(':id/related')
  @RequirePermission({ entity: 'supply', action: 'view' })
  async related(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supply.findRelated(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'supply', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.supply.create(user.accountId, user.sub, body);
  }

  @Post('from-purchase-order/:purchaseOrderId')
  @RequirePermission({ entity: 'supply', action: 'create' })
  async createFromPurchaseOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('purchaseOrderId') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    return this.supply.createFromPurchaseOrder(user.accountId, user.sub, purchaseOrderId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'supply', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.supply.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'supply', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.supply.transition(user.accountId, user.sub, id, target);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'supply', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supply.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'supply', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.supply.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'supply', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.supply.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'supply', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.supply.transition(user.accountId, user.sub, id, target));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'supply', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.supply.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'supply', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.supply.markPrinted(user.accountId, user.sub, id, printed));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'supply', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.supply.findById(user.accountId, id);
      docs.push({
        title: 'Priyomka',
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
      await this.supply.markPrinted(user.accountId, user.sub, id, true);
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'supply', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="supplies-${ids.length}.pdf"`)
      .send(merged);
  }
}
