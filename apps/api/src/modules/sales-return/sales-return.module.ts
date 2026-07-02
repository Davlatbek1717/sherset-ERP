import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerOrderModule } from '../customer-order/customer-order.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { SalesReturnController } from './sales-return.controller.js';
import { SalesReturnService } from './sales-return.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    StockModule,
    CustomerOrderModule,
    WebhookModule,
    PrintTemplateModule,
  ],
  controllers: [SalesReturnController],
  providers: [SalesReturnService],
  exports: [SalesReturnService],
})
export class SalesReturnModule {}
