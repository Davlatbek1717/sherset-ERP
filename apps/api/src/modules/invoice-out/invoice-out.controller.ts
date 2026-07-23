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
import { InvoiceOutService } from './invoice-out.service.js';

@Controller('invoices-out')
@UseGuards(JwtAuthGuard)
export class InvoiceOutController {
  constructor(
    @Inject(InvoiceOutService) private readonly invoice: InvoiceOutService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  /**
   * moysklad «Печать» / «Отправить» menus — the account's own «Счёт покупателю»
   * print forms (PDF), listed by name. View-permission (not the settings gate);
   * the /print-templates CRUD stays admin-only. Declared before `:id` so
   * 'print-forms' isn't captured as a record id. Mirror of supply /print-forms.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'invoiceout', 'pdf');
  }

  @Get()
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.invoice.list(user.accountId, query);
  }

  // moysklad list footer «Итого» — totals across the whole filtered set.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.invoice.aggregateTotals(user.accountId, query);
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the invoice's 1-based
   * position in the default newest-first list + neighbour ids, so the detail
   * toolbar shows the REAL total and the arrows walk the whole set even on a
   * direct-URL visit. Declared before `:id` (specificity). Mirrors invoice-in.
   */
  @Get(':id/position')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.findPosition(user.accountId, id);
  }

  @Get(':id')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'invoiceout', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.invoice.create(user.accountId, user.sub, body);
  }

  @Post('from-customer-order/:customerOrderId')
  @RequirePermission({ entity: 'invoiceout', action: 'create' })
  async createFromCustomerOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerOrderId') customerOrderId: string,
    @Body() body: unknown,
  ) {
    return this.invoice.createFromCustomerOrder(user.accountId, user.sub, customerOrderId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'invoiceout', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.invoice.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'invoiceout', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.invoice.transition(user.accountId, user.sub, id, target);
  }

  /**
   * moysklad «Статус» — the header pill assigns (or clears) an account custom
   * status. Applied immediately (moysklad parity). Mirror of supply :id/status.
   */
  @Patch(':id/status')
  @RequirePermission({ entity: 'invoiceout', action: 'update' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { statusId } = z.object({ statusId: z.string().uuid().nullable() }).parse(body);
    return this.invoice.setStatus(user.accountId, user.sub, id, statusId);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'invoiceout', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'invoiceout', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'invoiceout', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'invoiceout', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.transition(user.accountId, user.sub, id, target));
  }

  /**
   * moysklad «Изменить → Объединить» — combine the selected invoices into one
   * new draft and return its id (the list then opens it). Mirror of
   * purchase-orders /merge.
   */
  @Post('merge')
  @RequirePermission({ entity: 'invoiceout', action: 'create' })
  async merge(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return this.invoice.merge(user.accountId, user.sub, ids);
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'invoiceout', action: 'update' })
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
    return runBulk(ids, (id) => this.invoice.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'invoiceout', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.markPrinted(user.accountId, user.sub, id, printed));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs = await this.buildPrintDocs(user, ids);
    const merged = await this.docPdf.renderBulk(user.accountId, 'invoiceout', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="invoices-out-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad «Печать ▸ Комплект…» — bundle several «Счёт покупателю» print forms
   * into a single combined PDF for the selected invoices. `templateIds` may
   * contain null for the standard built-in form. Mirror of supply /kit-print.
   */
  @Post('kit-print')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
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
    const merged = await this.docPdf.renderKit(user.accountId, 'invoiceout', docs, templateIds);
    reply
      .header('Content-Disposition', `attachment; filename="invoices-out-kit-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad «Отправить» — render THIS invoice through a print form, store the
   * PDF as an attachment and return its id so the email composer can send the
   * document as a real attachment. `templateId` null/absent → the standard form.
   * Mirror of supply :id/print-attachment.
   */
  @Post(':id/print-attachment')
  @RequirePermission({ entity: 'invoiceout', action: 'view' })
  async printAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { templateId } = z.object({ templateId: z.string().uuid().optional() }).parse(body ?? {});
    const docs = await this.buildPrintDocs(user, [id]);
    const pdf = await this.docPdf.renderBulk(user.accountId, 'invoiceout', docs, templateId);
    const filename = `Счет ${docs[0]?.number ?? ''}.pdf`.trim();
    const att = await this.attachments.createFromBuffer(user.accountId, user.sub, {
      entity: 'InvoiceOut',
      entityId: id,
      filename,
      mime: 'application/pdf',
      buffer: pdf,
    });
    return { attachmentId: att.id, filename: att.filename };
  }

  /**
   * Load each selected invoice into the print-render shape and flip its printed
   * flag. Shared by {@link bulkPrint}, {@link kitPrint} and
   * {@link printAttachment} (one source of truth — mirror supply.buildPrintDocs).
   */
  private async buildPrintDocs(
    user: AuthenticatedUser,
    ids: readonly string[],
  ): Promise<RawDocInput[]> {
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const doc = await this.invoice.findById(user.accountId, id);
      docs.push({
        title: 'Schyot-faktura',
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
      await this.invoice.markPrinted(user.accountId, user.sub, id, true);
    }
    return docs;
  }
}
