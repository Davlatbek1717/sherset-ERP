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
import { BulkIdsSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { MoveService } from './move.service.js';

const MoveBulkPrintSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  templateId: z.string().uuid().optional(),
});

@Controller('moves')
@UseGuards(JwtAuthGuard)
export class MoveController {
  constructor(
    @Inject(MoveService) private readonly svc: MoveService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'move', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  // moysklad «Показать итоги» — aggregate over the active filter set
  // (mirrors customer-order.controller). Two segments, so it never
  // collides with the single-segment `:id` route; declared first anyway.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'move', action: 'view' })
  async aggregateTotals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.aggregateTotals(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'move', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'move', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'move', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'move', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, target);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'move', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'move', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'move', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'move', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.svc.transition(user.accountId, user.sub, id, target));
  }

  // moysklad «Массовое редактирование» — apply ownerId / projectId /
  // description to many moves at once (mirrors supply.controller).
  @Post('mass-edit')
  @RequirePermission({ entity: 'move', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, user.sub, id, patch));
  }

  // moysklad «Печать» — render the selected moves into a single PDF using a
  // custom PrintTemplate (templateId) or the account's default move template.
  // Mirrors customer-order bulk-print; Move is an internal transfer (no
  // counterparty), and line money is the post-time per-unit cost × qty.
  @Post('bulk-print')
  @RequirePermission({ entity: 'move', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = MoveBulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const m = await this.svc.findById(user.accountId, id);
      docs.push({
        title: 'Перемещение',
        number: m.name,
        date: m.moment,
        sumMinor: m.sumMinor?.toString() ?? null,
        currency: m.currency ?? 'UZS',
        description: m.description ?? null,
        counterpartyName: null,
        organizationName: m.organization?.name ?? null,
        organizationPhone: null,
        positions: m.positions.map((p) => ({
          name: p.product?.name ?? '—',
          unit: p.product?.uom ?? '',
          qty: String(p.quantity),
          priceMinor: p.costMinor ?? 0n,
          sumMinor: scaleMinorByQty(p.costMinor ?? 0n, String(p.quantity)),
        })),
      });
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'move', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="moves-${ids.length}.pdf"`)
      .send(merged);
  }
}
