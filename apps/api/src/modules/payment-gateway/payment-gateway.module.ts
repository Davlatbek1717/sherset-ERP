import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  ClickWebhookController,
  PaymeWebhookController,
  PaymentGatewayController,
} from './payment-gateway.controller.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentGatewayController, PaymeWebhookController, ClickWebhookController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
