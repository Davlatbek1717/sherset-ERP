import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import type { ClickCallbackParams } from './click.protocol.js';
import type { PaymeRpcRequest } from './payme.protocol.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

/** Authenticated admin endpoints (config + tx browse). */
@Controller('payment-gateways')
@UseGuards(JwtAuthGuard)
export class PaymentGatewayController {
  constructor(@Inject(PaymentGatewayService) private readonly svc: PaymentGatewayService) {}

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

  @Delete('configs/:provider')
  @RequirePermission({ entity: 'settings', action: 'delete' })
  async deleteConfig(@CurrentUser() user: AuthenticatedUser, @Param('provider') provider: string) {
    return this.svc.deleteConfig(user.accountId, provider);
  }

  @Get('txs')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async listTxs(@CurrentUser() user: AuthenticatedUser, @Query() query: Record<string, unknown>) {
    return this.svc.listTxs(user.accountId, query);
  }

  @Get('txs/:id')
  @RequirePermission({ entity: 'settings', action: 'view' })
  async findTx(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.svc.findTx(user.accountId, id);
  }

  @Post('initiate')
  @RequirePermission({ entity: 'settings', action: 'create' })
  async initiate(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.svc.initiatePayment(user.accountId, body);
  }
}

/**
 * Public webhook receivers for Payme (JSON-RPC) + Click (form-encoded).
 * No JwtAuthGuard — providers don't carry our token. The accountId
 * is in the URL path; signature/HMAC verified inside handler.
 */
@Controller('payme')
export class PaymeWebhookController {
  constructor(@Inject(PaymentGatewayService) private readonly svc: PaymentGatewayService) {}

  @Post(':accountId')
  async webhook(
    @Param('accountId') accountId: string,
    @Headers('authorization') auth: string | undefined,
    @Body() body: PaymeRpcRequest<Record<string, unknown>>,
  ) {
    return this.svc.handlePaymeRpc(accountId, auth, body);
  }
}

@Controller('click')
export class ClickWebhookController {
  constructor(@Inject(PaymentGatewayService) private readonly svc: PaymentGatewayService) {}

  @Post(':accountId')
  async webhook(@Param('accountId') accountId: string, @Body() body: ClickCallbackParams) {
    return this.svc.handleClickCallback(accountId, body);
  }
}
