import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceModule } from '../counterparty-balance/counterparty-balance.module.js';
import { PrintTemplateModule } from '../print-template/print-template.module.js';
import { PrepaymentReturnController } from './prepayment-return.controller.js';
import { PrepaymentReturnService } from './prepayment-return.service.js';

@Module({
  imports: [AuthModule, CounterpartyBalanceModule, PrintTemplateModule],
  controllers: [PrepaymentReturnController],
  providers: [PrepaymentReturnService],
  exports: [PrepaymentReturnService],
})
export class PrepaymentReturnModule {}
