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
import { SupplyService } from './supply.service.js';

@Controller('supplies')
@UseGuards(JwtAuthGuard)
export class SupplyController {
  constructor(
    @Inject(SupplyService) private readonly supply: SupplyService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  /**
   * moysklad «Печать» / «Отправить» menus — the account's own «Приёмка» print
   * forms (PDF), listed by name. View-permission (not the settings gate) so any
   * user who can see receipts can list the forms; the /print-templates CRUD stays
   * admin-only. Declared before `:id` so 'print-forms' isn't captured as a record
   * id. Mirror of purchase-order /print-forms.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'supply', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'supply', 'pdf');
  }

  @Get()
  @RequirePermission({ entity: 'supply', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.supply.list(user.accountId, query);
  }

  /**
   * All-pages «Итого» footer totals (Сумма + Оплачено) over the active filter
   * set. Declared before `:id` so 'aggregate' isn't captured as a record id
   * (mirror customer-order / purchase-order).
   */
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'supply', action: 'view' })
  async aggregateTotals(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.supply.aggregateTotals(user.accountId, query);
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

  /**
   * «Статус» — set (or clear, `statusId: null`) the receipt's account-defined
   * custom status. Applied immediately (moysklad parity). Mirror of
   * purchase-order PATCH :id/status.
   */
  @Patch(':id/status')
  @RequirePermission({ entity: 'supply', action: 'update' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { statusId } = z.object({ statusId: z.string().uuid().nullable() }).parse(body);
    return this.supply.setStatus(user.accountId, user.sub, id, statusId);
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

  // «Объединить» — merge ≥2 draft receipts into a fresh draft (mirror PO).
  @Post('merge')
  @RequirePermission({ entity: 'supply', action: 'create' })
  async merge(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return this.supply.merge(user.accountId, user.sub, ids);
  }

  // «Статус ▾» toolbar menu — bulk-set (or clear) the custom status on the
  // selected receipts. Validates the target State once before fanning out.
  @Post('bulk-set-status')
  @RequirePermission({ entity: 'supply', action: 'update' })
  async bulkSetStatus(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, statusId } = BulkIdsSchema.extend({
      statusId: z.string().uuid().nullable(),
    }).parse(body);
    return this.supply.bulkSetStatus(user.accountId, user.sub, ids, statusId);
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'supply', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.supply.transition(user.accountId, user.sub, id, target));
  }

  /**
   * moysklad-parity «Создать → Исходящие платежи» bulk action — creates
   * one PaymentOut per selected supply with the remaining unpaid balance
   * (mirror of purchase-orders/bulk-create-payment-out).
   */
  @Post('bulk-create-payment-out')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async bulkCreatePaymentOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.supply.createPaymentOutFor(user.accountId, user.sub, id));
  }

  /**
   * moysklad-parity «Создать → Расходные ордера» bulk action — creates
   * one CashOut per selected supply with the remaining unpaid balance.
   */
  @Post('bulk-create-cash-out')
  @RequirePermission({ entity: 'cashout', action: 'create' })
  async bulkCreateCashOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.supply.createCashOutFor(user.accountId, user.sub, id));
  }

  /**
   * moysklad-parity «Создать → Возвраты поставщикам» bulk action — one
   * PurchaseReturn draft per selected supply (full still-returnable
   * quantities; posted-only + cumulative cap enforced by the PR service).
   */
  @Post('bulk-create-purchase-return')
  @RequirePermission({ entity: 'purchasereturn', action: 'create' })
  async bulkCreatePurchaseReturn(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.supply.createPurchaseReturnFor(user.accountId, user.sub, id));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'supply', action: 'update' })
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
    const docs = await this.buildPrintDocs(user, ids);
    const merged = await this.docPdf.renderBulk(user.accountId, 'supply', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="supplies-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad «Печать ▸ Комплект…» — bundle several «Приёмка» print forms into a
   * single combined PDF for the selected receipts. `templateIds` may contain null
   * for the standard built-in form. Mirror of purchase-order /kit-print.
   */
  @Post('kit-print')
  @RequirePermission({ entity: 'supply', action: 'view' })
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
    const merged = await this.docPdf.renderKit(user.accountId, 'supply', docs, templateIds);
    reply
      .header('Content-Disposition', `attachment; filename="supplies-kit-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad «Отправить» — render THIS receipt through a print form, store the
   * PDF as an attachment and return its id so the email composer can send the
   * document as a real attachment. The «Отправить» menu lists the SAME forms as
   * «Печать»; `templateId` null/absent → the standard «Приёмка» form. Returns
   * `{ attachmentId, filename }`; the FE then opens the email dialog with it
   * pre-attached. Mirror of purchase-order :id/print-attachment.
   */
  @Post(':id/print-attachment')
  @RequirePermission({ entity: 'supply', action: 'view' })
  async printAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { templateId } = z.object({ templateId: z.string().uuid().optional() }).parse(body ?? {});
    const docs = await this.buildPrintDocs(user, [id]);
    const pdf = await this.docPdf.renderBulk(user.accountId, 'supply', docs, templateId);
    const filename = `Приёмка ${docs[0]?.number ?? ''}.pdf`.trim();
    const att = await this.attachments.createFromBuffer(user.accountId, user.sub, {
      entity: 'Supply',
      entityId: id,
      filename,
      mime: 'application/pdf',
      buffer: pdf,
    });
    return { attachmentId: att.id, filename: att.filename };
  }

  /**
   * Load each selected receipt into the print-render shape and flip its printed
   * flag. Shared by {@link bulkPrint} and {@link printAttachment} (one source of
   * truth — mirror purchase-order.buildPrintDocs).
   */
  private async buildPrintDocs(
    user: AuthenticatedUser,
    ids: readonly string[],
  ): Promise<RawDocInput[]> {
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
    return docs;
  }
}
