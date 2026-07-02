import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentInModule } from '../payment-in/payment-in.module.js';
import { PaymentOutModule } from '../payment-out/payment-out.module.js';
import { BankImportController } from './bank-import.controller.js';
import { BankImportService } from './bank-import.service.js';

@Module({
  imports: [AuthModule, PaymentInModule, PaymentOutModule],
  controllers: [BankImportController],
  providers: [BankImportService],
  exports: [BankImportService],
})
export class BankImportModule {}
