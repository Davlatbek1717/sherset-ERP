import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContractController } from './contract.controller.js';
import { ContractService } from './contract.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ContractController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
