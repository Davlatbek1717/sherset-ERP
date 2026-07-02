import { Module, forwardRef } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { PaymentOutModule } from '../payment-out/payment-out.module.js';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { InvoiceInController } from './invoice-in.controller.js';
import { InvoiceInService } from './invoice-in.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    // forwardRef closes the PurchaseOrder ↔ PaymentOut ↔ InvoiceIn
    // tri-cycle; mirror on the service side via @Inject(forwardRef(...)).
    forwardRef(() => PurchaseOrderModule),
    // forwardRef on the InvoiceIn ↔ PaymentOut edge (PaymentOutModule already
    // forwardRef-imports InvoiceInModule) — used by «Создать → Исходящие платежи».
    forwardRef(() => PaymentOutModule),
    CounterpartyBalanceModule,
    WebhookModule,
  ],
  controllers: [InvoiceInController],
  providers: [InvoiceInService],
  exports: [InvoiceInService],
})
export class InvoiceInModule {}
