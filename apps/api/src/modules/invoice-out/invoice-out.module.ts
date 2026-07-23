import { Module } from '@nestjs/common';
import { AttachmentModule } from '../attachment/attachment.module.js';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { CustomerOrderModule } from '../customer-order/customer-order.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { InvoiceOutOverdueService } from './invoice-out-overdue.service.js';
import { InvoiceOutController } from './invoice-out.controller.js';
import { InvoiceOutService } from './invoice-out.service.js';

@Module({
  // AttachmentModule backs :id/print-attachment («Отправить» composer PDFs).
  imports: [
    AuthModule,
    AttributeMetadataModule,
    CustomerOrderModule,
    CounterpartyBalanceModule,
    WebhookModule,
    PrintTemplateModule,
    AttachmentModule,
  ],
  controllers: [InvoiceOutController],
  providers: [InvoiceOutService, InvoiceOutOverdueService],
  exports: [InvoiceOutService],
})
export class InvoiceOutModule {}
