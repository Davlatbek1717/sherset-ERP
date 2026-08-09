import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { OnlineOrderService } from './online-order.service.js';

@Controller('online-orders')
@UseGuards(JwtAuthGuard)
export class OnlineOrderController {
  constructor(@Inject(OnlineOrderService) private readonly svc: OnlineOrderService) {}

  @Get()
  @RequirePermission({ entity: 'onlineorder', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get('counts')
  @RequirePermission({ entity: 'onlineorder', action: 'view' })
  async counts(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.counts(user.accountId);
  }

  @Get(':id')
  @RequirePermission({ entity: 'onlineorder', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'onlineorder', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  /**
   * Kanalning kiruvchi webhook sirini yaratadi/yangilaydi. Ochiq matn javobda
   * **bir marta** qaytadi — qayta ko'rsatish yo'li ataylab yo'q (Payme/Click
   * creds bilan bir xil siyosat). Sir integratsiya sozlamasi, shuning uchun
   * ruxsat `settings:update` (payment-gateway config naqshi).
   */
  @Post('channels/:channelId/webhook-secret')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async rotateWebhookSecret(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
  ) {
    return this.svc.rotateWebhookSecret(user.accountId, channelId);
  }

  @Post(':id/accept')
  @RequirePermission({ entity: 'onlineorder', action: 'create' })
  async accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.accept(user.accountId, id);
  }

  @Post(':id/reject')
  @RequirePermission({ entity: 'onlineorder', action: 'create' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.reject(user.accountId, id, body);
  }

  @Post(':id/convert')
  @RequirePermission({ entity: 'onlineorder', action: 'create' })
  async convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.convertToCustomerOrder(user.accountId, id, body);
  }
}
