import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CurrencyController } from './currency.controller.js';
import { CurrencyService } from './currency.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
