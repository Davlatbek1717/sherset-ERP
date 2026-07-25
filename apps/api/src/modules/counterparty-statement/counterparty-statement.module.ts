import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CounterpartyStatementController } from './counterparty-statement.controller.js';
import { CounterpartyStatementService } from './counterparty-statement.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CounterpartyStatementController],
  providers: [CounterpartyStatementService],
  exports: [CounterpartyStatementService],
})
export class CounterpartyStatementModule {}
