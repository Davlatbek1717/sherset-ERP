import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TaxRateController } from './tax-rate.controller.js';
import { TaxRateService } from './tax-rate.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TaxRateController],
  providers: [TaxRateService],
  exports: [TaxRateService],
})
export class TaxRateModule {}
