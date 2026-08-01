import {
  Body,
  Controller,
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
import { RetailSaleService } from './retail-sale.service.js';

@Controller('retail-sales')
@UseGuards(JwtAuthGuard)
export class RetailSaleController {
  constructor(@Inject(RetailSaleService) private readonly sales: RetailSaleService) {}

  @Get()
  @RequirePermission({ entity: 'retailsale', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.sales.list(user.accountId, query);
  }

  /**
   * Z-report for a session. Must be declared before :id to avoid conflict.
   * Usage: GET /retail-sales/z-report?sessionId=<uuid>
   */
  @Get('z-report')
  @RequirePermission({ entity: 'retailsale', action: 'view' })
  async zReport(@CurrentUser() user: AuthenticatedUser, @Query('sessionId') sessionId: string) {
    return this.sales.zReport(user.accountId, sessionId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'retailsale', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sales.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'retailsale', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.sales.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'retailsale', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sales.update(user.accountId, id, body);
  }

  @Post(':id/send-to-picking')
  @RequirePermission({ entity: 'retailsale', action: 'update' })
  async sendToPicking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sales.sendToPicking(user.accountId, id, user.sub, user.name);
  }

  @Post(':id/post')
  @RequirePermission({ entity: 'retailsale', action: 'approve' })
  async post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sales.post(user.accountId, user.sub, id, body);
  }

  @Post(':id/cancel')
  @RequirePermission({ entity: 'retailsale', action: 'approve' })
  async cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sales.cancel(user.accountId, id);
  }

  @Post(':id/refund')
  @RequirePermission({ entity: 'retailsale', action: 'approve' })
  async refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sales.refund(user.accountId, user.sub, id, body);
  }

  /**
   * F2 — «Отправил кладовщику» on a refund receipt: flags the receipt and
   * notifies the warehouse keeper (store's Владелец-сотрудник; fallback:
   * every other active employee) via 🔔 + SSE (FE adds the sound).
   */
  @Post(':id/send-to-warehouse')
  @RequirePermission({ entity: 'retailsale', action: 'update' })
  async sendToWarehouse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.sales.sendToWarehouse(user.accountId, user.sub, id);
  }
}
