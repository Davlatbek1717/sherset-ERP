import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PriceListController } from './price-list.controller.js';
import { PriceListService } from './price-list.service.js';

@Module({
  imports: [AuthModule, PrintTemplateModule],
  controllers: [PriceListController],
  providers: [PriceListService],
  exports: [PriceListService],
})
export class PriceListModule {}
