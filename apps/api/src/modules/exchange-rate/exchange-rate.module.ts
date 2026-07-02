import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CurrencyModule } from '../currency/currency.module.js';
import { ExchangeRateCronService } from './exchange-rate-cron.service.js';
import { ExchangeRateController } from './exchange-rate.controller.js';
import { ExchangeRateService } from './exchange-rate.service.js';

@Module({
  imports: [AuthModule, CurrencyModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateCronService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
