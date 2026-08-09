import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentInModule } from '../payment-in/payment-in.module.js';
import {
  ClickWebhookController,
  PaymeWebhookController,
  PaymentGatewayController,
} from './payment-gateway.controller.js';
import { PaymentGatewayService } from './payment-gateway.service.js';

@Module({
  // Faza 19 (`INT-02`): capture PaymentIn yozadi. `PaymentInModule` OSHKORA
  // import qilinadi — @Global'ga tayanish `global-di-injection-unguarded`
  // sinfidagi «prod'da API umuman ko'tarilmaydi» xatarini beradi.
  imports: [AuthModule, PaymentInModule],
  controllers: [PaymentGatewayController, PaymeWebhookController, ClickWebhookController],
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
