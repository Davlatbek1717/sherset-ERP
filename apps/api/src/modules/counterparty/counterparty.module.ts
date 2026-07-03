import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyTransactionsController } from './counterparty-transactions.controller.js';
import { CounterpartyTransactionsService } from './counterparty-transactions.service.js';
import { CounterpartyController } from './counterparty.controller.js';
import { CounterpartyService } from './counterparty.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CounterpartyController, CounterpartyTransactionsController],
  providers: [CounterpartyService, CounterpartyTransactionsService],
  exports: [CounterpartyService],
})
export class CounterpartyModule {}
