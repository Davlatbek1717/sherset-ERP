import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.schema.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequirePermission } from '../../permissions/require-permission.decorator.js';
import { MarketplaceService } from './marketplace.service.js';

@Controller('marketplace')
@UseGuards(JwtAuthGuard)
export class MarketplaceController {
  constructor(@Inject(MarketplaceService) private readonly svc: MarketplaceService) {}

  @Get('configs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listConfigs(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.listConfigs(user.accountId);
  }

  @Put('configs')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async saveConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.saveConfig(user.accountId, body);
  }

  @Delete('configs/:marketplace')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('marketplace') marketplace: string,
  ) {
    return this.svc.deleteConfig(user.accountId, marketplace);
  }

  @Get('orders')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.listOrders(user.accountId, query);
  }

  @Get('orders/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findOrder(user.accountId, id);
  }

  @Post('orders')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async recordOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.recordOrder(user.accountId, body);
  }

  @Post('orders/:id/link')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async linkInternal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { internalOrderId?: string },
  ) {
    if (!body.internalOrderId) throw new Error('internalOrderId majburiy');
    return this.svc.linkInternalOrder(user.accountId, id, body.internalOrderId);
  }
}
