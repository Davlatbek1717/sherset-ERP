import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { CustomerOrderModule } from '../customer-order/customer-order.module.js';
import { InvoiceOutModule } from '../invoice-out/invoice-out.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { PaymentInController } from './payment-in.controller.js';
import { PaymentInService } from './payment-in.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    InvoiceOutModule,
    CustomerOrderModule,
    CounterpartyBalanceModule,
    WebhookModule,
  ],
  controllers: [PaymentInController],
  providers: [PaymentInService],
  exports: [PaymentInService],
})
export class PaymentInModule {}
