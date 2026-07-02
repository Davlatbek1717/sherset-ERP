import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CommissionReportController } from './commission-report.controller.js';
import { CommissionReportService } from './commission-report.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CommissionReportController],
  providers: [CommissionReportService],
  exports: [CommissionReportService],
})
export class CommissionReportModule {}
