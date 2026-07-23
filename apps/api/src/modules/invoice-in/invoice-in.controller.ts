import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { BulkIdsSchema, BulkTransitionSchema, runBulk } from '../shared/bulk.js';
import { MassEditBaseSchema, assertPatchHasAtLeastOneField } from '../shared/mass-edit.js';
import { InvoiceInService } from './invoice-in.service.js';

@Controller('invoices-in')
@UseGuards(JwtAuthGuard)
export class InvoiceInController {
  constructor(@Inject(InvoiceInService) private readonly invoice: InvoiceInService) {}

  @Get()
  @RequirePermission({ entity: 'invoicein', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.invoice.list(user.accountId, query);
  }

  // Declared BEFORE `:id` so «aggregate» is not captured as a document id.
  @Get('aggregate/totals')
  @RequirePermission({ entity: 'invoicein', action: 'view' })
  aggregateTotals(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.invoice.aggregateTotals(user.accountId, query);
  }

  /**
   * moysklad header «N из ВСЕГО ‹ ›» record navigator — the invoice's 1-based
   * position in the default newest-first list + neighbour ids, so the detail
   * toolbar shows the REAL total and the arrows walk the whole set even on a
   * direct-URL visit. Declared before `:id` (specificity). Mirrors purchase-order.
   */
  @Get(':id/position')
  @RequirePermission({ entity: 'invoicein', action: 'view' })
  async position(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.findPosition(user.accountId, id);
  }

  @Get(':id')
  @RequirePermission({ entity: 'invoicein', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'invoicein', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.invoice.create(user.accountId, user.sub, body);
  }

  @Post('from-purchase-order/:purchaseOrderId')
  @RequirePermission({ entity: 'invoicein', action: 'create' })
  async createFromPurchaseOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('purchaseOrderId') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    return this.invoice.createFromPurchaseOrder(user.accountId, user.sub, purchaseOrderId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'invoicein', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.invoice.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'invoicein', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.invoice.transition(user.accountId, user.sub, id, target);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'invoicein', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'invoicein', action: 'create' })
  clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoice.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'invoicein', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'invoicein', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.transition(user.accountId, user.sub, id, target));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'invoicein', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, ...patch } = MassEditBaseSchema.parse(body);
    assertPatchHasAtLeastOneField(patch, [
      'ownerId',
      'projectId',
      'description',
      'groupId',
      'shared',
    ]);
    return runBulk(ids, (id) => this.invoice.massEditApply(user.accountId, user.sub, id, patch));
  }

  /**
   * moysklad-parity «Создать → Исходящие платежи» bulk action — one draft
   * PaymentOut per selected invoice, pre-allocated against its unpaid remainder.
   */
  @Post('bulk-create-payment-out')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async bulkCreatePaymentOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.createPaymentOutFor(user.accountId, user.sub, id));
  }

  /**
   * moysklad-parity «Создать → Расходные ордера» bulk action — one draft
   * CashOut per selected invoice covering its remaining balance.
   */
  @Post('bulk-create-cash-out')
  @RequirePermission({ entity: 'cashout', action: 'create' })
  async bulkCreateCashOut(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.invoice.createCashOutFor(user.accountId, user.sub, id));
  }
}
