import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { PaymentOutModule } from '../payment-out/payment-out.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module.js';
import { PurchaseReturnModule } from '../purchase-return/purchase-return.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { SupplyController } from './supply.controller.js';
import { SupplyService } from './supply.service.js';

@Module({
  // PaymentOut + PurchaseReturn back the list-toolbar «Создать ▾» bulk
  // creators (bulk-create-payment-out / -cash-out / -purchase-return).
  imports: [
    AuthModule,
    AttributeMetadataModule,
    StockModule,
    CounterpartyBalanceModule,
    PurchaseOrderModule,
    PaymentOutModule,
    PurchaseReturnModule,
    WebhookModule,
    PrintTemplateModule,
    AttachmentModule,
  ],
  controllers: [SupplyController],
  providers: [SupplyService],
  exports: [SupplyService],
})
export class SupplyModule {}
