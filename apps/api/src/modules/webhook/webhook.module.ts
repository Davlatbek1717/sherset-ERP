import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { WebhookFireService } from './webhook-fire.service.js';
import { WebhookStockController } from './webhook-stock.controller.js';
import { WebhookStockService } from './webhook-stock.service.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';

@Module({
  imports: [AuthModule],
  controllers: [WebhookController, WebhookStockController],
  providers: [WebhookService, WebhookFireService, WebhookDeliveryService, WebhookStockService],
  exports: [WebhookService, WebhookFireService, WebhookStockService],
})
export class WebhookModule {}
