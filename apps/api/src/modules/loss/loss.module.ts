import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { LossController } from './loss.controller.js';
import { LossService } from './loss.service.js';

@Module({
  imports: [AuthModule, AttributeMetadataModule, StockModule, WebhookModule],
  controllers: [LossController],
  providers: [LossService],
  exports: [LossService],
})
export class LossModule {}
