import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyBalanceController } from './counterparty-balance.controller.js';
import { CounterpartyBalanceService } from './counterparty-balance.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CounterpartyBalanceController],
  providers: [CounterpartyBalanceService],
  exports: [CounterpartyBalanceService],
})
export class CounterpartyBalanceModule {}
