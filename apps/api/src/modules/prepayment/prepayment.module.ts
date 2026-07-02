import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PrepaymentController } from './prepayment.controller.js';
import { PrepaymentService } from './prepayment.service.js';

@Module({
  imports: [AuthModule, CounterpartyBalanceModule, PrintTemplateModule],
  controllers: [PrepaymentController],
  providers: [PrepaymentService],
  exports: [PrepaymentService],
})
export class PrepaymentModule {}
