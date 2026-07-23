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
import { LossService } from './loss.service.js';

const LossBulkPrintSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  templateId: z.string().uuid().optional(),
});

@Controller('losses')
@UseGuards(JwtAuthGuard)
export class LossController {
  constructor(
    @Inject(LossService) private readonly svc: LossService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
  ) {}

  /**
   * Doc-scoped list of the account's printable templates for this entity —
   * gated on loss:view (NOT settings) so a cashier who can open the page
   * also sees the pinned check-print buttons; the settings-gated
   * /print-templates CRUD stays admin-only. Mirrors purchase-order.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'loss', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'loss', 'pdf');
  }

  @Get()
  @RequirePermission({ entity: 'loss', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  // moysklad «Итого» — pinned footer total over the active filter set (mirrors
  // invoice-in.controller). Two segments, so it never collides with `:id`.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'loss', action: 'view' })
  async aggregateTotals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.aggregateTotals(user.accountId, query);
  }

  // moysklad toolbar «N из ВСЕГО ‹ ›» — position in the full list + neighbours.
  // Two segments, so it never collides with `:id`. Mirrors enter/purchase-order.
  @Get(':id/position')
  @RequirePermission({ entity: 'loss', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findPosition(user.accountId, id);
  }

  @Get(':id')
  @RequirePermission({ entity: 'loss', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }
  @Post()
  @RequirePermission({ entity: 'loss', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }
  @Patch(':id')
  @RequirePermission({ entity: 'loss', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }
  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'loss', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, target);
  }
  @Delete(':id')
  @RequirePermission({ entity: 'loss', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'loss', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'loss', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'loss', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.svc.transition(user.accountId, user.sub, id, target));
  }

  // moysklad «Печать» → account print form — render the selected write-offs into
  // a single PDF using a custom PrintTemplate (templateId) or the account's
  // default loss template. Mirrors enter bulk-print; Loss is an internal
  // stock-out (no counterparty). A DRAFT line has no frozen costMinor yet, so
  // its money falls back to the product cost (buyPrice) — same basis the
  // detail grid shows.
  @Post('bulk-print')
  @RequirePermission({ entity: 'loss', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = LossBulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const l = await this.svc.findById(user.accountId, id);
      docs.push({
        title: 'Списание',
        number: l.name,
        date: l.moment,
        sumMinor: l.sumMinor?.toString() ?? null,
        currency: l.currency ?? 'UZS',
        description: l.description ?? null,
        counterpartyName: null,
        organizationName: l.organization?.name ?? null,
        organizationPhone: null,
        positions: l.positions.map((p) => {
          const costMinor = p.costMinor ?? p.product?.buyPrice ?? 0n;
          return {
            name: p.product?.name ?? '—',
            unit: p.product?.uom ?? '',
            qty: String(p.quantity),
            priceMinor: costMinor,
            sumMinor: scaleMinorByQty(costMinor, String(p.quantity)),
          };
        }),
      });
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'loss', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="losses-${ids.length}.pdf"`)
      .send(merged);
  }

  // moysklad «Изменить → Массовое редактирование» for Списания — the wizard's
  // field set (live-grounded 2026-07-09, online.moysklad.ru #bulkEdit): Проект ·
  // Статья расходов · Владелец-сотрудник · Владелец-отдел · Общий доступ
  // (+ Комментарий, our base field). Статус is omitted until Loss grows custom
  // statuses. expenseItem carries the item NAME (Loss.expenseItem semantics).
  @Post('mass-edit')
  @RequirePermission({ entity: 'loss', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, [
      'ownerId',
      'projectId',
      'description',
      'groupId',
      'shared',
      'expenseItem',
    ]);
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, user.sub, id, patch));
  }
}
