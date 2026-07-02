import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { EnterController } from './enter.controller.js';
import { EnterService } from './enter.service.js';

@Module({
  imports: [AuthModule, AttributeMetadataModule, StockModule, WebhookModule, PrintTemplateModule],
  controllers: [EnterController],
  providers: [EnterService],
  exports: [EnterService],
})
export class EnterModule {}
