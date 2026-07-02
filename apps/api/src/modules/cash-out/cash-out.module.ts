import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { InvoiceInModule } from '../invoice-in/invoice-in.module.js';
import { MoneyModule } from '../money/money.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { CashOutController } from './cash-out.controller.js';
import { CashOutService } from './cash-out.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    InvoiceInModule,
    MoneyModule,
    CounterpartyBalanceModule,
    WebhookModule,
  ],
  controllers: [CashOutController],
  providers: [CashOutService],
  exports: [CashOutService],
})
export class CashOutModule {}
