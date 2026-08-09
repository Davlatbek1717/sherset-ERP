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
import { HtmlPdfService } from '../print-template/html-pdf.service.js';
import {
  type ListReportColumnDef,
  REPORT_CURRENCY_LABEL,
  buildListReportHtml,
  reportDateTime,
  reportMoney,
} from '../print-template/list-report-html.util.js';
import type { RawDocInput } from '../print-template/print-render.util.js';
import { computeLineSumMinor } from '../print-template/print-render.util.js';
import { PrintTemplateService } from '../print-template/print-template.service.js';
import { BulkIdsSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { BulkMarkPrintedSchema } from '../shared/mass-print.js';
import { PurchaseOrderService } from './purchase-order.service.js';

// ── «Печать → Список заказов» PDF report ────────────────────────────────────
interface PoReportRow {
  name: string;
  applicable: boolean;
  moment: Date;
  sumMinor: bigint;
  invoicedSumMinor: bigint;
  payedSumMinor: bigint;
  receivedSumMinor: bigint;
  currency: string;
  agent: { name: string } | null;
  organization: { name: string } | null;
}

// Column set + order = moysklad's report-PurchaseOrder (live-grounded 2026-07-08).
const PO_REPORT_COLUMNS: ListReportColumnDef<PoReportRow>[] = [
  { header: '№', value: (r) => r.name },
  { header: 'Пров.', value: (r) => (r.applicable ? 'Да' : '') },
  { header: 'Время', value: (r) => reportDateTime(r.moment) },
  { header: 'Контрагент', value: (r) => r.agent?.name ?? '' },
  { header: 'Организация', value: (r) => r.organization?.name ?? '' },
  { header: 'Сумма', numeric: true, value: (r) => reportMoney(r.sumMinor) },
  { header: 'Валюта', value: (r) => REPORT_CURRENCY_LABEL[r.currency] ?? r.currency },
  { header: 'Выставлено счетов', numeric: true, value: (r) => reportMoney(r.invoicedSumMinor) },
  { header: 'Оплачено', numeric: true, value: (r) => reportMoney(r.payedSumMinor) },
  { header: 'Принято', numeric: true, value: (r) => reportMoney(r.receivedSumMinor) },
];

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrderController {
  constructor(
    @Inject(PurchaseOrderService) private readonly service: PurchaseOrderService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
    @Inject(HtmlPdfService) private readonly htmlPdf: HtmlPdfService,
    @Inject(PrintTemplateService) private readonly printTemplates: PrintTemplateService,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

  /**
   * Doc-scoped list of the account's printable «Заказ поставщику» templates,
   * for the list/detail «Печать» menu. Gated on purchaseorder:view (NOT
   * settings) so any user who can see purchase orders can list the forms —
   * the settings-gated /print-templates CRUD stays admin-only.
   */
  @Get('print-forms')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async printForms(@CurrentUser() user: AuthenticatedUser) {
    return this.printTemplates.listPrintable(user.accountId, 'purchaseorder', 'pdf');
  }

  @Get()
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.service.list(user.accountId, query);
  }

  /**
   * Aggregate totals across the entire filter set (not just the current
   * page). Mirrors moysklad's «Показать итоги» link at the bottom of the
   * list — sums every money column over all matching rows. Declared before
   * `:id` so the two-segment path isn't shadowed by the param route.
   */
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.aggregateTotals(user.accountId, q);
  }

  /**
   * moysklad «Печать → Список заказов» — the WHOLE (filtered) list as a PDF
   * report, served INLINE so the browser opens it in its native PDF viewer
   * (page thumbnails + navigation + print/download), 1:1 with moysklad's
   * report-PurchaseOrder.pdf. Declared before `:id` so the static path isn't
   * shadowed. Auth: `window.open` sends no bearer header, so since Faza Q13
   * this route is authenticated by the HttpOnly `ms_mt` media cookie (a
   * same-site top-level navigation carries it) — NOT by `?access_token=`,
   * which used to put a live JWT into every access-log line (AUTH-04).
   */
  @Get('list-report')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async listReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, unknown>,
    @Res() reply: FastifyReply,
  ) {
    // Faza Q13 removed `?access_token=` from the FE URL; the strip stays as a
    // cheap guard so a hand-appended param can never reach the filter parser.
    const { access_token: _at, ...filter } = q;
    const rows = await this.service.listAllForReport(user.accountId, filter);
    const now = new Date();
    const html = buildListReportHtml<PoReportRow>({
      title: 'Заказы поставщикам',
      createdByLabel: 'Создал',
      userName: user.name,
      userEmail: user.email,
      generatedAt: reportDateTime(now, true),
      columns: PO_REPORT_COLUMNS,
      rows: rows as unknown as PoReportRow[],
    });
    const pdf = await this.htmlPdf.renderHtmlToPdf(html, {
      pageSize: 'A4',
      landscape: true,
      marginTop: 10,
      marginRight: 10,
      marginBottom: 12,
      marginLeft: 10,
    });
    const stamp = reportDateTime(now, true).replace(/[.: ]/g, '-');
    reply
      .header('Content-Disposition', `inline; filename="report-PurchaseOrder-${stamp}.pdf"`)
      .send(pdf);
  }

  @Get(':id')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findById(user.accountId, id);
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the order's 1-based
   * position in the default newest-first list + its neighbour ids, so the detail
   * toolbar shows the REAL total and the arrows walk the whole set even on a
   * direct-URL visit. Mirrors customer-orders/:id/position.
   */
  @Get(':id/position')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findPosition(user.accountId, id);
  }

  /**
   * moysklad «Связанные документы» — documents created from this PO (Приёмки /
   * Счета поставщиков / Исходящие платежи / Возвраты). Drives the detail page's
   * related-docs diagram. Declared after the static routes so `:id` doesn't
   * shadow them (mirror customer-orders).
   */
  @Get(':id/related')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async related(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.findRelated(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'purchaseorder', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'purchaseorder', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'purchaseorder', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.service.transition(user.accountId, user.sub, id, target);
  }

  /**
   * moysklad «Статус» — assign the account's custom status (or clear it). Applied
   * immediately, even on a posted order (status is orthogonal to «Проведено»);
   * see PurchaseOrderService.setStatus. Gated on `update` (it's a field edit, not
   * an FSM approval).
   */
  @Patch(':id/status')
  @RequirePermission({ entity: 'purchaseorder', action: 'update' })
  async setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { statusId } = z.object({ statusId: z.string().uuid().nullable() }).parse(body);
    return this.service.setStatus(user.accountId, user.sub, id, statusId);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'purchaseorder', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'purchaseorder', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.clone(user.accountId, user.sub, id);
  }

  // moysklad «Создать документ → Расходный ордер» — a РКО for the PO's unpaid
  // balance (single-doc mirror of bulk-create-cash-out; logic in createCashOutFor).
  @Post(':id/create-cash-out')
  @RequirePermission({ entity: 'cashout', action: 'create' })
  createCashOut(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.createCashOutFor(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'purchaseorder', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'purchaseorder', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.service.transition(user.accountId, user.sub, id, target));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'purchaseorder', action: 'update' })
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
    return runBulk(ids, (id) => this.service.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-print')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    // Optional templateId: when the user picks a named print form from the
    // «Печать» menu, render through that template; otherwise the account
    // default / built-in (resolveTemplate handles the fallback).
    const { ids, templateId } = BulkIdsSchema.extend({
      templateId: z.string().uuid().optional(),
    }).parse(body);
    const docs = await this.buildPrintDocs(user, ids);
    const merged = await this.docPdf.renderBulk(user.accountId, 'purchaseorder', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="purchase-orders-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad-parity «Печать ▸ Комплект…» — render the selected orders through
   * SEVERAL print forms at once and download one combined PDF (the "document
   * set" print). Live-grounded 2026-06-18 on online.moysklad.uz: the «Комплект»
   * dialog lists the account's print forms as checkboxes; «Распечатать»
   * concatenates the chosen forms into a single file.
   *
   * `templateIds` carries the picked forms — a uuid for a custom form, or null
   * for the standard/built-in «Заказ поставщику» form. Same view-permission and
   * printed-flag side effect as bulk-print.
   */
  @Post('kit-print')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
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
    const merged = await this.docPdf.renderKit(user.accountId, 'purchaseorder', docs, templateIds);
    reply
      .header('Content-Disposition', `attachment; filename="purchase-orders-kit-${ids.length}.pdf"`)
      .send(merged);
  }

  /**
   * moysklad «Отправить» — render THIS order through a print form, store the PDF
   * as an attachment and return its id, so the email composer can send the
   * document as a real attachment. The «Отправить» menu lists the SAME forms as
   * «Печать»; `templateId` null/absent → the standard «Заказ поставщику» form.
   * Returns `{ attachmentId, filename }`; the FE then opens the email dialog with
   * it pre-attached. View-permission + the printed-flag side effect of bulk-print.
   */
  @Post(':id/print-attachment')
  @RequirePermission({ entity: 'purchaseorder', action: 'view' })
  async printAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { templateId } = z.object({ templateId: z.string().uuid().optional() }).parse(body ?? {});
    const docs = await this.buildPrintDocs(user, [id]);
    const pdf = await this.docPdf.renderBulk(user.accountId, 'purchaseorder', docs, templateId);
    const filename = `Заказ поставщику ${docs[0]?.number ?? ''}.pdf`.trim();
    const att = await this.attachments.createFromBuffer(user.accountId, user.sub, {
      entity: 'PurchaseOrder',
      entityId: id,
      filename,
      mime: 'application/pdf',
      buffer: pdf,
    });
    return { attachmentId: att.id, filename: att.filename };
  }

  /**
   * Load each selected order into the print-render shape and flip its
   * printed flag. Shared by {@link bulkPrint} and {@link kitPrint}.
   */
  private async buildPrintDocs(
    user: AuthenticatedUser,
    ids: readonly string[],
  ): Promise<RawDocInput[]> {
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      const order = await this.service.findById(user.accountId, id);
      docs.push({
        title: "Ta'minlovchi buyurtmasi",
        number: order.name,
        date: order.moment,
        sumMinor: order.sumMinor?.toString() ?? null,
        currency: order.currency ?? 'UZS',
        description: order.description ?? null,
        counterpartyName: order.agent?.name ?? null,
        organizationName: order.organization?.name ?? null,
        positions: order.positions.map((p) => ({
          name: p.product?.name ?? '—',
          unit: p.product?.uom ?? '',
          qty: String(p.quantity),
          priceMinor: p.priceMinor,
          sumMinor: computeLineSumMinor(p.priceMinor, String(p.quantity), String(p.discount)),
        })),
      });
      await this.service.markPrinted(user.accountId, user.sub, id, true);
    }
    return docs;
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'purchaseorder', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.service.markPrinted(user.accountId, user.sub, id, printed));
  }

  /**
   * moysklad-parity «Копировать» bulk action — clones each selected
   * PO into a new draft. Returns the per-id outcome via runBulk so the
   * UI can surface partial successes.
   */
  @Post('bulk-clone')
  @RequirePermission({ entity: 'purchaseorder', action: 'create' })
  async bulkClone(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.clone(user.accountId, user.sub, id));
  }

  /**
   * moysklad-parity «Изменить ▸ Объединить» — combine the selected orders into
   * one new draft purchase order and return its id (the FE navigates to it).
   * Grounded live 2026-06-18 on climart. Needs create permission (it creates a
   * new order); the source orders are untouched.
   */
  @Post('merge')
  @RequirePermission({ entity: 'purchaseorder', action: 'create' })
  async merge(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return this.service.merge(user.accountId, user.sub, ids);
  }

  /**
   * moysklad-parity «Поставить в ожидание» / «Снять ожидание» bulk
   * actions — flip the manual `waiting` flag on every selected PO.
   */
  @Post('bulk-set-waiting')
  @RequirePermission({ entity: 'purchaseorder', action: 'update' })
  async bulkSetWaiting(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, waiting } = z
      .object({ ids: z.array(z.string().uuid()).min(1), waiting: z.boolean() })
      .parse(body);
    return runBulk(ids, (id) => this.service.setWaiting(user.accountId, user.sub, id, waiting));
  }

  /**
   * moysklad-parity «Создать → Исходящие платежи» bulk action — creates
   * one PaymentOut per selected PO with the remaining unpaid balance.
   */
  @Post('bulk-create-payment-out')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async bulkCreatePaymentOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.createPaymentOutFor(user.accountId, user.sub, id));
  }

  /**
   * moysklad-parity «Создать → Расходные ордера» bulk action — creates
   * one CashOut per selected PO with the remaining unpaid balance.
   */
  @Post('bulk-create-cash-out')
  @RequirePermission({ entity: 'cashout', action: 'create' })
  async bulkCreateCashOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.createCashOutFor(user.accountId, user.sub, id));
  }
}
