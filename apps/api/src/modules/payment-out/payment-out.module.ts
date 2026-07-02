import { Module, forwardRef } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { InvoiceInModule } from '../invoice-in/invoice-in.module.js';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { PaymentOutController } from './payment-out.controller.js';
import { PaymentOutService } from './payment-out.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    // Tri-cycle PaymentOut ↔ InvoiceIn ↔ PurchaseOrder needs forwardRef
    // on each edge to satisfy ESM module-graph evaluation order.
    forwardRef(() => InvoiceInModule),
    forwardRef(() => PurchaseOrderModule),
    CounterpartyBalanceModule,
    WebhookModule,
  ],
  controllers: [PaymentOutController],
  providers: [PaymentOutService],
  exports: [PaymentOutService],
})
export class PaymentOutModule {}
