import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { CustomerOrderController } from './customer-order.controller.js';
import { CustomerOrderService } from './customer-order.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    WebhookModule,
    PrintTemplateModule,
    StockModule,
    PermissionsModule,
  ],
  controllers: [CustomerOrderController],
  providers: [CustomerOrderService],
  exports: [CustomerOrderService],
})
export class CustomerOrderModule {}
