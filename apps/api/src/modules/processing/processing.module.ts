import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ProcessingController } from './processing.controller.js';
import { ProcessingService } from './processing.service.js';

@Module({
  imports: [AuthModule, StockModule, PrintTemplateModule],
  controllers: [ProcessingController],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
