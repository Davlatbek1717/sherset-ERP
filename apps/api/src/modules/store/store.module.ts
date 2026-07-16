import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { StoreCellController } from './store-cell.controller.js';
import { StoreCellService } from './store-cell.service.js';
import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  imports: [AuthModule, AttributeMetadataModule],
  controllers: [StoreController, StoreCellController],
  providers: [StoreService, StoreCellService],
  exports: [StoreService],
})
export class StoreModule {}
