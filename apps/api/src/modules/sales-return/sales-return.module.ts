import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
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
    // P14 (H1): mijoz qaytarishi kontragent qarzini kamaytiradi.
    CounterpartyBalanceModule,
    WebhookModule,
    PrintTemplateModule,
    AttachmentModule,
  ],
  controllers: [SalesReturnController],
  providers: [SalesReturnService],
  exports: [SalesReturnService],
})
export class SalesReturnModule {}
