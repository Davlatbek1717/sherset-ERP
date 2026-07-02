import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CustomerOrderModule } from '../customer-order/customer-order.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { DemandController } from './demand.controller.js';
import { DemandService } from './demand.service.js';

@Module({
  imports: [
    AuthModule,
    AttributeMetadataModule,
    StockModule,
    CustomerOrderModule,
    WebhookModule,
    PrintTemplateModule,
    PermissionsModule,
  ],
  controllers: [DemandController],
  providers: [DemandService],
  exports: [DemandService],
})
export class DemandModule {}
