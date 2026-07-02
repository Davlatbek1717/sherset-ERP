import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { CounterpartyAdjustmentController } from './counterparty-adjustment.controller.js';
import { CounterpartyAdjustmentService } from './counterparty-adjustment.service.js';

@Module({
  imports: [AuthModule, CounterpartyBalanceModule, PrintTemplateModule],
  controllers: [CounterpartyAdjustmentController],
  providers: [CounterpartyAdjustmentService],
  exports: [CounterpartyAdjustmentService],
})
export class CounterpartyAdjustmentModule {}
