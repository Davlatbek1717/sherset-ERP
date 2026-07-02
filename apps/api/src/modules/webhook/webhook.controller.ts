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
import { WebhookService } from './webhook.service.js';

@Controller('webhook')
@UseGuards(JwtAuthGuard)
export class WebhookController {
  constructor(@Inject(WebhookService) private readonly svc: WebhookService) {}

  @Get()
  @RequirePermission({ entity: 'settings', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.list(user.accountId, query);
  }

  @Get(':id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findById(user.accountId, id);
  }

  @Post()
  @RequirePermission({ entity: 'settings', action: 'create' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.create(user.accountId, body);
  }

  @Patch(':id')
  @RequirePermission({ entity: 'settings', action: 'update' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.svc.update(user.accountId, id, body);
  }

  @Delete(':id')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.delete(user.accountId, id);
  }

  /** Per-webhook delivery history (admin UI). */
  @Get(':id/deliveries')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.svc.listDeliveries(user.accountId, id, query);
  }

  /** Manually retry a failed/dead delivery. */
  @Post(':id/deliveries/:deliveryId/retry')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async retryDelivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.svc.retryDelivery(user.accountId, id, deliveryId);
  }
}
