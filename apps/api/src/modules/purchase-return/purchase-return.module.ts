import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { PurchaseReturnController } from './purchase-return.controller.js';
import { PurchaseReturnService } from './purchase-return.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    StockModule,
    PurchaseOrderModule,
    WebhookModule,
    PrintTemplateModule,
  ],
  controllers: [PurchaseReturnController],
  providers: [PurchaseReturnService],
  exports: [PurchaseReturnService],
})
export class PurchaseReturnModule {}
