import { Module } from '@nestjs/common';
import { AttributeMetadataModule } from '../attribute-metadata/attribute-metadata.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { EnterModule } from '../enter/enter.module.js';
import { LossModule } from '../loss/loss.module.js';
import { StockModule } from '../stock/stock.module.js';
import { StoreAddressService } from './store-address.service.js';
import { StoreController } from './store.controller.js';
import { StoreService } from './store.service.js';

@Module({
  // EnterModule + LossModule: StoreAddressService.setCellStock «Umumiy sanash»
  // true-up posts an auto Enter/Loss (climart 2026-07-26 feature port).
  // StockModule (F7): sanashda hovuz/o'z-qoldiqdan joylashtirish deltalari.
  imports: [AuthModule, AttributeMetadataModule, EnterModule, LossModule, StockModule],
  controllers: [StoreController],
  providers: [StoreService, StoreAddressService],
  exports: [StoreService, StoreAddressService],
})
export class StoreModule {}
