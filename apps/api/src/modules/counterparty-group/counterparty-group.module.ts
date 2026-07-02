import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CounterpartyGroupController } from './counterparty-group.controller.js';
import { CounterpartyGroupService } from './counterparty-group.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CounterpartyGroupController],
  providers: [CounterpartyGroupService],
  exports: [CounterpartyGroupService],
})
export class CounterpartyGroupModule {}
