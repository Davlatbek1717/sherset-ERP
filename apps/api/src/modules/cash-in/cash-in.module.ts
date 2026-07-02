import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { InvoiceOutModule } from '../invoice-out/invoice-out.module.js';
import { MoneyModule } from '../money/money.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { CashInController } from './cash-in.controller.js';
import { CashInService } from './cash-in.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    InvoiceOutModule,
    MoneyModule,
    CounterpartyBalanceModule,
    WebhookModule,
  ],
  controllers: [CashInController],
  providers: [CashInService],
  exports: [CashInService],
})
export class CashInModule {}
