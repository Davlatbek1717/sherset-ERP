import { scaleMinorByQty } from '@moysklad/money';
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
import { PrintTemplateService } from '../print-template/print-template.service.js';
import { BulkIdsSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { EnterService } from './enter.service.js';

const EnterBulkPrintSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  templateId: z.string().uuid().optional(),
});

@Controller('enters')
@UseGuards(JwtAuthGuard)
export class EnterController {
  constructor(
    @Inject(EnterService) private readonly svc: EnterService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
  ) {}

  /**
   * Doc-scoped list of the account's printable templates for this entity —
   * gated on enter:view (NOT settings) so a cashier who can open the page
   * also sees the pinned check-print buttons; the settings-gated
   * /print-templates CRUD stays admin-only. Mirrors purchase-order.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'enter', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'enter', 'pdf');
  }

  @Get()
  @RequirePermission({ entity: 'enter', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  // moysklad «Итого» — aggregate over the active filter set (mirrors
  // move.controller). Two segments, so it never collides with `:id`.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'enter', action: 'view' })
  async aggregateTotals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.aggregateTotals(user.accountId, query);
  }

  // moysklad toolbar «N из ВСЕГО ‹ ›» — position in the full list + neighbours.
  // Two segments, so it never collides with `:id`. Mirrors purchase-orders/:id/position.
  @Get(':id/position')
  @RequirePermission({ entity: 'enter', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findPosition(user.accountId, id);
  }

  @Get(':id')
  @RequirePermission({ entity: 'enter', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }
  @Post()
  @RequirePermission({ entity: 'enter', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }
  @Patch(':id')
  @RequirePermission({ entity: 'enter', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }
  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'enter', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, target);
  }
  @Delete(':id')
  @RequirePermission({ entity: 'enter', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'enter', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'enter', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'enter', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.svc.transition(user.accountId, user.sub, id, target));
  }

  // moysklad «Массовое редактирование» — apply ownerId / projectId /
  // description to many enters at once (mirrors move.controller).
  @Post('mass-edit')
  @RequirePermission({ entity: 'enter', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, [
      'ownerId',
      'projectId',
      'description',
      'groupId',
      'shared',
    ]);
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, user.sub, id, patch));
  }

  // moysklad «Печать» → «Оприходование» — render the selected enters into a
  // single PDF using a custom PrintTemplate (templateId) or the account's
  // default enter template. Mirrors move bulk-print; Enter is an internal
  // stock-in (no counterparty), line money is the per-unit cost × qty.
  @Post('bulk-print')
  @RequirePermission({ entity: 'enter', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = EnterBulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const e = await this.svc.findById(user.accountId, id);
      docs.push({
        title: 'Оприходование',
        number: e.name,
        date: e.moment,
        sumMinor: e.sumMinor?.toString() ?? null,
        currency: e.currency ?? 'UZS',
        description: e.description ?? null,
        counterpartyName: null,
        organizationName: e.organization?.name ?? null,
        organizationPhone: null,
        positions: e.positions.map((p) => ({
          name: p.product?.name ?? '—',
          unit: p.product?.uom ?? '',
          qty: String(p.quantity),
          priceMinor: p.costMinor ?? 0n,
          sumMinor: scaleMinorByQty(p.costMinor ?? 0n, String(p.quantity)),
        })),
      });
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'enter', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="enters-${ids.length}.pdf"`)
      .send(merged);
  }
}
