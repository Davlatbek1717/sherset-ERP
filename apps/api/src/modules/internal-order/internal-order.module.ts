import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { InternalOrderController } from './internal-order.controller.js';
import { InternalOrderService } from './internal-order.service.js';

@Module({
  imports: [AuthModule, PrintTemplateModule],
  controllers: [InternalOrderController],
  providers: [InternalOrderService],
  exports: [InternalOrderService],
})
export class InternalOrderModule {}
