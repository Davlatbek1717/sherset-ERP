import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { BankController } from './bank.controller.js';
import { BankService } from './bank.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankIntegrationModule {}
