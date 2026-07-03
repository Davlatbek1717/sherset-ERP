import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationModule } from '../notification/notification.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { SupplyController } from './supply.controller.js';
import { SupplyService } from './supply.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    StockModule,
    PurchaseOrderModule,
    WebhookModule,
    PrintTemplateModule,
    NotificationModule,
  ],
  controllers: [SupplyController],
  providers: [SupplyService],
  exports: [SupplyService],
})
export class SupplyModule {}
