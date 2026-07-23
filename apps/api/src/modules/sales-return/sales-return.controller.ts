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
import { AttachmentService } from '../attachment/attachment.service.js';
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
import { SalesReturnService } from './sales-return.service.js';

@Controller('sales-returns')
@UseGuards(JwtAuthGuard)
export class SalesReturnController {
  constructor(
    @Inject(SalesReturnService) private readonly svc: SalesReturnService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  // moysklad list footer «Итого» — totals across the whole filtered set.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.aggregateTotals(user.accountId, query);
  }

  // moysklad «Печать» / «Отправить» menus — the account's own «Возврат покупателя»
  // PDF print forms by name. Declared BEFORE `:id` so 'print-forms' isn't captured as
  // a record id. View-permission (the /print-templates CRUD stays admin-only). Mirror
  // of purchase-return / supply.
  @Get('print-forms')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'salesreturn', 'pdf');
  }

  @Get(':id')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'salesreturn', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, user.sub, body);
  }

  @Post('from-demand/:demandId')
  @RequirePermission({ entity: 'salesreturn', action: 'create' })
  async createFromDemand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('demandId') demandId: string,
    @Body() body: unknown,
  ) {
    return this.svc.createFromDemand(user.accountId, user.sub, demandId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'salesreturn', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.svc.transition(user.accountId, user.sub, id, target);
  }

  /**
   * «Статус» — set (or clear, `statusId: null`) the return's account-defined
   * custom status. Applied immediately (moysklad parity). Mirror of purchase-return /
   * supply PATCH :id/status.
   */
  @Patch(':id/status')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { statusId } = z.object({ statusId: z.string().uuid().nullable() }).parse(body);
    return this.svc.setStatus(user.accountId, user.sub, id, statusId);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'salesreturn', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'salesreturn', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'salesreturn', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.svc.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'salesreturn', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.svc.transition(user.accountId, user.sub, id, target));
  }

  // «Статус ▾» toolbar menu — bulk-set (or clear) the custom status on the
  // selected returns. Validates the target State once before fanning out.
  @Post('bulk-set-status')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
  async bulkSetStatus(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, statusId } = BulkIdsSchema.extend({
      statusId: z.string().uuid().nullable(),
    }).parse(body);
    return this.svc.bulkSetStatus(user.accountId, user.sub, ids, statusId);
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
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
    return runBulk(ids, (id) => this.svc.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'salesreturn', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.svc.markPrinted(user.accountId, user.sub, id, printed));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs = await this.buildPrintDocs(user, ids);
    const merged = await this.docPdf.renderBulk(user.accountId, 'salesreturn', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="sales-returns-${ids.length}.pdf"`)
      .send(merged);
  }

  // moysklad «Печать ▸ Комплект…» — bundle several «Возврат покупателя» print forms into
  // one combined PDF. `templateIds` may contain null for the standard built-in form.
  // Mirror of purchase-return / supply /kit-print.
  @Post('kit-print')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async kitPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateIds } = BulkIdsSchema.extend({
      templateIds: z.array(z.string().uuid().nullable()).min(1),
    }).parse(body);
    const docs = await this.buildPrintDocs(user, ids);
    const merged = await this.docPdf.renderKit(user.accountId, 'salesreturn', docs, templateIds);
    reply
      .header('Content-Disposition', `attachment; filename="sales-returns-kit-${ids.length}.pdf"`)
      .send(merged);
  }

  // moysklad «Отправить» — render THIS return through a print form, store the PDF as an
  // Attachment and return its id so the email composer pre-attaches it. The attachment
  // uses the Prisma-model discriminator 'SalesReturn' (NOT the 'salesreturn' doc-pdf
  // slug). Mirror of purchase-return / supply :id/print-attachment.
  @Post(':id/print-attachment')
  @RequirePermission({ entity: 'salesreturn', action: 'view' })
  async printAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { templateId } = z.object({ templateId: z.string().uuid().optional() }).parse(body ?? {});
    const docs = await this.buildPrintDocs(user, [id]);
    const pdf = await this.docPdf.renderBulk(user.accountId, 'salesreturn', docs, templateId);
    const filename = `Возврат покупателя ${docs[0]?.number ?? ''}.pdf`.trim();
    const att = await this.attachments.createFromBuffer(user.accountId, user.sub, {
      entity: 'SalesReturn',
      entityId: id,
      filename,
      mime: 'application/pdf',
      buffer: pdf,
    });
    return { attachmentId: att.id, filename: att.filename };
  }

  // Load each selected return into the print-render shape and flip its printed flag.
  // Shared by bulkPrint + kitPrint + printAttachment (one source of truth).
  private async buildPrintDocs(
    user: AuthenticatedUser,
    ids: readonly string[],
  ): Promise<RawDocInput[]> {
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.svc.findById(user.accountId, id);
      docs.push({
        title: 'Mijoz qaytarishi',
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
      await this.svc.markPrinted(user.accountId, user.sub, id, true);
    }
    return docs;
  }
}
