import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { ProcessingOrderController } from './processing-order.controller.js';
import { ProcessingOrderService } from './processing-order.service.js';

@Module({
  imports: [AuthModule, PrintTemplateModule],
  controllers: [ProcessingOrderController],
  providers: [ProcessingOrderService],
  exports: [ProcessingOrderService],
})
export class ProcessingOrderModule {}
