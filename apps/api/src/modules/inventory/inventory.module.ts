import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AuthModule, AttributeMetadataModule, StockModule, WebhookModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
