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
import { PaymentOutService } from './payment-out.service.js';

@Controller('payments-out')
@UseGuards(JwtAuthGuard)
export class PaymentOutController {
  constructor(@Inject(PaymentOutService) private readonly payment: PaymentOutService) {}

  @Get()
  @RequirePermission({ entity: 'paymentout', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.payment.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'paymentout', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payment.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.payment.create(user.accountId, user.sub, body);
  }

  @Post('from-invoice-in/:invoiceInId')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async createFromInvoiceIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invoiceInId') invoiceInId: string,
    @Body() body: unknown,
  ) {
    return this.payment.createFromInvoiceIn(user.accountId, user.sub, invoiceInId, body);
  }

  @Post('from-purchase-order/:purchaseOrderId')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async createFromPurchaseOrderAdvance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('purchaseOrderId') purchaseOrderId: string,
    @Body() body: unknown,
  ) {
    return this.payment.createFromPurchaseOrderAdvance(
      user.accountId,
      user.sub,
      purchaseOrderId,
      body,
    );
  }

  @Patch(':id')
  @RequirePermission({ entity: 'paymentout', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.payment.update(user.accountId, user.sub, id, body);
  }

  @Post(':id/transitions/:target')
  @RequirePermission({ entity: 'paymentout', action: 'approve' })
  async transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('target') target: string,
  ) {
    return this.payment.transition(user.accountId, user.sub, id, target);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'paymentout', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payment.delete(user.accountId, user.sub, id);
  }

  @Post(':id/clone')
  @RequirePermission({ entity: 'paymentout', action: 'create' })
  async clone(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payment.clone(user.accountId, user.sub, id);
  }

  @Post('bulk-delete')
  @RequirePermission({ entity: 'paymentout', action: 'delete' })
  async bulkDelete(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids } = BulkIdsSchema.parse(body);
    return runBulk(ids, (id) => this.payment.delete(user.accountId, user.sub, id));
  }

  @Post('bulk-transition')
  @RequirePermission({ entity: 'paymentout', action: 'approve' })
  async bulkTransition(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, target } = BulkTransitionSchema.parse(body);
    return runBulk(ids, (id) => this.payment.transition(user.accountId, user.sub, id, target));
  }

  @Post('mass-edit')
  @RequirePermission({ entity: 'paymentout', action: 'update' })
  async massEdit(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { ids, ...patch } = MassEditBaseSchema.parse(body);
    assertPatchHasAtLeastOneField(patch, ['ownerId', 'projectId', 'description']);
    return runBulk(ids, (id) => this.payment.massEditApply(user.accountId, user.sub, id, patch));
  }
}
