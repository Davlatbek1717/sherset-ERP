import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OnlineOrderController } from './online-order.controller.js';
import { OnlineOrderService } from './online-order.service.js';
import { OnlineOrderWebhookController } from './online-order.webhook.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [OnlineOrderController, OnlineOrderWebhookController],
  providers: [OnlineOrderService],
  exports: [OnlineOrderService],
})
export class OnlineOrderModule {}
