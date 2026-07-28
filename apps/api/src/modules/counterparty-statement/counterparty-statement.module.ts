import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartySettlementModule } from '../counterparty-settlement/counterparty-settlement.module.js';
import { CounterpartyStatementController } from './counterparty-statement.controller.js';
import { CounterpartyStatementService } from './counterparty-statement.service.js';

@Module({
  // AuthModule provides TokenService for JwtAuthGuard + the permission guard.
  imports: [PrismaModule, AuthModule, CounterpartySettlementModule],
  controllers: [CounterpartyStatementController],
  providers: [CounterpartyStatementService],
  exports: [CounterpartyStatementService],
})
export class CounterpartyStatementModule {}
