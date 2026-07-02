import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { StockModule } from '../stock/stock.module.js';
import { WorkOrderController } from './work-order.controller.js';
import { WorkOrderService } from './work-order.service.js';

@Module({
  imports: [AuthModule, StockModule, PrintTemplateModule],
  controllers: [WorkOrderController],
  providers: [WorkOrderService],
  exports: [WorkOrderService],
})
export class WorkOrderModule {}
