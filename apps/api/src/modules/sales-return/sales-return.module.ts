import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { CustomerOrderModule } from '../customer-order/customer-order.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { SalesReturnAcceptanceController } from './sales-return-acceptance.controller.js';
import { SalesReturnAcceptanceService } from './sales-return-acceptance.service.js';
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
  // G3 — qabul controlleri `SalesReturnController` dan KEYIN: `@Get(':id')`
  // bitta segmentni ushlaydi, `acceptance/...` esa uch/to'rt segment — mos
  // kelmaydi, lekin tartib aniq bo'lgani yaxshi.
  controllers: [SalesReturnController, SalesReturnAcceptanceController],
  providers: [SalesReturnService, SalesReturnAcceptanceService],
  exports: [SalesReturnService],
})
export class SalesReturnModule {}
