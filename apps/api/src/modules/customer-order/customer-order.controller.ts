import {
  BadRequestException,
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
import { BulkSetStatusSchema, type OrderState, OrderStateSchema } from './customer-order.schema.js';
import { CustomerOrderService } from './customer-order.service.js';

@Controller('customer-orders')
@UseGuards(JwtAuthGuard)
export class CustomerOrderController {
  constructor(
    @Inject(CustomerOrderService) private readonly service: CustomerOrderService,
    @Inject(DocPdfService) private readonly docPdf: DocPdfService,
  ) {}

  @Get()
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.list(user.accountId, user.sub, q);
  }

  @Get(':id')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // H4 record-scope: 404 (not 403) when the order is out of the actor's scope.
    return this.service.findByIdScoped(user.accountId, user.sub, id);
  }

  /**
   * Returns the docs that reference this customer order — used by the
   * "Связанные документы" tab on the detail page (mirrors moysklad's
   * b-related-documents-diagram). The Demand and InvoiceOut tables
   * carry a nullable `customerOrderId` FK; we surface them here so the
   * UI can render the linked-cards diagram without an additional
   * round-trip per doc type.
   */
  @Get(':id/related')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  async related(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    // Gate by the parent order's record-scope before surfacing its linked docs.
    await this.service.assertReadable(user.accountId, user.sub, id);
    return this.service.findRelated(user.accountId, id);
  }

  /**
   * «Заказ поставщику с учётом доступно» basis — the order's product positions
   * reduced to the per-store stock shortfall (ordered − available). Used by
   * purchase-orders/new to pre-fill only what the store can't cover.
   */
  @Get(':id/supply-shortfall')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  async supplyShortfall(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.service.assertReadable(user.accountId, user.sub, id);
    return this.service.getSupplyShortfall(user.accountId, id);
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the document's 1-based
   * position in the default (newest-first) list plus its neighbour ids, so the
   * detail toolbar shows the REAL total and the arrows walk the whole set even
   * on a direct-URL visit (no list cache). Record-scope gated like the rest.
   */
  @Get(':id/position')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.service.assertReadable(user.accountId, user.sub, id);
    return this.service.findPosition(user.accountId, user.sub, id);
  }

  /**
   * Aggregate totals across the entire filter set (not just the
   * current page). Mirrors moysklad's "Σ Показать итоги" link at
   * the bottom-right of the list — the link triggers this and
   * displays the sums in a tooltip/strip.
   */
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  totals(@CurrentUser() user: AuthenticatedUser, @Query() q: Record<string, unknown>) {
    return this.service.aggregateTotals(user.accountId, user.sub, q);
  }

  @Post()
  @RequirePermission({ entity: 'customerorder', action: 'create' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.service.create(user.accountId, user.sub, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    return this.service.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'customerorder', action: 'approve' })
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    const parsed = OrderStateSchema.safeParse(target);
    if (!parsed.success) {
      // Unknown target is a client error (invalid input), not a server
      // fault — return 400 so callers see a proper validation failure
      // instead of an opaque 500.
      throw new BadRequestException(`Unknown state: ${target}`);
    }
    return this.service.transition(user.accountId, user.sub, id, parsed.data as OrderState);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'customerorder', action: 'delete' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'customerorder', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'customerorder', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'customerorder', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    const parsed = OrderStateSchema.safeParse(target);
    if (!parsed.success) {
      // Unknown target is a client error (invalid input), not a server
      // fault — return 400 so callers see a proper validation failure
      // instead of an opaque 500.
      throw new BadRequestException(`Unknown state: ${target}`);
    }
    const state = parsed.data as OrderState;
    return runBulk(ids, (id) => this.service.transition(user.accountId, user.sub, id, state));
  }

  /**
   * Bulk «Статус ▾» — apply one account-defined custom status (or clear it
   * with statusId:null) to all selected orders. Separate from bulk-transition
   * (FSM state); the service validates the target State once before fanning
   * out so an invalid id is a 400, not a per-row 500.
   */
  @Post('bulk-set-status')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  async bulkSetStatus(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, statusId } = BulkSetStatusSchema.parse(body);
    return this.service.bulkSetStatus(user.accountId, user.sub, ids, statusId);
  }

  /**
   * «Изменить ▸ Объединить» — combine the selected orders into one new draft and
   * return its id (the FE navigates to it). Creates a new order, so it needs
   * `create`; the source orders are left untouched.
   */
  @Post('merge')
  @RequirePermission({ entity: 'customerorder', action: 'create' })
  async merge(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return this.service.merge(user.accountId, user.sub, ids);
  }

  /**
   * «Изменить ▸ Зарезервировать» — reserve the full ordered quantity of every
   * selected order's stocked positions. Each id runs in its own
   * Serializable transaction (via the service), so a per-row failure surfaces
   * in the runBulk outcome instead of aborting the batch.
   */
  @Post('bulk-reserve')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  async bulkReserve(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.reserve(user.accountId, user.sub, id));
  }

  /**
   * «Изменить ▸ Очистить резерв» — release every selected order's reservation.
   */
  @Post('bulk-clear-reserve')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  async bulkClearReserve(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.service.clearReserve(user.accountId, user.sub, id));
  }

  /**
   * Mass-edit: apply the same owner / project / description patch to many
   * orders at once (moysklad's "Изменить" → field-picker modal). Each
   * id runs its own update, so per-row validation errors don't abort
   * the batch — the per-id outcomes come back in the same shape as
   * bulk-delete / bulk-transition.
   */
  @Post('mass-edit')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MassEditBaseSchema.parse(body);
    const { ids, ...patch } = parsed;
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.service.massEditApply(user.accountId, user.sub, id, patch));
  }

  @Post('bulk-mark-printed')
  @RequirePermission({ entity: 'customerorder', action: 'update' })
  async bulkMarkPrinted(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, printed } = BulkMarkPrintedSchema.parse(body);
    return runBulk(ids, (id) => this.service.markPrinted(user.accountId, user.sub, id, printed));
  }

  /**
   * Bulk-print: render each selected order as a full positions-table
   * invoice and return them merged into a single downloadable PDF.
   *
   * Rendering goes through DocPdfService: the account's custom
   * PrintTemplate (if any) or the built-in default is rendered with eta,
   * then rasterised by headless Chrome (Unicode-correct, real CSS layout).
   * Chrome-unavailable environments transparently fall back to the pdf-lib
   * stub renderer.
   *
   * Also marks each row as `printed=true` so the list filter reflects the
   * operator's state, mirroring moysklad's "Печать" workflow.
   */
  @Post('bulk-print')
  @RequirePermission({ entity: 'customerorder', action: 'view' })
  @Header('Content-Type', 'application/pdf')
  async bulkPrint(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const { ids, templateId } = BulkPrintSchema.parse(body);
    const docs: RawDocInput[] = [];
    for (const id of ids) {
      // Record-scope: skip-hide out-of-scope orders (404) so bulk-print can't
      // exfiltrate orders the actor can't see.
      const order = await this.service.findByIdScoped(user.accountId, user.sub, id);
      docs.push({
        title: 'Mijoz buyurtmasi',
        number: order.name,
        date: order.moment,
        sumMinor: order.sumMinor?.toString() ?? null,
        currency: order.currency ?? 'UZS',
        description: order.description ?? null,
        counterpartyName: order.agent?.name ?? null,
        organizationName: order.organization?.name ?? null,
        organizationPhone: order.organization?.phone ?? null,
        positions: order.positions.map((p) => ({
          name: p.product?.name ?? '—',
          unit: p.product?.uom ?? '',
          qty: String(p.quantity),
          priceMinor: p.priceMinor,
          sumMinor: computeLineSumMinor(p.priceMinor, String(p.quantity), String(p.discount)),
        })),
      });
      // Mirror moysklad: printing flips the printed flag.
      await this.service.markPrinted(user.accountId, user.sub, id, true);
    }
    const merged = await this.docPdf.renderBulk(user.accountId, 'customerorder', docs, templateId);
    reply
      .header('Content-Disposition', `attachment; filename="customer-orders-${ids.length}.pdf"`)
      .send(merged);
  }
}
