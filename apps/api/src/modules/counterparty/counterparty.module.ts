import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyController } from './counterparty.controller.js';
import { CounterpartyService } from './counterparty.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CounterpartyController],
  providers: [CounterpartyService],
  exports: [CounterpartyService],
})
export class CounterpartyModule {}
